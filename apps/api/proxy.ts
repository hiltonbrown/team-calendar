import { authProxy, createRouteMatcher } from "@repo/auth/proxy";

export const isPublicApiRoute = createRouteMatcher([
  "/ical(.*)",
  "/api/inngest(.*)",
  "/api/early-access",
  "/api/contact",
  "/webhooks/payments",
  "/api/xero/oauth/callback",
  "/cron/keep-alive",
  "/health",
]);

export const proxy = authProxy((context, request) => {
  if (!isPublicApiRoute(request)) {
    context.requireSessionCookie();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
