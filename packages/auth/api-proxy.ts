import "server-only";

import { parseSetCookieHeader } from "better-auth/cookies";
import {
  authSessionCookieNames,
  forwardAuthCookies,
  getAuthOrigins,
} from "./cookie-transport";

const routes: readonly { methods: readonly string[]; path: RegExp }[] = [
  { methods: ["GET"], path: /^\/api\/notifications\/stream$/ },
  {
    methods: ["POST"],
    path: /^\/api\/notifications\/[a-f0-9-]{36}\/mark-read$/i,
  },
  { methods: ["POST"], path: /^\/api\/sync\/dispatch$/ },
  { methods: ["POST"], path: /^\/api\/support\/github-issue$/ },
  { methods: ["POST"], path: /^\/api\/availability$/ },
  {
    methods: ["PATCH", "DELETE"],
    path: /^\/api\/availability\/[a-f0-9-]{36}$/i,
  },
  { methods: ["GET"], path: /^\/api\/xero\/oauth\/(?:start|callback)$/ },
];
const responseHeaderNames = [
  "content-type",
  "cache-control",
  "retry-after",
  "x-accel-buffering",
];
const oauthRedirectOrigins = new Set([
  "https://login.xero.com",
  "https://identity.xero.com",
]);
const nonceName = "xero_oauth_nonce";

function forwardNonce(request: Request, forwarded: Headers) {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${nonceName}=`));
  if (values.length > 1) {
    throw new Error("Duplicate OAuth nonce cookie");
  }
  if (values[0]) {
    forwarded.set(
      "cookie",
      [forwarded.get("cookie"), values[0]].filter(Boolean).join("; ")
    );
  }
}

function resolveProxyRequest(request: Request):
  | {
      app: URL;
      appOrigin: string;
      apiOrigin: string;
      incoming: URL;
    }
  | Response {
  const { appOrigin, apiOrigin } = getAuthOrigins();
  const incoming = new URL(request.url);
  const app = new URL(appOrigin);
  const api = new URL(apiOrigin);
  const needsProxy =
    app.protocol === "https:" &&
    app.hostname !== api.hostname &&
    !(
      appOrigin === "https://app.teamcalendar.online" &&
      apiOrigin === "https://api.teamcalendar.online"
    );
  if (!needsProxy || incoming.origin !== appOrigin) {
    return new Response(null, { status: 404 });
  }
  const match = routes.find((route) => route.path.test(incoming.pathname));
  if (!match) {
    return new Response(null, { status: 404 });
  }
  if (!match.methods.includes(request.method)) {
    return new Response(null, { status: 405 });
  }
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== appOrigin) ||
    (request.method !== "GET" && origin !== appOrigin)
  ) {
    return new Response(null, { status: 403 });
  }
  return { apiOrigin, app, appOrigin, incoming };
}

function copyResponseCookies(
  upstream: Response,
  headers: Headers,
  app: URL,
  oauth: boolean
): boolean {
  const allowedCookies = new Set([
    ...authSessionCookieNames(app.origin),
    ...(oauth ? [nonceName] : []),
  ]);
  for (const value of upstream.headers.getSetCookie()) {
    const parsed = parseSetCookieHeader(value);
    if (parsed.size !== 1) {
      return false;
    }
    for (const [name, attributes] of parsed) {
      if (
        !allowedCookies.has(name) ||
        (attributes.domain && attributes.domain !== app.hostname)
      ) {
        return false;
      }
    }
    headers.append("set-cookie", value);
  }
  return true;
}

function copyResponseHeaders(
  upstream: Response,
  app: URL,
  apiOrigin: string,
  oauth: boolean
): Headers | null {
  const headers = new Headers({ "cache-control": "no-store, private" });
  for (const name of responseHeaderNames) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  const location = upstream.headers.get("location");
  if (location) {
    const redirect = new URL(location, apiOrigin);
    if (redirect.origin === apiOrigin) {
      redirect.host = app.host;
    } else if (
      redirect.origin !== app.origin &&
      !(oauth && oauthRedirectOrigins.has(redirect.origin))
    ) {
      return null;
    }
    headers.set("location", redirect.href);
  }
  return copyResponseCookies(upstream, headers, app, oauth) ? headers : null;
}

/** Fixed paired API paths preserve host-only Preview cookies and SSE streaming. */
export async function proxyApiRequest(request: Request): Promise<Response> {
  const route = resolveProxyRequest(request);
  if (route instanceof Response) {
    return route;
  }
  const { app, appOrigin, apiOrigin, incoming } = route;
  const forwarded = forwardAuthCookies(request.headers, appOrigin);
  forwarded.set("origin", appOrigin);
  const oauth = incoming.pathname.startsWith("/api/xero/oauth/");
  if (oauth) {
    forwardNonce(request, forwarded);
  }
  const eventId = request.headers.get("last-event-id");
  if (eventId && eventId.length <= 100) {
    forwarded.set("last-event-id", eventId);
  }
  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    body = await request.arrayBuffer();
    if (body.byteLength > 65_536) {
      return new Response(null, { status: 413 });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return new Response(null, { status: 415 });
    }
    forwarded.set("content-type", "application/json");
  }
  const target = new URL(incoming.pathname, apiOrigin);
  target.search = incoming.search;
  const streaming = incoming.pathname === "/api/notifications/stream";
  const signal = streaming
    ? request.signal
    : AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      body,
      cache: "no-store",
      headers: forwarded,
      method: request.method,
      redirect: "manual",
      signal,
    });
  } catch {
    return Response.json(
      { error: "The API could not be reached" },
      { status: 502 }
    );
  }
  const headers = copyResponseHeaders(upstream, app, apiOrigin, oauth);
  if (!headers) {
    return new Response(null, { status: 502 });
  }
  return new Response(upstream.body, {
    headers,
    status: upstream.status,
    statusText: upstream.statusText,
  });
}
