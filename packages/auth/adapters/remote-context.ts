import "server-only";

import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { type AuthContext, authContextSchema } from "../context-contract";
import {
  authSessionCookieNames,
  forwardAuthCookies,
  getAuthOrigins,
} from "../cookie-transport";
import type { PermissionRequest } from "../permissions";

const resolverResponse = z
  .object({ context: authContextSchema.nullable() })
  .strict();

export async function readRemoteContext(
  requestHeaders: Headers,
  permissions?: PermissionRequest
): Promise<{ context: AuthContext | null; responseHeaders: Headers }> {
  const { appOrigin, apiOrigin } = getAuthOrigins();
  const forwarded = forwardAuthCookies(requestHeaders, appOrigin);
  if (!forwarded.has("cookie")) {
    return { context: null, responseHeaders: new Headers() };
  }
  forwarded.set("origin", apiOrigin);
  if (permissions) {
    forwarded.set("content-type", "application/json");
  }
  const response = await fetch(new URL("/api/auth-context", appOrigin), {
    ...(permissions ? { body: JSON.stringify({ permissions }) } : {}),
    cache: "no-store",
    headers: forwarded,
    method: permissions ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Auth context resolver failed (${response.status})`);
  }
  const body = await response.text();
  if (body.length > 16_384) {
    throw new Error("Auth context response exceeds the permitted size");
  }
  const { context } = resolverResponse.parse(JSON.parse(body));
  if (context && Date.parse(context.expiresAt) <= Date.now()) {
    return { context: null, responseHeaders: new Headers() };
  }
  const responseHeaders = new Headers();
  const allowedCookies = authSessionCookieNames(appOrigin);
  for (const value of response.headers.getSetCookie()) {
    const parsed = parseSetCookieHeader(value);
    if (
      parsed.size !== 1 ||
      [...parsed.keys()].some((name) => !allowedCookies.has(name))
    ) {
      throw new Error("Auth context resolver returned an unexpected cookie");
    }
    responseHeaders.append("set-cookie", value);
  }
  return { context, responseHeaders };
}

export async function readRemoteAuthContext(permissions?: PermissionRequest) {
  const result = await readRemoteContext(await headers(), permissions);
  if (result.responseHeaders.has("set-cookie")) {
    const store = await cookies();
    for (const value of result.responseHeaders.getSetCookie()) {
      for (const [name, attributes] of parseSetCookieHeader(value)) {
        store.set(name, attributes.value, toCookieOptions(attributes));
      }
    }
  }
  return result.context;
}
