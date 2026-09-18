import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isPublicApiRoute } from "./proxy";

describe("API proxy route boundary", () => {
  it.each([
    ["/ical/example.ics", true],
    ["/api/inngest", true],
    ["/webhooks/auth", true],
    ["/webhooks/payments", true],
    ["/api/xero/oauth/callback", true],
    ["/cron/keep-alive", true],
    ["/health", true],
    ["/__clerk/v1/client", true],
    ["/api/availability", false],
    ["/api/notifications/stream", false],
    ["/api/support/github-issue", false],
    ["/api/sync/dispatch", false],
    ["/api/xero/oauth/start", false],
    ["/api/feeds", false],
    ["/api/future-sensitive-route", false],
  ])("classifies %s public=%s", (path, expected) => {
    expect(
      isPublicApiRoute(new NextRequest(`http://localhost:3002${path}`))
    ).toBe(expected);
  });
});
