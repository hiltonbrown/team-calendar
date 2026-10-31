import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "../helpers";
import { readRemoteContext } from "./remote-context";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), local: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ cookie: "team-calendar-dev-auth.session_token=opaque" }),
}));
vi.mock("./better-auth", () => ({ readLocalAuthContext: mocks.local }));

const userId = "10000000-0000-4000-8000-000000000003";
const context = () => ({
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  session: {
    accountId: "10000000-0000-4000-8000-000000000001",
    role: "owner",
    sessionId: "10000000-0000-4000-8000-000000000002",
    userId,
  },
  user: {
    email: "alex@example.com",
    emailVerified: true,
    id: userId,
    image: null,
    name: "Alex",
  },
});
const incoming = () =>
  new Headers({
    authorization: "Bearer unused",
    cookie: "other=private; team-calendar-dev-auth.session_token=opaque",
    "x-forwarded-host": "attacker.test",
  });

describe("online API auth validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockImplementation(async () =>
      Response.json({ context: context() })
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("uses the fixed app resolver and forwards only the session cookie", async () => {
    const result = await readRemoteContext(incoming());
    expect(result.context?.session.userId).toBe(userId);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url.toString()).toBe("http://localhost:3000/api/auth-context");
    expect([...options.headers]).toEqual([
      ["cookie", "team-calendar-dev-auth.session_token=opaque"],
      ["origin", "http://localhost:3002"],
    ]);
    expect(options).toMatchObject({
      cache: "no-store",
      method: "GET",
      redirect: "error",
    });
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("never instantiates local auth in the API helper path", async () => {
    expect(await getSession()).toMatchObject({ userId });
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("uses POST for current native permission validation", async () => {
    await readRemoteContext(incoming(), { member: ["create"] });
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ permissions: { member: ["create"] } }),
      method: "POST",
    });
  });
  it("does not make anonymous resolver requests", async () => {
    expect((await readRemoteContext(new Headers())).context).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects invalid or over-sharing resolver responses", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({ context: { ...context(), token: "credential" } })
    );
    await expect(readRemoteContext(incoming())).rejects.toThrow();
    mocks.fetch.mockResolvedValue(
      Response.json({
        context: { ...context(), user: { ...context().user, id: "invalid" } },
      })
    );
    await expect(readRemoteContext(incoming())).rejects.toThrow();
  });
  it("denies expired sessions and preserves HTTP/network failures", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        context: { ...context(), expiresAt: new Date(0).toISOString() },
      })
    );
    expect((await readRemoteContext(incoming())).context).toBeNull();
    mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(readRemoteContext(incoming())).rejects.toThrow("503");
    const error = new Error("connection unavailable");
    mocks.fetch.mockRejectedValue(error);
    await expect(getSession()).rejects.toBe(error);
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("forwards allowed renewal cookies and rejects unexpected cookies", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json(
        { context: context() },
        {
          headers: {
            "set-cookie":
              "team-calendar-dev-auth.session_token=renewed; HttpOnly; SameSite=Lax; Path=/",
          },
        }
      )
    );
    const result = await readRemoteContext(incoming());
    expect(result.responseHeaders.getSetCookie()[0]).toContain(
      "session_token=renewed"
    );
    mocks.fetch.mockResolvedValue(
      Response.json(
        { context: context() },
        { headers: { "set-cookie": "payroll_state=private" } }
      )
    );
    await expect(readRemoteContext(incoming())).rejects.toThrow(
      "unexpected cookie"
    );
  });
});
