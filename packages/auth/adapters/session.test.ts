import { beforeEach, describe, expect, it, vi } from "vitest";
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

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ cookie: "__session=opaque; unrelated=private" }),
}));
vi.mock("@clerk/nextjs/server", () => mocks);

describe("neutral server authentication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({
      getToken: () => "secret",
      isAuthenticated: true,
      orgId: "account",
      orgRole: "org:owner",
      sessionId: "session",
      userId: "user",
    });
  });
  it("projects only neutral session fields", async () => {
    expect(await getSession()).toEqual({
      accountId: "account",
      role: "owner",
      sessionId: "session",
      userId: "user",
    });
  });
  it("checks roles exactly and keeps permissions separate", async () => {
    expect(await requireRole("owner")).toBe(true);
    expect(await requireRole("admin")).toBe(false);
    expect(await hasRoleResult("admin")).toEqual({ ok: true, value: false });
    expect(await hasPermission({ settings: ["update"] })).toBe(true);
  });
  it("denies missing identity and account without converting operational errors", async () => {
    mocks.auth.mockResolvedValue({ isAuthenticated: false, orgId: "stale" });
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
    await expect(requireAccount()).rejects.toThrow();
    mocks.auth.mockResolvedValue({
      isAuthenticated: true,
      orgId: null,
      userId: "user",
    });
    expect(await requireRole("owner")).toBe(false);
    expect(await hasRoleResult("owner")).toMatchObject({ ok: false });
    const outage = new Error("provider outage");
    mocks.auth.mockRejectedValue(outage);
    await expect(requireAccountResult()).rejects.toBe(outage);
  });
  it("denies unknown roles", async () => {
    mocks.auth.mockResolvedValue({
      isAuthenticated: true,
      orgId: "account",
      orgRole: "org:future",
      userId: "user",
    });
    expect(await getSession()).toMatchObject({ role: null });
    expect(await hasPermission({ calendar: ["read"] })).toBe(false);
    expect(await requireRole(JSON.parse("null"))).toBe(false);
    expect(await hasRoleResult(JSON.parse("null"))).toEqual({
      ok: true,
      value: false,
    });
  });
  it("forwards only the selected session cookie in the transport boundary", async () => {
    expect(await getSessionAuthorizationHeaders()).toEqual({
      Cookie: "__session=opaque",
      Origin: "http://localhost:3000",
    });
    vi.unstubAllEnvs();
  });
  it("projects a safe user and uses verified primary email only", async () => {
    mocks.currentUser.mockResolvedValue({
      firstName: "Alex",
      fullName: "Alex Smith",
      id: "user",
      imageUrl: "image",
      lastName: "Smith",
      primaryEmailAddress: {
        emailAddress: "alex@example.com",
        verification: { status: "verified" },
      },
      privateMetadata: { secret: "credential" },
    });
    expect(await getCurrentUser()).toEqual({
      email: "alex@example.com",
      emailVerified: true,
      id: "user",
      image: "image",
      name: "Alex Smith",
    });
    mocks.currentUser.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });
});
