import { authMiddleware, createRouteMatcher } from "@repo/auth/proxy";
import type { NextProxy } from "next/server";

export const isPublicApiRoute = createRouteMatcher([
  "/ical(.*)",
  "/api/inngest(.*)",
  "/webhooks/auth",
  "/webhooks/payments",
  "/api/xero/oauth/callback",
  "/cron/keep-alive",
  "/health",
  "/__clerk(.*)",
]);

export default authMiddleware(async (auth, request) => {
  if (!isPublicApiRoute(request)) {
    await auth.protect();
  }
}) as unknown as NextProxy;

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
