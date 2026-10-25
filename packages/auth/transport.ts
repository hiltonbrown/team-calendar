import "server-only";

import { headers } from "next/headers";
import { forwardAuthCookies, getAuthOrigins } from "./cookie-transport";
import { authContextMode, authProvider } from "./selection";

export async function getSessionAuthorizationHeaders(): Promise<Record<
  string,
  string
> | null> {
  const { appOrigin } = getAuthOrigins();
  const forwarded = forwardAuthCookies(
    await headers(),
    appOrigin,
    authProvider()
  );
  const cookie = forwarded.get("cookie");
  return cookie ? { Cookie: cookie, Origin: appOrigin } : null;
}

export { proxyApiRequest } from "./api-proxy";

/** Streaming handlers revalidate explicit request cookies after headers are sent. */
export async function getRequestAuthContext(requestHeaders: Headers) {
  if (authProvider() === "clerk") {
    const { getCurrentUser, getSession } = await import("./helpers.js");
    const session = await getSession();
    const user = await getCurrentUser();
    return {
      context: session && user ? { expiresAt: null, session, user } : null,
      responseHeaders: new Headers(),
    };
  }
  if (authContextMode() === "remote") {
    const { readRemoteContext } = await import("./adapters/remote-context.js");
    return readRemoteContext(requestHeaders);
  }
  const { readBetterAuthContext } = await import("./adapters/better-auth.js");
  return readBetterAuthContext(requestHeaders);
}
