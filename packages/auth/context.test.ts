import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./context";

const mocks = vi.hoisted(() => ({ limit: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./adapters/better-auth", () => ({
  readBetterAuthContext: mocks.read,
}));
vi.mock("./adapters/better-auth-server", () => ({
  consumeAuthContextRateLimit: mocks.limit,
}));

describe("auth context resolver", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_CONTEXT_MODE", "local");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
    mocks.limit.mockResolvedValue(true);
    mocks.read.mockResolvedValue({
      context: null,
      responseHeaders: new Headers(),
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  const request = (body: unknown, origin = "http://localhost:3002") =>
    new Request("http://localhost:3000/api/auth-context", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin },
      method: "POST",
    });
  it("is unavailable for Clerk or on the remote API runtime", async () => {
    expect(
      (await GET(new Request("http://localhost:3000/api/auth-context"))).status
    ).toBe(404);
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    expect(
      (await GET(new Request("http://localhost:3000/api/auth-context"))).status
    ).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns a non-cacheable projection and carries all refresh cookies", async () => {
    const responseHeaders = new Headers();
    responseHeaders.append("set-cookie", "session=renewed");
    mocks.read.mockResolvedValue({ context: null, responseHeaders });
    const response = await GET(
      new Request("http://localhost:3000/api/auth-context", {
        headers: {
          cookie: "private=unused; team-calendar-dev-auth.session_token=opaque",
        },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ context: null });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.getSetCookie()).toEqual(["session=renewed"]);
    expect([...mocks.read.mock.calls[0][0]]).toEqual([
      ["cookie", "team-calendar-dev-auth.session_token=opaque"],
    ]);
  });
  it("accepts only known nonempty permission statements", async () => {
    expect(
      (await POST(request({ permissions: { member: ["create"] } }))).status
    ).toBe(200);
    expect(mocks.read.mock.calls[0][1]).toEqual({ member: ["create"] });
    for (const body of [
      { permissions: {} },
      { permissions: { invented: ["read"] } },
      { permissions: { member: ["invented"] } },
      { permissions: { member: [] } },
      { extra: true, permissions: { member: ["create"] } },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
  });
  it("rejects non-paired origins and missing POST origin before auth reads", async () => {
    expect(
      (
        await POST(
          request(
            { permissions: { member: ["create"] } },
            "https://attacker.test"
          )
        )
      ).status
    ).toBe(403);
    const noOrigin = request({ permissions: { member: ["create"] } });
    noOrigin.headers.delete("origin");
    const response = await POST(noOrigin);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("fails closed when rate limiting denies or its database is unavailable", async () => {
    mocks.limit.mockResolvedValue(false);
    expect(
      (await GET(new Request("http://localhost:3000/api/auth-context"))).status
    ).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
    const error = new Error("rate storage unavailable");
    mocks.limit.mockRejectedValue(error);
    await expect(
      GET(new Request("http://localhost:3000/api/auth-context"))
    ).rejects.toBe(error);
  });
  it("preserves operational auth failures", async () => {
    const error = new Error("auth store unavailable");
    mocks.read.mockRejectedValue(error);
    await expect(
      GET(new Request("http://localhost:3000/api/auth-context"))
    ).rejects.toBe(error);
  });
});
