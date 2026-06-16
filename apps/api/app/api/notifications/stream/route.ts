import { currentUser, requireOrg } from "@repo/auth/helpers";
import { database } from "@repo/database";
import { subscribeToNotificationStream } from "@repo/notifications";
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
  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array): void => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller already closed; stop pushing and release resources.
          unsubscribe?.();
          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
          }
        }
      };

      safeEnqueue(encoder.encode(": connected\n\n"));
      unsubscribe = subscribeToNotificationStream(
        { organisationId: organisation.id, userId: user.id },
        (event) => {
          safeEnqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`
            )
          );
        }
      );
      keepAlive = setInterval(() => {
        safeEnqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);
    },
    cancel() {
      unsubscribe?.();
      if (keepAlive) {
        clearInterval(keepAlive);
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
