import "server-only";

import { headers } from "next/headers";
import { readSessionAuthorizationHeaders } from "./adapters/clerk";
import { forwardAuthCookies, getAuthOrigins } from "./cookie-transport";
import { authProvider } from "./selection";

export async function getSessionAuthorizationHeaders(): Promise<Record<
  string,
  string
> | null> {
  if (authProvider() === "clerk") {
    return readSessionAuthorizationHeaders();
  }
  const { appOrigin } = getAuthOrigins();
  const forwarded = forwardAuthCookies(await headers(), appOrigin);
  const cookie = forwarded.get("cookie");
  return cookie ? { Cookie: cookie, Origin: appOrigin } : null;
}
