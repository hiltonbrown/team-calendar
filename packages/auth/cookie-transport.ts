import { z } from "zod";

function exactOrigin(value: string): string {
  const parsed = z.url().parse(value);
  const url = new URL(parsed);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && url.hostname === "localhost"))
  ) {
    throw new Error(
      "Auth origins must be exact HTTPS origins or local HTTP origins"
    );
  }
  return url.origin;
}

export function getAuthOrigins(
  envVars: Record<string, string | undefined> = process.env
) {
  const preview = envVars.VERCEL_ENV === "preview";
  const app = preview
    ? envVars.TC_APP_CANDIDATE_URL
    : envVars.NEXT_PUBLIC_APP_URL;
  const api = preview
    ? envVars.TC_API_CANDIDATE_URL
    : envVars.NEXT_PUBLIC_API_URL;
  if (preview && !(app && api)) {
    throw new Error("Preview auth requires the exact app/API candidate pair");
  }
  const local = envVars.NODE_ENV !== "production";
  const appOrigin = exactOrigin(app ?? (local ? "http://localhost:3000" : ""));
  const apiOrigin = exactOrigin(api ?? (local ? "http://localhost:3002" : ""));
  if (appOrigin === apiOrigin) {
    throw new Error("App and API auth origins must be distinct");
  }
  if (
    preview &&
    (appOrigin !== exactOrigin(envVars.NEXT_PUBLIC_APP_URL ?? "") ||
      apiOrigin !== exactOrigin(envVars.NEXT_PUBLIC_API_URL ?? ""))
  ) {
    throw new Error(
      "Preview auth candidate pair does not match deployment configuration"
    );
  }
  return { apiOrigin, appOrigin };
}

export function authSessionCookieNames(
  appOrigin: string
): ReadonlySet<string> {
  const secure = new URL(appOrigin).protocol === "https:";
  const prefix = secure ? "team-calendar-auth" : "team-calendar-dev-auth";
  return new Set([`${secure ? "__Secure-" : ""}${prefix}.session_token`]);
}

export function forwardAuthCookies(
  requestHeaders: Headers,
  appOrigin: string
): Headers {
  const result = new Headers();
  const cookie = requestHeaders.get("cookie");
  if (!cookie) {
    return result;
  }
  if (cookie.length > 16_384) {
    throw new Error("Auth cookie header exceeds the permitted size");
  }
  const allowed = authSessionCookieNames(appOrigin);
  const seen = new Set<string>();
  const forwarded: string[] = [];
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    const name = part.slice(0, separator).trim();
    if (separator < 1 || !allowed.has(name)) {
      continue;
    }
    if (seen.has(name)) {
      throw new Error("Duplicate auth cookie");
    }
    seen.add(name);
    forwarded.push(`${name}=${part.slice(separator + 1).trim()}`);
  }
  if (forwarded.length > 0) {
    result.set("cookie", forwarded.join("; "));
  }
  return result;
}
