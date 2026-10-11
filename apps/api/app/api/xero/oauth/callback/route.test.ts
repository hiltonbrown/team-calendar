vi.mock("@repo/auth/helpers", () => ({
  requireRole: async (role: string) => (await mocks.auth()).orgRole === role,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

const CREDENTIAL_PATTERN =
  /access_token|refresh_token|client.secret|Authorization/;

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
  readOAuthStateReturnTo: vi.fn(),
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
  readOAuthStateReturnTo: mocks.readOAuthStateReturnTo,
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

    expect(response.status).toBe(307);
    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get(
        "xero_error"
      )
    ).toBe("expired");
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

  it("returns a failed callback to the signed return path with a safe code", async () => {
    mocks.readOAuthStateReturnTo.mockReturnValue("/onboarding?step=xero");
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

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/onboarding");
    expect(location.searchParams.get("step")).toBe("xero");
    expect(location.searchParams.get("xero_error")).toBe("expired");
    expect(response.headers.get("location")).not.toContain("invalid");
    expect(response.headers.get("set-cookie")).toContain("xero_oauth_nonce=;");
    expect(mocks.completeXeroOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: "mismatched-nonce" })
    );
  });

  it.each([
    ["tenant_not_found", "organisation"],
    ["invalid_country", "organisation"],
    ["network_error", "unavailable"],
    ["connection_changed", "changed"],
    ["client_credentials_invalid", "failed"],
  ])("maps %s to the %s error code", async (code, expected) => {
    mocks.readOAuthStateReturnTo.mockReturnValue("/onboarding");
    mocks.completeXeroOAuth.mockResolvedValue({
      error: { code, message: "Provider detail that must not leak." },
      ok: false,
    });
    const response = await GET(
      new Request(callbackUrl, { headers: { cookie: "xero_oauth_nonce=n" } })
    );
    const location = response.headers.get("location") ?? "";
    expect(new URL(location).searchParams.get("xero_error")).toBe(expected);
    expect(location).not.toContain("Provider");
  });

  it("falls back to Xero settings when the state cannot be verified", async () => {
    mocks.readOAuthStateReturnTo.mockReturnValue(null);
    mocks.completeXeroOAuth.mockResolvedValue({
      error: { code: "invalid_state", message: "Invalid." },
      ok: false,
    });
    const response = await GET(
      new Request(callbackUrl, { headers: { cookie: "xero_oauth_nonce=n" } })
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/settings/integrations/xero");
    expect(location.searchParams.get("xero_error")).toBe("expired");
  });

  it("never follows an unsafe signed return path", async () => {
    mocks.readOAuthStateReturnTo.mockReturnValue("https://evil.example/");
    mocks.completeXeroOAuth.mockResolvedValue({
      error: { code: "network_error", message: "Down." },
      ok: false,
    });
    const response = await GET(
      new Request(callbackUrl, { headers: { cookie: "xero_oauth_nonce=n" } })
    );
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/settings/integrations/xero"
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

  it.each(["org:viewer", "org:manager", null])(
    "rejects lost callback privilege %s before any provider work",
    async (orgRole) => {
      mocks.auth.mockResolvedValueOnce({
        orgId: "org_1",
        orgRole,
        userId: "user_1",
      });
      const response = await GET(
        new Request(callbackUrl, {
          headers: { cookie: "xero_oauth_nonce=nonce" },
        })
      );
      expect(response.status).toBe(403);
      expect(mocks.completeXeroOAuth).not.toHaveBeenCalled();
      expect(mocks.cancelXeroOAuth).not.toHaveBeenCalled();
      expect(mocks.dispatchInitialXeroSync).not.toHaveBeenCalled();
    }
  );

  it.each([
    { orgId: null, userId: "user_1" },
    { orgId: "org_1", userId: null },
  ])("rejects lost membership or authentication %j", async (identity) => {
    mocks.auth.mockResolvedValueOnce({ ...identity, orgRole: "org:admin" });
    const response = await GET(new Request(callbackUrl));
    expect(response.status).toBe(401);
    expect(mocks.completeXeroOAuth).not.toHaveBeenCalled();
  });

  it("accepts the owner role without returning credentials", async () => {
    mocks.auth.mockResolvedValueOnce({
      orgId: "org_1",
      orgRole: "org:owner",
      userId: "user_1",
    });
    const response = await GET(
      new Request(callbackUrl, {
        headers: { cookie: "xero_oauth_nonce=nonce" },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "/settings/integrations/xero/connect?session=session_1"
    );
    expect(await response.text()).not.toMatch(CREDENTIAL_PATTERN);
  });

  it("returns a provider error other than denial to the signed return path", async () => {
    mocks.readOAuthStateReturnTo.mockReturnValue("/onboarding?step=xero");
    const response = await GET(
      new Request(
        "https://api.example.com/api/xero/oauth/callback?error=server_error&state=state"
      )
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/onboarding");
    expect(location.searchParams.get("xero_error")).toBe("failed");
    expect(response.headers.get("set-cookie")).toContain("xero_oauth_nonce=;");
    expect(mocks.completeXeroOAuth).not.toHaveBeenCalled();
    expect(mocks.cancelXeroOAuth).not.toHaveBeenCalled();
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
