import { APIError } from "better-auth/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentUser,
  getSession,
  hasPermission,
  requireRole,
} from "../helpers";
import { readBetterAuthContext } from "./better-auth";

const ids = {
  account: "10000000-0000-4000-8000-000000000001",
  session: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
};
const mocks = vi.hoisted(() => ({
  clerkSession: vi.fn(),
  getActiveMember: vi.fn(),
  getOrganization: vi.fn(),
  getSession: vi.fn(),
  hasPermission: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.clerkSession,
  currentUser: vi.fn(),
}));
vi.mock("./better-auth-server", () => ({
  ensureUserAccountsReady: vi.fn().mockResolvedValue(undefined),
  getBetterAuth: () => ({ api: mocks }),
}));

function source() {
  return {
    headers: new Headers({ "set-cookie": "renewed-session" }),
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
        image: null,
        name: "Alex",
        password: "secret-password",
      },
    },
  };
}

describe("Better Auth neutral adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_CONTEXT_MODE", "local");
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

  it("returns safe session and user DTOs without provider credentials", async () => {
    expect(await getSession()).toEqual({
      accountId: ids.account,
      role: "owner",
      sessionId: ids.session,
      userId: ids.user,
    });
    expect(await getCurrentUser()).toEqual({
      email: "alex@example.com",
      emailVerified: true,
      id: ids.user,
      image: null,
      name: "Alex",
    });
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    expect(mocks.clerkSession).not.toHaveBeenCalled();
  });
  it("checks current membership and readiness on every call", async () => {
    expect(await getSession()).toMatchObject({ role: "owner" });
    mocks.getActiveMember.mockResolvedValue({
      organizationId: ids.account,
      role: "viewer",
      userId: ids.user,
    });
    expect(await getSession()).toMatchObject({ role: "viewer" });
    mocks.getOrganization.mockResolvedValue({
      id: ids.account,
      provisioningStatus: "pending",
    });
    expect(await getSession()).toMatchObject({ accountId: null, role: null });
    expect(mocks.getActiveMember).toHaveBeenCalledTimes(3);
  });
  it("denies a mismatched membership, unknown role and unverified email", async () => {
    mocks.getActiveMember.mockResolvedValue({
      organizationId: ids.account,
      role: "owner",
      userId: "another-user",
    });
    expect(await getSession()).toMatchObject({ accountId: null, role: null });
    mocks.getActiveMember.mockResolvedValue({
      organizationId: ids.account,
      role: "owner,admin",
      userId: ids.user,
    });
    expect(await getSession()).toMatchObject({ accountId: null, role: null });
    const unverified = source();
    unverified.response.user.emailVerified = false;
    mocks.getSession.mockResolvedValue(unverified);
    mocks.getActiveMember.mockClear();
    expect(await getSession()).toMatchObject({ accountId: null });
    expect(mocks.getActiveMember).not.toHaveBeenCalled();
  });
  it("turns expected stale membership errors into account denial", async () => {
    mocks.getActiveMember.mockRejectedValue(
      APIError.from("BAD_REQUEST", {
        code: "MEMBER_NOT_FOUND",
        message: "Member not found",
      })
    );
    expect(await getSession()).toMatchObject({ accountId: null, role: null });
  });
  it("propagates auth-store errors and never falls back to Clerk", async () => {
    const error = new Error("auth store unavailable");
    mocks.getActiveMember.mockRejectedValue(error);
    await expect(getSession()).rejects.toBe(error);
    expect(mocks.clerkSession).not.toHaveBeenCalled();
  });
  it("requires the native permission result and preserves exact-role semantics", async () => {
    expect(await requireRole("admin")).toBe(false);
    expect(await requireRole("owner")).toBe(true);
    expect(await hasPermission({ member: ["create"] })).toBe(true);
    expect(mocks.hasPermission).toHaveBeenCalledWith({
      body: {
        organizationId: ids.account,
        permissions: { member: ["create"] },
      },
      headers: expect.any(Headers),
    });
    mocks.hasPermission.mockResolvedValue({ success: false });
    expect(await hasPermission({ member: ["create"] })).toBe(false);
    mocks.hasPermission.mockResolvedValue({ success: "true" });
    expect(await hasPermission({ member: ["create"] })).toBe(false);
  });
  it("does not send denied or malformed permissions to the provider", async () => {
    expect(await hasPermission({ organization: ["delete"] })).toBe(false);
    expect(await hasPermission({})).toBe(false);
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });
  it("denies a permission when membership is removed between reads", async () => {
    mocks.hasPermission.mockRejectedValue(
      APIError.from("UNAUTHORIZED", {
        code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
        message: "Membership removed",
      })
    );
    expect(await hasPermission({ member: ["create"] })).toBe(false);
  });
  it("returns null for expired or absent sessions and carries refresh headers", async () => {
    const expired = source();
    expired.response.session.expiresAt = new Date(0);
    mocks.getSession.mockResolvedValue(expired);
    expect(await getSession()).toBeNull();
    mocks.getSession.mockResolvedValue({
      headers: new Headers(),
      response: null,
    });
    expect(await getSession()).toBeNull();
    mocks.getSession.mockResolvedValue(source());
    const result = await readBetterAuthContext(new Headers());
    expect(result.responseHeaders.getSetCookie()).toEqual(["renewed-session"]);
  });
});
