import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildXeroOAuthStartUrl: vi.fn(),
  currentUser: vi.fn(),
  requireOrg: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@repo/auth/helpers", () => ({
  currentUser: mocks.currentUser,
  requireOrg: mocks.requireOrg,
  requireRole: mocks.requireRole,
}));

vi.mock("@repo/xero", () => ({
  buildXeroOAuthStartUrl: mocks.buildXeroOAuthStartUrl,
}));

const { GET } = await import("./route");

describe("Xero OAuth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireOrg.mockResolvedValue("org_clerk_123");
    mocks.currentUser.mockResolvedValue({
      id: "user_123",
    });
    mocks.requireRole.mockResolvedValue(false);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    mocks.requireOrg.mockRejectedValue(new Error("missing org"));

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?clerkOrgId=org_clerk_123"
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated.",
    });
    expect(mocks.requireRole).not.toHaveBeenCalled();
  });

  it("returns 401 when the current user cannot be resolved", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?clerkOrgId=org_clerk_123"
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated.",
    });
    expect(mocks.requireRole).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is neither an admin nor an owner", async () => {
    mocks.requireRole.mockResolvedValue(false);

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?clerkOrgId=org_clerk_123"
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and owners can connect Xero.",
    });
    expect(mocks.requireRole).toHaveBeenCalledWith("org:admin");
    expect(mocks.requireRole).toHaveBeenCalledWith("org:owner");
    expect(mocks.buildXeroOAuthStartUrl).not.toHaveBeenCalled();
  });

  it("redirects to the Xero OAuth URL when the caller is an admin", async () => {
    mocks.requireRole.mockImplementation((role: string) =>
      Promise.resolve(role === "org:admin")
    );
    mocks.buildXeroOAuthStartUrl.mockReturnValue({
      ok: true,
      value: {
        redirectUrl:
          "https://login.xero.com/identity/connect/authorize?foo=bar",
      },
    });

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?clerkOrgId=org_clerk_123"
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://login.xero.com/identity/connect/authorize?foo=bar"
    );
    expect(mocks.buildXeroOAuthStartUrl).toHaveBeenCalledWith({
      clerkOrgId: "org_clerk_123",
      organisationId: null,
      returnTo: undefined,
      userId: "user_123",
    });
  });
});
