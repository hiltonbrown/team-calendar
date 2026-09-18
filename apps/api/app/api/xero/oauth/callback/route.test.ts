import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeXeroOAuth: vi.fn(),
  isLocalApplicationPath: vi.fn(),
  isPreviewDeployment: vi.fn(),
}));

vi.mock("@repo/xero", () => ({
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
});
