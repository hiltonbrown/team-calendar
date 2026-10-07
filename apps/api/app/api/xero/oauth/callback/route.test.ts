import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn().mockResolvedValue({
    orgId: "org_1",
    orgRole: "org:admin",
    userId: "user_1",
  }),
  cancelXeroOAuth: vi.fn(),
  captureXeroConnected: vi.fn(),
  completeXeroOAuth: vi.fn(),
  dispatchInitialXeroSync: vi.fn(),
  isLocalApplicationPath: vi.fn(),
  isPreviewDeployment: vi.fn(),
}));

vi.mock("@repo/jobs", () => ({
  dispatchInitialXeroSync: mocks.dispatchInitialXeroSync,
}));

vi.mock("@repo/auth/server", () => ({ auth: mocks.auth }));

vi.mock("@repo/xero/activation", () => ({
  captureXeroConnected: mocks.captureXeroConnected,
}));

vi.mock("@repo/xero", () => ({
  cancelXeroOAuth: mocks.cancelXeroOAuth,
  completeXeroOAuth: mocks.completeXeroOAuth,
  isLocalApplicationPath: mocks.isLocalApplicationPath,
  isPreviewDeployment: mocks.isPreviewDeployment,
}));

const { GET } = await import("./route");

describe("Xero OAuth callback route", () => {
  const callbackUrl =
    "https://api.example.com/api/xero/oauth/callback?code=code&state=state";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
      userId: "user_1",
    });
    mocks.isPreviewDeployment.mockReturnValue(false);
    mocks.isLocalApplicationPath.mockImplementation(
      (value: string) =>
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !value.includes("\\")
    );
    mocks.completeXeroOAuth.mockResolvedValue({
      ok: true,
      value: {
        redirectTo: "/settings/integrations/xero/connect?session=session_1",
        sessionId: "session_1",
      },
    });
  });

  it("sends denied consent through signed cancellation without exchanging a token", async () => {
    mocks.cancelXeroOAuth.mockResolvedValue({
      ok: true,
      value: {
        redirectTo: "/settings/integrations/xero?xero=cancelled",
        sessionId: "session_1",
      },
    });
    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/callback?error=access_denied&state=signed",
        { headers: { cookie: "xero_oauth_nonce=nonce" } }
      )
    );
    expect(response.status).toBe(307);
    expect(mocks.completeXeroOAuth).not.toHaveBeenCalled();
    expect(mocks.cancelXeroOAuth).toHaveBeenCalledWith({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      nonce: "nonce",
      state: "signed",
    });
  });

  it("rejects a missing nonce cookie without exchanging the code", async () => {
    mocks.completeXeroOAuth.mockResolvedValue({
      error: {
        code: "invalid_state",
        message: "The Xero OAuth state was invalid.",
      },
      ok: false,
    });
    const response = await GET(new Request(callbackUrl));

    expect(response.status).toBe(400);
    expect(mocks.completeXeroOAuth).toHaveBeenCalledWith({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "code",
      nonce: null,
      state: "state",
    });
  });

  it("passes the nonce cookie to the OAuth service", async () => {
    const response = await GET(
      new Request(callbackUrl, {
        headers: { cookie: "xero_oauth_nonce=matching-nonce" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://api.example.com/settings/integrations/xero/connect?session=session_1"
    );
    expect(mocks.completeXeroOAuth).toHaveBeenCalledWith({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "code",
      nonce: "matching-nonce",
      state: "state",
    });
    expect(response.headers.get("set-cookie")).toContain("xero_oauth_nonce=;");
  });

  it("preserves a valid local redirect query and fragment", async () => {
    mocks.completeXeroOAuth.mockResolvedValue({
      ok: true,
      value: {
        redirectTo: "/calendar?team=people#upcoming",
        sessionId: "session_1",
      },
    });

    const response = await GET(new Request(callbackUrl));

    expect(response.headers.get("location")).toBe(
      "https://api.example.com/calendar?team=people#upcoming"
    );
  });

  it("falls back to Xero settings for an unsafe service redirect", async () => {
    mocks.completeXeroOAuth.mockResolvedValue({
      ok: true,
      value: {
        redirectTo: "https://attacker.example/path",
        sessionId: "session_1",
      },
    });

    const response = await GET(new Request(callbackUrl));

    expect(response.headers.get("location")).toBe(
      "https://api.example.com/settings/integrations/xero"
    );
  });

  it("returns the service error for a mismatched nonce", async () => {
    mocks.completeXeroOAuth.mockResolvedValue({
      error: {
        code: "invalid_state",
        message: "The Xero OAuth state was invalid.",
      },
      ok: false,
    });

    const response = await GET(
      new Request(callbackUrl, {
        headers: { cookie: "xero_oauth_nonce=mismatched-nonce" },
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.completeXeroOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: "mismatched-nonce" })
    );
  });

  it("rejects preview callbacks before reading callback parameters", async () => {
    mocks.isPreviewDeployment.mockReturnValue(true);

    const response = await GET(new Request(callbackUrl));

    expect(response.status).toBe(403);
    expect(mocks.completeXeroOAuth).not.toHaveBeenCalled();
  });
  it("rejects current role loss before exchanging and clears the nonce", async () => {
    mocks.auth.mockResolvedValueOnce({
      orgId: "org_1",
      orgRole: "org:viewer",
      userId: "user_1",
    });
    const response = await GET(new Request(callbackUrl));
    expect(response.status).toBe(403);
    expect(mocks.completeXeroOAuth).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("xero_oauth_nonce=;");
  });
  it("clears the nonce on terminal callback validation failure", async () => {
    const response = await GET(
      new Request("https://api.example.com/api/xero/oauth/callback?state=state")
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toContain("xero_oauth_nonce=;");
  });
  it("dispatches initial sync once for an automatically attached connection", async () => {
    mocks.completeXeroOAuth.mockResolvedValueOnce({
      ok: true,
      value: {
        connected: { connectionId: "conn_1", organisationId: "payroll_1" },
        redirectTo: "/calendar?org=payroll_1",
        sessionId: "session_1",
      },
    });
    mocks.dispatchInitialXeroSync.mockRejectedValueOnce(
      new Error("queue unavailable")
    );
    const response = await GET(new Request(callbackUrl));
    expect(response.status).toBe(307);
    expect(mocks.dispatchInitialXeroSync).toHaveBeenCalledOnce();
    expect(mocks.dispatchInitialXeroSync).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      connectionId: "conn_1",
      organisationId: "payroll_1",
      triggeredByUserId: "user_1",
      triggerType: "manual",
    });
    expect(mocks.captureXeroConnected).toHaveBeenCalledOnce();
    expect(mocks.captureXeroConnected).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      connectionId: "conn_1",
      organisationId: "payroll_1",
    });
  });
});
