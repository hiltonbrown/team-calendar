import { type NextFetchEvent, NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authProxy, createRouteMatcher } from "../proxy";

// These callbacks do not use platform fetch-event methods.
const event = {} as NextFetchEvent;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("optimistic routing proxy", () => {
  it("checks cookie presence without authenticating or calling the network", async () => {
    vi.stubEnv("AUTH_PROVIDER", "better-auth");
    vi.stubEnv("AUTH_CONTEXT_MODE", "local");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
    vi.stubEnv("VERCEL_ENV", "development");
    const network = vi.fn(() => {
      throw new Error("Proxy must not authenticate");
    });
    vi.stubGlobal("fetch", network);
    const response = new Response("route");
    const proxy = authProxy((context) => {
      expect(Object.keys(context)).toEqual(["requireSessionCookie"]);
      context.requireSessionCookie();
      return response;
    });
    expect(
      await proxy(
        new NextRequest("http://localhost:3000/calendar", {
          headers: {
            cookie:
              "team-calendar-dev-auth.session_token=deliberately-unverified",
          },
        }),
        event
      )
    ).toBe(response);
    expect(network).not.toHaveBeenCalled();
  });
  it("matches only complete repository-controlled route patterns", () => {
    const matches = createRouteMatcher(["/sign-in(.*)", "/api/contact"]);
    expect(matches(new NextRequest("http://localhost/sign-in/email"))).toBe(
      true
    );
    expect(matches(new NextRequest("http://localhost/api/contact"))).toBe(true);
    expect(
      matches(new NextRequest("http://localhost/api/contact/private"))
    ).toBe(false);
  });
  it("can recognise the retained Clerk cookie without importing its middleware", async () => {
    vi.stubEnv("AUTH_PROVIDER", "clerk");
    vi.stubEnv("AUTH_CONTEXT_MODE", "local");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
    vi.stubEnv("VERCEL_ENV", "development");
    const proxy = authProxy((context) => {
      context.requireSessionCookie();
      return new Response("route");
    });
    expect(
      (
        await proxy(
          new NextRequest("http://localhost:3000/calendar", {
            headers: { cookie: "__session=opaque" },
          }),
          event
        )
      )?.status
    ).toBe(200);
  });
});
