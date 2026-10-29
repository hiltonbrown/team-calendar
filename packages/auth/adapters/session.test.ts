import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccountId,
  getCurrentUser,
  getSession,
  hasPermission,
  hasRoleResult,
  requireAccount,
  requireAccountResult,
  requireRole,
} from "../helpers";
import { getSessionAuthorizationHeaders } from "../transport";

const ids = {
  account: "10000000-0000-4000-8000-000000000001",
  session: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
};
const mocks = vi.hoisted(() => ({
  getActiveMember: vi.fn(),
  getOrganization: vi.fn(),
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  headers: vi.fn(),
  remote: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("./better-auth-server", () => ({
  ensureUserAccountsReady: vi.fn(),
  getBetterAuth: () => ({ api: mocks }),
}));
vi.mock("./remote-context", () => ({ readRemoteAuthContext: mocks.remote }));

function source() {
  return {
    headers: new Headers(),
    response: {
      session: {
        activeOrganizationId: ids.account,
        expiresAt: new Date(Date.now() + 60_000),
        id: ids.session,
        token: "secret-session",
        userId: ids.user,
      },
      user: {
        email: "alex@example.com",
        emailVerified: true,
        id: ids.user,
        image: "image",
        name: "Alex Smith",
        password: "secret-password",
      },
    },
  };
}

describe("neutral server authentication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_CONTEXT_MODE", "local");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
    mocks.headers.mockResolvedValue(
      new Headers({
        cookie:
          "team-calendar-dev-auth.session_token=opaque; unrelated=private",
      })
    );
    mocks.getSession.mockResolvedValue(source());
    mocks.getActiveMember.mockResolvedValue({
      organizationId: ids.account,
      role: "owner",
      userId: ids.user,
    });
    mocks.getOrganization.mockResolvedValue({
      id: ids.account,
      provisioningStatus: "ready",
    });
    mocks.hasPermission.mockResolvedValue({ success: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("projects only neutral session fields", async () => {
    expect(await getSession()).toEqual({
      accountId: ids.account,
      role: "owner",
      sessionId: ids.session,
      userId: ids.user,
    });
    expect(await getAccountId()).toBe(ids.account);
    expect(await requireAccount()).toBe(ids.account);
    expect(await requireAccountResult()).toEqual({
      ok: true,
      value: ids.account,
    });
    expect(mocks.remote).not.toHaveBeenCalled();
  });
  it("checks roles exactly and keeps native permissions separate", async () => {
    expect(await requireRole("owner")).toBe(true);
    expect(await requireRole("admin")).toBe(false);
    expect(await hasRoleResult("admin")).toEqual({ ok: true, value: false });
    expect(await hasPermission({ settings: ["update"] })).toBe(true);
    expect(mocks.hasPermission).toHaveBeenCalledWith({
      body: {
        organizationId: ids.account,
        permissions: { settings: ["update"] },
      },
      headers: expect.any(Headers),
    });
    mocks.hasPermission.mockResolvedValue({ success: false });
    expect(await hasPermission({ settings: ["update"] })).toBe(false);
  });
  it("denies missing identity and account without converting operational errors", async () => {
    mocks.getSession.mockResolvedValue({
      headers: new Headers(),
      response: null,
    });
    expect(await getSession()).toBeNull();
    expect(await getAccountId()).toBeNull();
    expect(await requireRole("owner")).toBe(false);
    expect(await hasRoleResult("owner")).toMatchObject({
      error: { code: "unauthorised" },
      ok: false,
    });
    expect(await requireAccountResult()).toMatchObject({
      error: { code: "unauthorised" },
      ok: false,
    });
    await expect(requireAccount()).rejects.toThrow(
      "Not authenticated or no account selected"
    );
    mocks.getSession.mockResolvedValue(source());
    mocks.getOrganization.mockResolvedValue({
      id: ids.account,
      provisioningStatus: "pending",
    });
    expect(await requireRole("owner")).toBe(false);
    expect(await hasRoleResult("owner")).toMatchObject({ ok: false });
    const outage = new Error("auth store outage");
    mocks.getSession.mockRejectedValue(outage);
    await expect(requireAccountResult()).rejects.toBe(outage);
  });
  it("denies unknown and legacy wire roles", async () => {
    for (const role of ["future", "org:owner"]) {
      mocks.getActiveMember.mockResolvedValue({
        organizationId: ids.account,
        role,
        userId: ids.user,
      });
      expect(await getSession()).toMatchObject({ accountId: null, role: null });
      expect(await hasPermission({ calendar: ["read"] })).toBe(false);
    }
    mocks.getActiveMember.mockResolvedValue({
      organizationId: ids.account,
      role: "owner",
      userId: ids.user,
    });
    expect(await requireRole(JSON.parse("null"))).toBe(false);
    expect(await hasRoleResult(JSON.parse("null"))).toEqual({
      ok: true,
      value: false,
    });
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });
  it("forwards only the Better Auth session cookie in the transport boundary", async () => {
    expect(await getSessionAuthorizationHeaders()).toEqual({
      Cookie: "team-calendar-dev-auth.session_token=opaque",
      Origin: "http://localhost:3000",
    });
    mocks.headers.mockResolvedValue(
      new Headers({ cookie: "__session=legacy; unrelated=private" })
    );
    expect(await getSessionAuthorizationHeaders()).toBeNull();
  });
  it("projects a safe user without provider credentials", async () => {
    expect(await getCurrentUser()).toEqual({
      email: "alex@example.com",
      emailVerified: true,
      id: ids.user,
      image: "image",
      name: "Alex Smith",
    });
    const unverified = source();
    unverified.response.user.emailVerified = false;
    mocks.getSession.mockResolvedValue(unverified);
    expect(await getCurrentUser()).toMatchObject({ emailVerified: false });
    expect(await getSession()).toMatchObject({ accountId: null, role: null });
    mocks.getSession.mockResolvedValue({
      headers: new Headers(),
      response: null,
    });
    expect(await getCurrentUser()).toBeNull();
  });
  it("selects remote context and propagates its operational failures", async () => {
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    const session = {
      accountId: ids.account,
      role: "viewer",
      sessionId: ids.session,
      userId: ids.user,
    };
    mocks.remote.mockResolvedValue({
      allowed: true,
      session,
      user: { id: ids.user },
    });
    expect(await getSession()).toEqual(session);
    expect(await hasPermission({ calendar: ["read"] })).toBe(true);
    expect(mocks.remote).toHaveBeenLastCalledWith({ calendar: ["read"] });
    expect(mocks.getSession).not.toHaveBeenCalled();
    const outage = new Error("remote resolver outage");
    mocks.remote.mockRejectedValue(outage);
    await expect(requireAccountResult()).rejects.toBe(outage);
  });
});
