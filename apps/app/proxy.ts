import { authMiddleware, createRouteMatcher } from "@repo/auth/proxy";
import { type NextRequest, NextResponse } from "next/server";
import { getPublicApiOrigin } from "./lib/public-api-url";

export const REPORTING_ENDPOINTS_HEADER = 'csp-endpoint="/api/csp-report"';

export const isPublicAppRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/csp-report",
  "/__clerk(.*)",
]);

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDev = process.env.NODE_ENV === "development"
): string {
  const apiOrigin = getPublicApiOrigin();

  const scriptSrcTokens = [
    "'self'",
    `'nonce-${nonce}'`,
    isDev ? "'unsafe-eval'" : null,
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    "https://challenges.cloudflare.com",
    "https://va.vercel-scripts.com",
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
  ].filter((token): token is string => Boolean(token));

  const connectSrcTokens = [
    "'self'",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    "https://*.sentry.io",
    "https://us.i.posthog.com",
    "https://*.posthog.com",
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://*.googletagmanager.com",
    apiOrigin,
  ].filter((token): token is string => Boolean(token));

  const imgSrcTokens = [
    "'self'",
    "data:",
    "blob:",
    "https://img.clerk.com",
    "https://*.google-analytics.com",
    "https://*.googletagmanager.com",
  ];

  const frameSrcTokens = [
    "https://challenges.cloudflare.com",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrcTokens.join(" ")}`,
    `connect-src ${connectSrcTokens.join(" ")}`,
    `img-src ${imgSrcTokens.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    `frame-src ${frameSrcTokens.join(" ")}`,
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
  ].join("; ");
}

export function handleProxyWithNonce(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS_HEADER);

  return response;
}

export default authMiddleware(async (auth, request) => {
  if (!isPublicAppRoute(request)) {
    await auth.protect();
  }
  return handleProxyWithNonce(request);
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
