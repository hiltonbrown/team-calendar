import { getCurrentUser, requireAccount } from "@repo/auth/helpers";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { pollNotificationStream } from "@repo/notifications";
import { log } from "@repo/observability/log";

type StreamEntry = Awaited<ReturnType<typeof pollNotificationStream>>[number];

const ACTIVE_POLL_DELAY_MS = 2000;
const IDLE_POLL_DELAY_MS = 10_000;
const IDLE_THRESHOLD_MS = 60_000;
const KEEP_ALIVE_INTERVAL_MS = 25_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

const REDIS_STREAM_ID_PATTERN = /^\d+-\d+$/;

const encoder = new TextEncoder();

function formatSseEvent(entry: StreamEntry): Uint8Array {
  return encoder.encode(
    `id: ${entry.id}\nevent: ${entry.event.type}\ndata: ${JSON.stringify(entry.event.payload)}\n\n`
  );
}

function formatSseComment(comment: string): Uint8Array {
  return encoder.encode(`: ${comment}\n\n`);
}

function calculateNextPollDelay(lastEventAt: number): number {
  return Date.now() - lastEventAt >= IDLE_THRESHOLD_MS
    ? IDLE_POLL_DELAY_MS
    : ACTIVE_POLL_DELAY_MS;
}

function allowedOrigin(requestOrigin: string | null): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!(requestOrigin && appUrl)) {
    return null;
  }
  try {
    return new URL(appUrl).origin === requestOrigin ? requestOrigin : null;
  } catch {
    return null;
  }
}

/**
 * Validates and resolves the starting stream position.
 *
 * If the browser provides a valid Last-Event-ID header on reconnect, we resume from that position.
 * When no position is available (or the header is malformed), we fall back to a wall-clock timestamp.
 *
 * Note: this stream provides live notification delivery, not durable replay across long disconnections.
 * Persisted replay is a separate product and storage decision.
 */
function resolveInitialLastId(lastEventIdHeader: string | null): string {
  if (lastEventIdHeader && REDIS_STREAM_ID_PATTERN.test(lastEventIdHeader)) {
    return lastEventIdHeader;
  }
  return `${Date.now()}-0`;
}

interface StreamContext {
  accountId: string;
  initialLastId: string;
  userId: string;
}

class NotificationStreamSession {
  private closed: boolean;
  private consecutiveFailures: number;
  private readonly context: StreamContext;
  private readonly controller: ReadableStreamDefaultController<Uint8Array>;
  private keepAliveTimer: ReturnType<typeof setInterval> | null;
  private lastEventAt: number;
  private lastId: string;
  private pollTimer: ReturnType<typeof setTimeout> | null;
  private polling: boolean;

  constructor(
    context: StreamContext,
    controller: ReadableStreamDefaultController<Uint8Array>
  ) {
    this.closed = false;
    this.consecutiveFailures = 0;
    this.context = context;
    this.controller = controller;
    this.keepAliveTimer = null;
    this.lastEventAt = Date.now();
    this.lastId = context.initialLastId;
    this.pollTimer = null;
    this.polling = false;
  }

  start(): void {
    this.safeEnqueue(formatSseComment("connected"));
    this.poll();
    this.keepAliveTimer = setInterval(() => {
      this.safeEnqueue(formatSseComment("keep-alive"));
    }, KEEP_ALIVE_INTERVAL_MS);
  }

  cancel(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private safeEnqueue(chunk: Uint8Array): void {
    if (this.closed) {
      return;
    }
    try {
      this.controller.enqueue(chunk);
    } catch {
      this.cleanup();
    }
  }

  private terminateWithError(error: unknown): void {
    if (this.closed) {
      return;
    }
    this.cleanup();
    try {
      this.controller.error(
        error instanceof Error
          ? error
          : new Error("Notification stream polling failed")
      );
    } catch {
      // Controller already errored or closed.
    }
  }

  private async poll(): Promise<void> {
    if (this.closed || this.polling) {
      return;
    }
    this.polling = true;
    try {
      await this.performPoll();
    } catch (error) {
      this.handlePollFailure(error);
    } finally {
      this.polling = false;
    }
  }

  private async performPoll(): Promise<void> {
    const events = await pollNotificationStream(
      {
        accountId: this.context.accountId,
        userId: this.context.userId,
      },
      this.lastId
    );

    if (this.closed) {
      return;
    }

    this.consecutiveFailures = 0;
    if (events.length > 0) {
      this.lastEventAt = Date.now();
      for (const entry of events) {
        this.lastId = entry.id;
        this.safeEnqueue(formatSseEvent(entry));
      }
    }

    this.scheduleNextPoll(calculateNextPollDelay(this.lastEventAt));
  }

  private handlePollFailure(error: unknown): void {
    if (this.closed) {
      return;
    }
    this.consecutiveFailures += 1;
    log.warn("Notification stream poll failed", {
      accountId: this.context.accountId,
      consecutiveFailures: this.consecutiveFailures,
      error: error instanceof Error ? error.message : String(error),
      userId: this.context.userId,
    });

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
      log.error("Notification stream closing after consecutive poll failures", {
        accountId: this.context.accountId,
        consecutiveFailures: this.consecutiveFailures,
        userId: this.context.userId,
      });
      this.terminateWithError(error);
      return;
    }

    this.scheduleNextPoll(ACTIVE_POLL_DELAY_MS);
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.closed) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      this.poll();
    }, delayMs);
  }
}

export async function GET(request: Request): Promise<Response> {
  assertNoTenantTransaction("GET");
  let accountId: string;
  try {
    accountId = await requireAccount();
  } catch {
    return Response.json(
      {
        error: { code: "unauthorised", message: "Not authenticated" },
        ok: false,
      },
      { status: 401 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: { code: "unauthorised", message: "User not found" }, ok: false },
      { status: 401 }
    );
  }

  let session: NotificationStreamSession | null = null;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      session?.cancel();
    },
    start(controller) {
      session = new NotificationStreamSession(
        {
          accountId,
          initialLastId: resolveInitialLastId(
            request.headers.get("last-event-id")
          ),
          userId: user.id,
        },
        controller
      );
      session.start();
    },
  });

  const origin = allowedOrigin(request.headers.get("origin"));
  const headers: Record<string, string> = {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers.Vary = "Origin";
  }

  return new Response(stream, { headers });
}
