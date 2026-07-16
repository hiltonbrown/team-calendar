import { currentUser, requireOrg } from "@repo/auth/helpers";
import { database } from "@repo/database";
import { pollNotificationStream } from "@repo/notifications";
import { z } from "zod";

const QuerySchema = z.object({
  organisationId: z.string().uuid(),
});

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

export async function GET(request: Request): Promise<Response> {
  let clerkOrgId: string;
  try {
    clerkOrgId = await requireOrg();
  } catch {
    return Response.json(
      {
        ok: false,
        error: { code: "unauthorised", message: "Not authenticated" },
      },
      { status: 401 }
    );
  }

  const user = await currentUser();
  if (!user) {
    return Response.json(
      { ok: false, error: { code: "unauthorised", message: "User not found" } },
      { status: 401 }
    );
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: { code: "bad_request", message: "Invalid stream" } },
      { status: 400 }
    );
  }

  const organisation = await database.organisation.findFirst({
    where: {
      clerk_org_id: clerkOrgId,
      id: parsed.data.organisationId,
    },
    select: { id: true },
  });
  if (!organisation) {
    return Response.json(
      {
        ok: false,
        error: { code: "forbidden", message: "Invalid organisation" },
      },
      { status: 403 }
    );
  }

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array): void => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller already closed; stop pushing and release resources.
          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
          }
          if (poll) {
            clearInterval(poll);
            poll = null;
          }
        }
      };

      safeEnqueue(encoder.encode(": connected\n\n"));
      let lastId = `${Date.now()}-0`;
      let polling = false;
      const pollEvents = async (): Promise<void> => {
        if (polling) {
          return;
        }
        polling = true;
        try {
          const events = await pollNotificationStream(
            { organisationId: organisation.id, userId: user.id },
            lastId
          );
          for (const entry of events) {
            lastId = entry.id;
            safeEnqueue(
              encoder.encode(
                `event: ${entry.event.type}\ndata: ${JSON.stringify(entry.event.payload)}\n\n`
              )
            );
          }
        } finally {
          polling = false;
        }
      };
      pollEvents().catch(() => undefined);
      poll = setInterval(() => {
        pollEvents().catch(() => undefined);
      }, 2000);
      keepAlive = setInterval(() => {
        safeEnqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);
    },
    cancel() {
      if (keepAlive) {
        clearInterval(keepAlive);
      }
      if (poll) {
        clearInterval(poll);
      }
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
