import { type NextFetchEvent, NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authProxy } from "../proxy";

// These routing callbacks do not use platform fetch-event methods.
const event = {} as NextFetchEvent;
const protectedProxy = () =>
  authProxy((context) => {
    context.requireSessionCookie();
    return new Response("ok");
  });
const cookie = "team-calendar-dev-auth.session_token=opaque";

describe("Better Auth optimistic proxy", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("passes an opaque cookie onward without treating it as verified identity", async () => {
    const result = await protectedProxy()(
      new NextRequest("http://localhost:3002/api/private", {
        headers: { cookie, origin: "http://localhost:3000" },
      }),
      event
    );
    expect(result?.status).toBe(200);
    expect(result?.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
    expect(result?.headers.get("access-control-allow-credentials")).toBe(
      "true"
    );
    expect(result?.headers.getSetCookie()).toEqual([]);
  });
  it("rejects missing cookies for API routing", async () => {
    expect(
      (
        await protectedProxy()(
          new NextRequest("http://localhost:3002/api/private"),
          event
        )
      )?.status
    ).toBe(401);
  });
  it("redirects missing app cookies with a local return path", async () => {
    vi.stubEnv("AUTH_CONTEXT_MODE", "local");
    const result = await protectedProxy()(
      new NextRequest("http://localhost:3000/calendar?week=2026-10-25"),
      event
    );
    expect(result?.status).toBe(307);
    const url = new URL(result?.headers.get("location") ?? "");
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("returnTo")).toBe("/calendar?week=2026-10-25");
  });
  it("requires the exact paired Origin for API mutations", async () => {
    for (const origin of [undefined, "https://attacker.test", "null"]) {
      expect(
        (
          await protectedProxy()(
            new NextRequest("http://localhost:3002/api/private", {
              headers: { cookie, ...(origin ? { origin } : {}) },
              method: "POST",
            }),
            event
          )
        )?.status
      ).toBe(403);
    }
    expect(
      (
        await protectedProxy()(
          new NextRequest("http://localhost:3002/api/private", {
            headers: { cookie, origin: "http://localhost:3000" },
            method: "POST",
          }),
          event
        )
      )?.status
    ).toBe(200);
  });
  it("permits paired-origin preflight without a cookie", async () => {
    const response = await protectedProxy()(
      new NextRequest("http://localhost:3002/api/private", {
        headers: { origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
      event
    );
    expect(response?.status).toBe(204);
  });
  it("leaves public route-specific origin handling intact", async () => {
    const proxy = authProxy(() => new Response("public"));
    const result = await proxy(
      new NextRequest("http://localhost:3002/api/contact", {
        headers: { origin: "https://teamcalendar.online" },
        method: "POST",
      }),
      event
    );
    expect(result?.status).toBe(200);
  });
});
