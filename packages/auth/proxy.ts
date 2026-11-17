import {
  type NextFetchEvent,
  type NextProxy,
  type NextRequest,
  NextResponse,
} from "next/server";
import { authSessionCookieNames, getAuthOrigins } from "./cookie-transport";
import { authContextMode } from "./selection";

export interface RoutingContext {
  requireSessionCookie: () => void;
}

type ProxyHandler = (
  context: RoutingContext,
  request: NextRequest,
  event: NextFetchEvent
) => ReturnType<NextProxy>;

class SessionCookieRequired extends Error {}
class OriginDenied extends Error {}

function enforceApiOrigin(request: NextRequest, appOrigin: string) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== appOrigin) ||
    (!["GET", "HEAD"].includes(request.method) && origin !== appOrigin)
  ) {
    throw new OriginDenied();
  }
}

/** Cookie presence routes a request; server helpers perform all authorisation. */
export const authProxy =
  (handler: ProxyHandler): NextProxy =>
  async (request, event) => {
    const remote = authContextMode() === "remote";
    const { appOrigin } = getAuthOrigins();
    const origin = request.headers.get("origin");
    let protectedRoute = false;
    let response: Awaited<ReturnType<NextProxy>>;
    try {
      response = await handler(
        {
          requireSessionCookie: () => {
            protectedRoute = true;
            if (remote) {
              enforceApiOrigin(request, appOrigin);
              if (request.method === "OPTIONS") {
                return;
              }
            }
            const names = authSessionCookieNames(appOrigin);
            if (![...names].some((name) => request.cookies.get(name)?.value)) {
              throw new SessionCookieRequired();
            }
          },
        },
        request,
        event
      );
    } catch (error) {
      if (error instanceof OriginDenied) {
        return new Response(null, { status: 403 });
      }
      if (!(error instanceof SessionCookieRequired)) {
        throw error;
      }
      if (remote || request.nextUrl.pathname.startsWith("/api/")) {
        response = Response.json({ error: "Unauthorised" }, { status: 401 });
      } else {
        const signIn = new URL("/sign-in", appOrigin);
        signIn.searchParams.set(
          "returnTo",
          `${request.nextUrl.pathname}${request.nextUrl.search}`
        );
        response = NextResponse.redirect(signIn);
      }
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
    if (remote && origin === appOrigin) {
      output.headers.set("access-control-allow-origin", appOrigin);
      output.headers.set("access-control-allow-credentials", "true");
      output.headers.append("vary", "Origin");
    }
    return output;
  };

export const createRouteMatcher = (
  routes: (string | RegExp)[]
): ((request: NextRequest) => boolean) => {
  // Patterns are repository constants, never request-supplied expressions.
  const patterns = routes.map((route) =>
    typeof route === "string" ? new RegExp(`^${route}$`) : route
  );
  return (request) =>
    patterns.some((pattern) => pattern.test(request.nextUrl.pathname));
};
