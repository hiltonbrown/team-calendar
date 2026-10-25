import {
  clerkMiddleware,
  createRouteMatcher as clerkRouteMatcher,
} from "@clerk/nextjs/server";
import {
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from "next/server";
import { getAuthOrigins } from "./cookie-transport";
import { authContextMode, authProvider } from "./selection";

export interface AuthenticationContext {
  requireAuthentication: () => Promise<void>;
}

type MiddlewareHandler = (
  context: AuthenticationContext,
  request: NextRequest,
  event: NextFetchEvent
) => ReturnType<NextMiddleware>;

class AuthenticationRequired extends Error {}
class OriginDenied extends Error {}

function enforceApiOrigin(request: NextRequest, appOrigin: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin) {
    throw new OriginDenied();
  }
  if (!["GET", "HEAD"].includes(request.method) && origin !== appOrigin) {
    throw new OriginDenied();
  }
}

function authenticationFailure(
  error: unknown,
  request: NextRequest,
  remote: boolean,
  appOrigin: string
) {
  if (error instanceof OriginDenied) {
    return new Response(null, { status: 403 });
  }
  if (!(error instanceof AuthenticationRequired)) {
    throw error;
  }
  if (remote || request.nextUrl.pathname.startsWith("/api/")) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  const signIn = new URL("/sign-in", appOrigin);
  signIn.searchParams.set("returnTo", request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export const authMiddleware = (handler: MiddlewareHandler): NextMiddleware => {
  const clerk = clerkMiddleware((source, request, event) =>
    handler(
      {
        requireAuthentication: async () => {
          await source.protect();
        },
      },
      request,
      event
    )
  );
  return async (request, event) => {
    if (authProvider() === "clerk") {
      return clerk(request, event);
    }
    const remote = authContextMode() === "remote";
    const origin = request.headers.get("origin");
    const { appOrigin } = getAuthOrigins();
    let refreshHeaders = new Headers();
    let protectedRoute = false;
    let response: Awaited<ReturnType<NextMiddleware>>;
    try {
      response = await handler(
        {
          requireAuthentication: async () => {
            protectedRoute = true;
            if (remote) {
              enforceApiOrigin(request, appOrigin);
              if (request.method === "OPTIONS") {
                return;
              }
            }
            const result = remote
              ? await (
                  await import("./adapters/remote-context.js")
                ).readRemoteContext(request.headers)
              : await (
                  await import("./adapters/better-auth.js")
                ).readBetterAuthContext(request.headers);
            refreshHeaders = result.responseHeaders;
            if (
              !(
                result.context?.session.userId &&
                result.context.user.emailVerified
              )
            ) {
              throw new AuthenticationRequired();
            }
          },
        },
        request,
        event
      );
    } catch (error) {
      response = authenticationFailure(error, request, remote, appOrigin);
    }
    const output =
      remote && protectedRoute && request.method === "OPTIONS"
        ? new Response(null, {
            headers: {
              "access-control-allow-headers": "content-type, last-event-id",
              "access-control-allow-methods":
                "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            },
            status: 204,
          })
        : (response ?? NextResponse.next());
    for (const cookie of refreshHeaders.getSetCookie()) {
      output.headers.append("set-cookie", cookie);
    }
    if (remote && origin === appOrigin) {
      output.headers.set("access-control-allow-origin", appOrigin);
      output.headers.set("access-control-allow-credentials", "true");
      output.headers.append("vary", "Origin");
    }
    return output;
  };
};

export const createRouteMatcher = (
  routes: (string | RegExp)[]
): ((request: NextRequest) => boolean) => clerkRouteMatcher(routes);
