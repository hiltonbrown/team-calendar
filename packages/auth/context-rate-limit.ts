import { createHash } from "node:crypto";
import { forwardAuthCookies } from "./cookie-transport";

/** Session hashes isolate polling users; the address bucket bounds arbitrary tokens. */
export function authContextBuckets(
  request: Request,
  appOrigin: string,
  vercel: boolean
) {
  const address = vercel
    ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
    : "development";
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const cookie = forwardAuthCookies(request.headers, appOrigin).get("cookie");
  return cookie
    ? [
        { key: `auth-context:address:${digest(address)}`, limit: 2000 },
        { key: `auth-context:session:${digest(cookie)}`, limit: 100 },
      ]
    : [{ key: `auth-context:anonymous:${digest(address)}`, limit: 100 }];
}
