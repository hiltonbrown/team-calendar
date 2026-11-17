import { hasPermission as can } from "@repo/auth/permissions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildXeroOAuthStartUrl: vi.fn(),
  getCurrentUser: vi.fn(),
  hasPermission: vi.fn(),
  requireAccount: vi.fn(),
}));

vi.mock("@repo/auth/helpers", () => ({
  getCurrentUser: mocks.getCurrentUser,
  hasPermission: mocks.hasPermission,
  requireAccount: mocks.requireAccount,
}));

vi.mock("@repo/xero", () => ({
  buildXeroOAuthStartUrl: mocks.buildXeroOAuthStartUrl,
}));

const { GET } = await import("./route");

describe("Xero OAuth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAccount.mockResolvedValue("org_account_123");
    mocks.getCurrentUser.mockResolvedValue({
      id: "user_123",
    });
    mocks.hasPermission.mockResolvedValue(false);
  });

  it("returns 401 when the caller is not authenticated", async () => {
    mocks.requireAccount.mockRejectedValue(new Error("missing org"));

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?accountId=org_account_123&organisationId=payroll_1"
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated.",
    });
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });

  it("returns 401 when the current user cannot be resolved", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?accountId=org_account_123&organisationId=payroll_1"
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated.",
    });
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is neither an admin nor an owner", async () => {
    mocks.hasPermission.mockResolvedValue(false);

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?accountId=org_account_123&organisationId=payroll_1"
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and owners can connect Xero.",
    });
    expect(mocks.hasPermission).toHaveBeenCalledWith({ xero: ["connect"] });
    expect(mocks.hasPermission).toHaveBeenCalledWith({ ownership: ["manage"] });
    expect(mocks.buildXeroOAuthStartUrl).not.toHaveBeenCalled();
  });

  it("redirects to the Xero OAuth URL when the caller is an admin", async () => {
    mocks.hasPermission.mockImplementation(
      (request: import("@repo/auth/permissions").PermissionRequest) =>
        Promise.resolve(can("admin", request))
    );
    mocks.buildXeroOAuthStartUrl.mockReturnValue({
      ok: true,
      value: {
        nonce: "nonce_123",
        redirectUrl:
          "https://login.xero.com/identity/connect/authorize?foo=bar",
      },
    });

    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?accountId=org_account_123&organisationId=payroll_1"
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://login.xero.com/identity/connect/authorize?foo=bar"
    );
    expect(response.headers.get("set-cookie")).toContain("xero_oauth_nonce=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=600");
    expect(mocks.buildXeroOAuthStartUrl).toHaveBeenCalledWith({
      accountId: "org_account_123",
      organisationId: "payroll_1",
      returnTo: undefined,
      userId: "user_123",
    });
  });
  it("uses the authenticated actor despite a forged query user ID", async () => {
    mocks.hasPermission.mockResolvedValue(true);
    mocks.buildXeroOAuthStartUrl.mockResolvedValue({
      ok: true,
      value: {
        nonce: "nonce",
        redirectUrl: "https://login.xero.com/identity/connect/authorize",
      },
    });
    const request = new Request(
      "https://api.example.com/api/xero/oauth/start?accountId=org_account_123&organisationId=00000000-0000-4000-8000-000000000001&userId=forged"
    );
    expect((await GET(request)).status).toBe(307);
    expect(mocks.buildXeroOAuthStartUrl).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123" })
    );
  });
});

describe("Add company Xero consent", () => {
  it("starts consent without a preset payroll company", async () => {
    vi.clearAllMocks();
    mocks.requireAccount.mockResolvedValue("org_account_123");
    mocks.getCurrentUser.mockResolvedValue({ id: "user_1" });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.buildXeroOAuthStartUrl.mockResolvedValue({
      ok: true,
      value: {
        nonce: "nonce",
        redirectUrl: "https://login.xero.com/identity/connect/authorize",
      },
    });
    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/start?accountId=org_account_123"
      )
    );
    expect(response.status).toBe(307);
    expect(mocks.buildXeroOAuthStartUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "org_account_123",
        organisationId: null,
        userId: "user_1",
      })
    );
  });
});
