import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptXeroToken } from "../crypto/tokens";

vi.mock("server-only", () => ({}));

const dbMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  organisation: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  xeroConnection: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  xeroOAuthSession: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  xeroTenant: {
    upsert: vi.fn(),
  },
}));
const feedMock = vi.hoisted(() => ({
  ensureDefaultCalendarFeed: vi.fn(),
}));
const holidayMock = vi.hoisted(() => ({
  ensureDefaultPublicHolidaysForOrganisation: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: dbMock,
}));
vi.mock("@repo/feeds", () => feedMock);
vi.mock("@repo/availability", () => holidayMock);

const {
  buildXeroOAuthStartUrl,
  completeXeroOAuth,
  completeXeroTenantSelection,
  ensureFreshXeroConnection,
  isPreviewDeployment,
  xeroConnectionRefreshDecision,
} = await import("./service");

const ORIGINAL_ENV = { ...process.env };

function buildStoredTokenFields() {
  const accessToken = encryptXeroToken("access-token");
  const refreshToken = encryptXeroToken("refresh-token");

  return {
    access_token_auth_tag: accessToken.authTag,
    access_token_encrypted: accessToken.encrypted,
    access_token_iv: accessToken.iv,
    refresh_token_auth_tag: refreshToken.authTag,
    refresh_token_encrypted: refreshToken.encrypted,
    refresh_token_iv: refreshToken.iv,
  };
}

beforeEach(() => {
  process.env.XERO_CLIENT_ID = "client-id";
  process.env.XERO_CLIENT_SECRET = "client-secret";
  process.env.XERO_REDIRECT_URI =
    "https://api.example.com/api/xero/oauth/callback";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
  delete process.env.VERCEL_ENV;
  dbMock.$queryRaw.mockReset();
  dbMock.$queryRaw.mockResolvedValue([]);
  dbMock.$transaction.mockReset();
  dbMock.$transaction.mockImplementation((callback) => callback(dbMock));
  dbMock.organisation.create.mockReset();
  dbMock.organisation.findFirst.mockReset();
  dbMock.organisation.findMany.mockReset();
  dbMock.xeroConnection.findFirst.mockReset();
  dbMock.xeroConnection.upsert.mockReset();
  dbMock.xeroConnection.update.mockReset();
  dbMock.xeroOAuthSession.findFirst.mockReset();
  dbMock.xeroOAuthSession.update.mockReset();
  dbMock.xeroTenant.upsert.mockReset();
  feedMock.ensureDefaultCalendarFeed.mockReset();
  feedMock.ensureDefaultCalendarFeed.mockResolvedValue({
    ok: true,
    value: { created: true, feedId: "feed_1" },
  });
  holidayMock.ensureDefaultPublicHolidaysForOrganisation.mockReset();
  holidayMock.ensureDefaultPublicHolidaysForOrganisation.mockResolvedValue({
    ok: true,
    value: {
      importedCount: 2,
      importedYears: [2026, 2027],
      skippedCount: 0,
      skippedYears: [],
    },
  });
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

  it("fails closed when verifying state without the client secret", async () => {
    const start = buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });
    expect(start.ok).toBe(true);
    if (!start.ok) {
      return;
    }

    const redirectUrl = new URL(start.value.redirectUrl);
    const state = redirectUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const previousSecret = process.env.XERO_CLIENT_SECRET;
    delete process.env.XERO_CLIENT_SECRET;

    try {
      const result = await completeXeroOAuth({
        code: "authorisation-code",
        state: state ?? "",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("oauth_not_configured");
      }
    } finally {
      process.env.XERO_CLIENT_SECRET = previousSecret;
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
    hasAccessToken: true,
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

  it("refreshes when the access token is missing but a refresh token exists", () => {
    const expiresAt = new Date(now.getTime() + 20 * 60 * 1000);
    expect(
      xeroConnectionRefreshDecision(
        { ...base, expiresAt, hasAccessToken: false },
        now
      )
    ).toBe("refresh");
  });

  it("is inactive when both the access and refresh tokens are missing", () => {
    const expiresAt = new Date(now.getTime() + 20 * 60 * 1000);
    expect(
      xeroConnectionRefreshDecision(
        { ...base, expiresAt, hasAccessToken: false, hasRefreshToken: false },
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
      ...buildStoredTokenFields(),
      expires_at: new Date(input.now.getTime() + 20 * 60 * 1000),
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
      ...buildStoredTokenFields(),
      expires_at: new Date(input.now.getTime() + 20 * 60 * 1000),
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
    const storedTokens = buildStoredTokenFields();
    dbMock.xeroConnection.findFirst
      // ensureFreshXeroConnection: initial connection state (near expiry)
      .mockResolvedValueOnce({
        ...storedTokens,
        expires_at: new Date(input.now.getTime() + 60 * 1000),
        revoked_at: null,
        status: "active",
      })
      // ensureFreshXeroConnection: re-read inside the advisory lock.
      .mockResolvedValueOnce({
        ...storedTokens,
        expires_at: new Date(input.now.getTime() + 60 * 1000),
        revoked_at: null,
        status: "active",
      })
      // refreshXeroOAuthConnection: scoped encrypted refresh-token material.
      .mockResolvedValueOnce({
        id: input.connectionId,
        refresh_token_auth_tag: storedTokens.refresh_token_auth_tag,
        refresh_token_encrypted: storedTokens.refresh_token_encrypted,
        refresh_token_iv: storedTokens.refresh_token_iv,
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
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://identity.xero.com/connect/token",
      expect.objectContaining({ method: "POST" })
    );
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeInstanceOf(URLSearchParams);
    if (requestBody instanceof URLSearchParams) {
      expect(requestBody.get("refresh_token")).toBe("refresh-token");
    }
    expect(dbMock.xeroConnection.update).toHaveBeenCalledTimes(1);
    const updateArg = dbMock.xeroConnection.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("active");
    expect(updateArg.data.access_token_encrypted).not.toBe("");
  });

  it("skips refresh inside the lock when another caller already refreshed", async () => {
    const storedTokens = buildStoredTokenFields();
    dbMock.xeroConnection.findFirst
      .mockResolvedValueOnce({
        ...storedTokens,
        expires_at: new Date(input.now.getTime() + 60 * 1000),
        revoked_at: null,
        status: "active",
      })
      .mockResolvedValueOnce({
        ...storedTokens,
        expires_at: new Date(input.now.getTime() + 20 * 60 * 1000),
        revoked_at: null,
        status: "active",
      });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await ensureFreshXeroConnection(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        expiresAt: new Date(input.now.getTime() + 20 * 60 * 1000),
        refreshed: false,
      });
    }
    expect(dbMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMock.xeroConnection.update).not.toHaveBeenCalled();
  });

  it("refreshes inside the lock when the locked re-read is still stale", async () => {
    const storedTokens = buildStoredTokenFields();
    dbMock.xeroConnection.findFirst
      .mockResolvedValueOnce({
        ...storedTokens,
        expires_at: new Date(input.now.getTime() + 60 * 1000),
        revoked_at: null,
        status: "active",
      })
      .mockResolvedValueOnce({
        ...storedTokens,
        expires_at: new Date(input.now.getTime() + 60 * 1000),
        revoked_at: null,
        status: "active",
      })
      .mockResolvedValueOnce({
        id: input.connectionId,
        refresh_token_auth_tag: storedTokens.refresh_token_auth_tag,
        refresh_token_encrypted: storedTokens.refresh_token_encrypted,
        refresh_token_iv: storedTokens.refresh_token_iv,
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
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeInstanceOf(URLSearchParams);
    if (requestBody instanceof URLSearchParams) {
      expect(requestBody.get("refresh_token")).toBe("refresh-token");
    }
    expect(dbMock.xeroConnection.update).toHaveBeenCalledTimes(1);
    const updateArg = dbMock.xeroConnection.update.mock.calls[0][0];
    expect(updateArg.data.refresh_token_encrypted).not.toBe(
      storedTokens.refresh_token_encrypted
    );
  });

  it("serialises concurrent refresh checks so only the winner exchanges tokens", async () => {
    const storedTokens = buildStoredTokenFields();
    const staleConnection = {
      ...storedTokens,
      expires_at: new Date(input.now.getTime() + 60 * 1000),
      revoked_at: null,
      status: "active",
    };
    const freshConnection = {
      ...storedTokens,
      expires_at: new Date(input.now.getTime() + 20 * 60 * 1000),
      revoked_at: null,
      status: "active",
    };
    dbMock.xeroConnection.findFirst
      .mockResolvedValueOnce(staleConnection)
      .mockResolvedValueOnce(staleConnection)
      .mockResolvedValueOnce(staleConnection)
      .mockResolvedValueOnce({
        id: input.connectionId,
        refresh_token_auth_tag: storedTokens.refresh_token_auth_tag,
        refresh_token_encrypted: storedTokens.refresh_token_encrypted,
        refresh_token_iv: storedTokens.refresh_token_iv,
      })
      .mockResolvedValueOnce(freshConnection);
    dbMock.xeroConnection.update.mockResolvedValueOnce({});

    let lockHeld = false;
    let releaseLock: (() => void) | undefined;
    dbMock.$queryRaw.mockImplementation(async () => {
      if (!lockHeld) {
        lockHeld = true;
        return [];
      }
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      return [];
    });
    dbMock.$transaction.mockImplementation(async (callback) => {
      const result = await callback(dbMock);
      if (lockHeld) {
        lockHeld = false;
        releaseLock?.();
      }
      return result;
    });

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

    const [first, second] = await Promise.all([
      ensureFreshXeroConnection(input),
      ensureFreshXeroConnection(input),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(dbMock.xeroConnection.update).toHaveBeenCalledTimes(1);
  });

  it("returns unknown_error when acquiring the advisory lock fails", async () => {
    const storedTokens = buildStoredTokenFields();
    dbMock.xeroConnection.findFirst.mockResolvedValueOnce({
      ...storedTokens,
      expires_at: new Date(input.now.getTime() + 60 * 1000),
      revoked_at: null,
      status: "active",
    });
    dbMock.$queryRaw.mockRejectedValueOnce(new Error("lock failed"));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await ensureFreshXeroConnection(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMock.xeroConnection.update).not.toHaveBeenCalled();
  });
});

describe("completeXeroTenantSelection", () => {
  const sessionId = "90000000-0000-4000-8000-000000000001";
  const organisationId = "90000000-0000-4000-8000-000000000002";
  const connectionId = "90000000-0000-4000-8000-000000000003";
  const xeroTenantRowId = "90000000-0000-4000-8000-000000000004";
  const clerkOrgId = "org_xero_default_feed";
  const tenantId = "xero-tenant-1";

  beforeEach(() => {
    dbMock.xeroOAuthSession.findFirst.mockResolvedValue(buildPendingSession());
    dbMock.organisation.findMany.mockResolvedValue([]);
    dbMock.organisation.create.mockResolvedValue({ id: organisationId });
    dbMock.xeroConnection.upsert.mockResolvedValue({ id: connectionId });
    dbMock.xeroTenant.upsert.mockResolvedValue({ id: xeroTenantRowId });
    dbMock.xeroOAuthSession.update.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Organisations: [{ CountryCode: "AU", Name: "Acme Payroll" }],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 }
        )
      )
    );
  });

  it("provisions the default feed when tenant selection creates an organisation", async () => {
    const result = await completeXeroTenantSelection({
      clerkOrgId,
      sessionId,
      tenantId,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        connectionId,
        organisationId,
        xeroTenantId: xeroTenantRowId,
      },
    });
    expect(dbMock.organisation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clerk_org_id: clerkOrgId,
          country_code: "AU",
          name: "Acme Payroll",
        }),
      })
    );
    expect(feedMock.ensureDefaultCalendarFeed).toHaveBeenCalledWith({
      clerkOrgId,
      organisationId,
    });
    expect(
      holidayMock.ensureDefaultPublicHolidaysForOrganisation
    ).toHaveBeenCalledWith({
      clerkOrgId,
      organisationId,
    });
    expect(dbMock.xeroConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clerk_org_id: clerkOrgId,
          organisation_id: organisationId,
        }),
        where: { organisation_id: organisationId },
      })
    );
  });

  it("fails tenant selection when default feed provisioning fails", async () => {
    feedMock.ensureDefaultCalendarFeed.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to create default feed.",
      },
    });

    const result = await completeXeroTenantSelection({
      clerkOrgId,
      sessionId,
      tenantId,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to create default feed.",
      },
    });
    expect(dbMock.xeroConnection.upsert).not.toHaveBeenCalled();
    expect(dbMock.xeroTenant.upsert).not.toHaveBeenCalled();
    expect(dbMock.xeroOAuthSession.update).not.toHaveBeenCalled();
    expect(
      holidayMock.ensureDefaultPublicHolidaysForOrganisation
    ).not.toHaveBeenCalled();
  });

  it("continues tenant selection when default holiday provisioning fails", async () => {
    holidayMock.ensureDefaultPublicHolidaysForOrganisation.mockResolvedValueOnce(
      {
        ok: false,
        error: {
          code: "internal",
          message: "Nager unavailable",
        },
      }
    );

    const result = await completeXeroTenantSelection({
      clerkOrgId,
      sessionId,
      tenantId,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        connectionId,
        organisationId,
        xeroTenantId: xeroTenantRowId,
      },
    });
    expect(dbMock.xeroConnection.upsert).toHaveBeenCalled();
    expect(dbMock.xeroTenant.upsert).toHaveBeenCalled();
    expect(
      holidayMock.ensureDefaultPublicHolidaysForOrganisation
    ).toHaveBeenCalledWith({
      clerkOrgId,
      organisationId,
    });
  });

  function buildPendingSession() {
    const accessToken = encryptXeroToken("access-token");
    const refreshToken = encryptXeroToken("refresh-token");

    return {
      access_token_auth_tag: accessToken.authTag,
      access_token_encrypted: accessToken.encrypted,
      access_token_iv: accessToken.iv,
      available_tenants_json: {
        tenants: [{ tenantId, tenantName: "Acme Payroll" }],
      },
      expires_at: new Date("2026-07-07T00:15:00.000Z"),
      id: sessionId,
      organisation_id: null,
      refresh_token_auth_tag: refreshToken.authTag,
      refresh_token_encrypted: refreshToken.encrypted,
      refresh_token_iv: refreshToken.iv,
      return_to: "/settings/integrations/xero",
      token_expires_at: new Date("2026-07-07T00:30:00.000Z"),
    };
  }
});
