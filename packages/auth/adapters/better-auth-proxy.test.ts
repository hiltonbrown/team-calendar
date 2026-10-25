import { type NextFetchEvent, NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authMiddleware } from "../proxy";

const mocks = vi.hoisted(() => ({
  clerk: vi.fn(),
  local: vi.fn(),
  remote: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: () => mocks.clerk,
  createRouteMatcher: vi.fn(),
}));
vi.mock("./better-auth", () => ({ readBetterAuthContext: mocks.local }));
vi.mock("./remote-context", () => ({ readRemoteContext: mocks.remote }));

// These middleware callbacks never use the platform's fetch-event methods.
const event = {} as NextFetchEvent;
const protectedMiddleware = () =>
  authMiddleware(async (context) => {
    await context.requireAuthentication();
    return new Response("ok");
  });

describe("Better Auth proxy authentication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_PROVIDER", "better-auth");
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
    mocks.remote.mockResolvedValue({
      context: { session: { userId: "user" }, user: { emailVerified: true } },
      responseHeaders: new Headers(),
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses remote validation and forwards refresh cookies with credentialed CORS", async () => {
    mocks.remote.mockResolvedValue({
      context: { session: { userId: "user" }, user: { emailVerified: true } },
      responseHeaders: new Headers({ "set-cookie": "session=renewed" }),
    });
    const result = await protectedMiddleware()(
      new NextRequest("http://localhost:3002/api/private", {
        headers: { origin: "http://localhost:3000" },
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
    expect(result?.headers.getSetCookie()).toEqual(["session=renewed"]);
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.clerk).not.toHaveBeenCalled();
  });
  it("requires the paired app origin for every protected mutation", async () => {
    for (const origin of [undefined, "https://attacker.test", "null"]) {
      const request = new NextRequest("http://localhost:3002/api/private", {
        headers: origin ? { origin } : {},
        method: "POST",
      });
      expect((await protectedMiddleware()(request, event))?.status).toBe(403);
    }
    expect(mocks.remote).not.toHaveBeenCalled();
    expect(
      (
        await protectedMiddleware()(
          new NextRequest("http://localhost:3002/api/private", {
            headers: { origin: "http://localhost:3000" },
            method: "POST",
          }),
          event
        )
      )?.status
    ).toBe(200);
  });
  it("returns paired-origin preflight without requiring a session", async () => {
    const result = await protectedMiddleware()(
      new NextRequest("http://localhost:3002/api/private", {
        headers: { origin: "http://localhost:3000" },
        method: "OPTIONS",
      }),
      event
    );
    expect(result?.status).toBe(204);
    expect(result?.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
    expect(mocks.remote).not.toHaveBeenCalled();
  });
  it("leaves public route origin handling intact", async () => {
    const middleware = authMiddleware(async () => new Response("public"));
    const result = await middleware(
      new NextRequest("http://localhost:3002/api/contact", {
        headers: { origin: "https://teamcalendar.online" },
        method: "POST",
      }),
      event
    );
    expect(result?.status).toBe(200);
    expect(mocks.remote).not.toHaveBeenCalled();
  });
  it("denies signed-out and unverified sessions without a Clerk fallback", async () => {
    mocks.remote.mockResolvedValue({
      context: null,
      responseHeaders: new Headers(),
    });
    expect(
      (
        await protectedMiddleware()(
          new NextRequest("http://localhost:3002/api/private"),
          event
        )
      )?.status
    ).toBe(401);
    mocks.remote.mockResolvedValue({
      context: { session: { userId: "user" }, user: { emailVerified: false } },
      responseHeaders: new Headers(),
    });
    expect(
      (
        await protectedMiddleware()(
          new NextRequest("http://localhost:3002/api/private"),
          event
        )
      )?.status
    ).toBe(401);
    expect(mocks.clerk).not.toHaveBeenCalled();
  });
  it("preserves resolver outages", async () => {
    const error = new Error("resolver unavailable");
    mocks.remote.mockRejectedValue(error);
    await expect(
      protectedMiddleware()(
        new NextRequest("http://localhost:3002/api/private"),
        event
      )
    ).rejects.toBe(error);
  });
});
