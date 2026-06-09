import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbMock = vi.hoisted(() => ({
  xeroConnection: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@repo/database", () => ({
  database: dbMock,
}));

const {
  buildXeroOAuthStartUrl,
  ensureFreshXeroConnection,
  isPreviewDeployment,
  xeroConnectionRefreshDecision,
} = await import("./service");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.XERO_CLIENT_ID = "client-id";
  process.env.XERO_CLIENT_SECRET = "client-secret";
  process.env.XERO_REDIRECT_URI =
    "https://api.example.com/api/xero/oauth/callback";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
  delete process.env.VERCEL_ENV;
  dbMock.xeroConnection.findFirst.mockReset();
  dbMock.xeroConnection.update.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("isPreviewDeployment", () => {
  it("is true only on a Vercel preview deployment", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isPreviewDeployment()).toBe(true);

    process.env.VERCEL_ENV = "production";
    expect(isPreviewDeployment()).toBe(false);

    delete process.env.VERCEL_ENV;
    expect(isPreviewDeployment()).toBe(false);
  });
});

describe("buildXeroOAuthStartUrl", () => {
  it("disables Xero connect on preview deployments", () => {
    process.env.VERCEL_ENV = "preview";

    const result = buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("connect_disabled");
    }
  });

  it("returns oauth_not_configured when credentials are missing", () => {
    delete process.env.XERO_CLIENT_ID;
    delete process.env.XERO_CLIENT_SECRET;

    const result = buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("oauth_not_configured");
    }
  });

  it("uses the pre-registered redirect URI when configured", () => {
    const result = buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const redirectUrl = new URL(result.value.redirectUrl);
      expect(redirectUrl.searchParams.get("redirect_uri")).toBe(
        "https://api.example.com/api/xero/oauth/callback"
      );
    }
  });
});

describe("xeroConnectionRefreshDecision", () => {
  const now = new Date("2026-06-09T12:00:00.000Z");
  const base = {
    hasRefreshToken: true,
    revokedAt: null as Date | null,
    status: "active" as string | null,
  };

  it("uses the token as-is when it is comfortably before expiry", () => {
    const expiresAt = new Date(now.getTime() + 20 * 60 * 1000);
    expect(xeroConnectionRefreshDecision({ ...base, expiresAt }, now)).toBe(
      "active"
    );
  });

  it("refreshes when the token is within the expiry buffer", () => {
    const expiresAt = new Date(now.getTime() + 60 * 1000);
    expect(xeroConnectionRefreshDecision({ ...base, expiresAt }, now)).toBe(
      "refresh"
    );
  });

  it("refreshes when the token has already lapsed", () => {
    const expiresAt = new Date(now.getTime() - 60 * 1000);
    expect(xeroConnectionRefreshDecision({ ...base, expiresAt }, now)).toBe(
      "refresh"
    );
  });

  it("is inactive when within the buffer but no refresh token is stored", () => {
    const expiresAt = new Date(now.getTime() + 60 * 1000);
    expect(
      xeroConnectionRefreshDecision(
        { ...base, expiresAt, hasRefreshToken: false },
        now
      )
    ).toBe("inactive");
  });

  it("is inactive when revoked, disconnected, or stale", () => {
    const expiresAt = new Date(now.getTime() + 20 * 60 * 1000);
    expect(
      xeroConnectionRefreshDecision({ ...base, expiresAt, revokedAt: now }, now)
    ).toBe("inactive");
    expect(
      xeroConnectionRefreshDecision(
        { ...base, expiresAt, status: "disconnected" },
        now
      )
    ).toBe("inactive");
    expect(
      xeroConnectionRefreshDecision(
        { ...base, expiresAt, status: "stale" },
        now
      )
    ).toBe("inactive");
  });
});

describe("ensureFreshXeroConnection", () => {
  const input = {
    clerkOrgId: "org_1",
    connectionId: "conn_1",
    organisationId: "11111111-1111-1111-1111-111111111111",
    now: new Date("2026-06-09T12:00:00.000Z"),
  };

  it("returns organisation_not_found when the connection is missing", async () => {
    dbMock.xeroConnection.findFirst.mockResolvedValueOnce(null);

    const result = await ensureFreshXeroConnection(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("organisation_not_found");
    }
    expect(dbMock.xeroConnection.update).not.toHaveBeenCalled();
  });

  it("does not refresh a token that is valid beyond the buffer", async () => {
    dbMock.xeroConnection.findFirst.mockResolvedValueOnce({
      expires_at: new Date(input.now.getTime() + 20 * 60 * 1000),
      refresh_token_encrypted: "refresh-token",
      revoked_at: null,
      status: "active",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await ensureFreshXeroConnection(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.refreshed).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMock.xeroConnection.update).not.toHaveBeenCalled();
  });

  it("returns connection_inactive for a revoked connection", async () => {
    dbMock.xeroConnection.findFirst.mockResolvedValueOnce({
      expires_at: new Date(input.now.getTime() + 20 * 60 * 1000),
      refresh_token_encrypted: "refresh-token",
      revoked_at: input.now,
      status: "active",
    });

    const result = await ensureFreshXeroConnection(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("connection_inactive");
    }
    expect(dbMock.xeroConnection.update).not.toHaveBeenCalled();
  });

  it("refreshes and re-persists the token before returning when near expiry", async () => {
    dbMock.xeroConnection.findFirst
      // ensureFreshXeroConnection: initial connection state (near expiry)
      .mockResolvedValueOnce({
        expires_at: new Date(input.now.getTime() + 60 * 1000),
        refresh_token_encrypted: "refresh-token",
        revoked_at: null,
        status: "active",
      })
      // refreshXeroOAuthConnection: refresh-token material (iv/auth_tag null -> plaintext)
      .mockResolvedValueOnce({
        id: input.connectionId,
        refresh_token_auth_tag: null,
        refresh_token_encrypted: "refresh-token",
        refresh_token_iv: null,
      })
      // ensureFreshXeroConnection: re-read expiry after refresh
      .mockResolvedValueOnce({
        expires_at: new Date(input.now.getTime() + 30 * 60 * 1000),
      });
    dbMock.xeroConnection.update.mockResolvedValueOnce({});

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "new-access-token",
        expires_in: 1800,
        refresh_token: "new-refresh-token",
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await ensureFreshXeroConnection(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.refreshed).toBe(true);
    }
    // The token exchange happened and the new tokens were persisted before returning.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(dbMock.xeroConnection.update).toHaveBeenCalledTimes(1);
    const updateArg = dbMock.xeroConnection.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("active");
    expect(updateArg.data.access_token_encrypted).not.toBe("");
  });
});
