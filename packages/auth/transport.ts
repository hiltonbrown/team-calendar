import "server-only";

import { headers } from "next/headers";
import { forwardAuthCookies, getAuthOrigins } from "./cookie-transport";
import { authContextMode } from "./selection";

export async function getSessionAuthorizationHeaders(): Promise<Record<
  string,
  string
> | null> {
  const { appOrigin } = getAuthOrigins();
  const forwarded = forwardAuthCookies(await headers(), appOrigin);
  const cookie = forwarded.get("cookie");
  return cookie ? { Cookie: cookie, Origin: appOrigin } : null;
}

export { proxyApiRequest } from "./api-proxy";

/** Streaming handlers revalidate explicit request cookies after headers are sent. */
export async function getRequestAuthContext(requestHeaders: Headers) {
  if (authContextMode() === "remote") {
    const { readRemoteContext } = await import("./adapters/remote-context.js");
    return readRemoteContext(requestHeaders);
  }
  const { readBetterAuthContext } = await import("./adapters/better-auth.js");
  return readBetterAuthContext(requestHeaders);
}
