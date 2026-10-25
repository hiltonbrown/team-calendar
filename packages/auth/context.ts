import "server-only";

import { readBetterAuthContext } from "./adapters/better-auth";
import { consumeAuthContextRateLimit } from "./adapters/better-auth-server";
import { permissionRequestSchema } from "./context-contract";
import { forwardAuthCookies, getAuthOrigins } from "./cookie-transport";
import type { PermissionRequest } from "./permissions";
import { authContextMode, authProvider } from "./selection";

async function dispatchContext(request: Request): Promise<Response> {
  if (authProvider() !== "better-auth" || authContextMode() !== "local") {
    return new Response(null, { status: 404 });
  }
  const { appOrigin, apiOrigin } = getAuthOrigins();
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin && origin !== apiOrigin) {
    return new Response(null, { status: 403 });
  }
  if (request.method === "POST" && !origin) {
    return new Response(null, { status: 403 });
  }
  if (!(await consumeAuthContextRateLimit(request))) {
    return new Response(null, {
      headers: { "retry-after": "60" },
      status: 429,
    });
  }
  const forwarded = forwardAuthCookies(request.headers, appOrigin);
  let permissions: PermissionRequest | undefined;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return new Response(null, { status: 415 });
    }
    const text = await request.text();
    if (text.length > 4096) {
      return new Response(null, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("permissions" in body) ||
      Object.keys(body).length !== 1
    ) {
      return new Response(null, { status: 400 });
    }
    const parsed = permissionRequestSchema.safeParse(body.permissions);
    if (!parsed.success) {
      return new Response(null, { status: 400 });
    }
    permissions = parsed.data;
  }
  const result = await readBetterAuthContext(forwarded, permissions);
  const responseHeaders = new Headers({ "cache-control": "no-store, private" });
  for (const value of result.responseHeaders.getSetCookie()) {
    responseHeaders.append("set-cookie", value);
  }
  return Response.json(
    { context: result.context },
    { headers: responseHeaders }
  );
}

async function resolveContext(request: Request): Promise<Response> {
  const response = await dispatchContext(request);
  response.headers.set("cache-control", "no-store, private");
  return response;
}

export const GET = resolveContext;
export const POST = resolveContext;
