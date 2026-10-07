import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptXeroToken, encryptXeroToken } from "../crypto/tokens";

vi.mock("server-only", () => ({}));
const dbMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  auditEvent: { create: vi.fn() },
  organisation: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  xeroAuthorisation: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  xeroConnection: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  xeroOAuthSession: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn(),
  },
}));
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
const feedMock = vi.hoisted(() => ({ ensureDefaultCalendarFeed: vi.fn() }));
const availabilityMock = vi.hoisted(() => ({
  ensureDefaultPublicHolidaysForOrganisation: vi.fn(),
}));
const lockMock = vi.hoisted(() => ({ grant: vi.fn() }));
const identityMock = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@repo/database", () => ({
  database: dbMock,
  lockXeroAuthorisation: vi.fn(),
  withXeroGrantLock: lockMock.grant,
}));
vi.mock("@repo/database/queries/xero-connections", () => ({
  getScopedXeroConnection: async (input: {
    clerkOrgId: string;
    organisationId: string;
    connectionId?: string;
  }) => {
    const row = await dbMock.xeroConnection.findFirst({
      include: { authorisation: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        ...(input.connectionId ? { id: input.connectionId } : {}),
      },
    });
    return row
      ? { ok: true, value: row }
      : {
          error: { code: "not_connected", message: "Xero is not connected." },
          ok: false,
        };
  },
}));
vi.mock("./identity", () => ({
  verifyXeroAccessTokenIdentity: identityMock.verify,
}));
vi.mock("@repo/observability/log", () => ({ log: loggerMock }));
vi.mock("@repo/feeds", () => feedMock);
vi.mock("@repo/availability", () => availabilityMock);
const {
  buildXeroOAuthStartUrl,
  completeXeroOAuth,
  cancelXeroOAuth,
  completeXeroTenantSelection,
  isLocalApplicationPath,
  isPreviewDeployment,
  purgeClosedXeroOAuthSessions,
} = await import("./service");
const { resolveXeroAccess } = await import("./authorisation");
const ORIGINAL_ENV = { ...process.env };
interface OAuthTestStatePayload {
  clerkOrgId: string;
  issuedAt: number;
  nonce: string;
  organisationId: string | null;
  returnTo: string;
  sessionId: string;
  userId: string | null;
}
function readStatePayload(redirectUrl: string): OAuthTestStatePayload {
  const [encoded] = (
    new URL(redirectUrl).searchParams.get("state") ?? ""
  ).split(".");
  if (!encoded) {
    throw new Error("Expected signed OAuth state.");
  }
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}
function buildStoredTokenFields(
  access = "access-token",
  refresh = "refresh-token"
) {
  const a = encryptXeroToken(access),
    r = encryptXeroToken(refresh);
  return {
    access_token_auth_tag: a.authTag,
    access_token_encrypted: a.encrypted,
    access_token_iv: a.iv,
    refresh_token_auth_tag: r.authTag,
    refresh_token_encrypted: r.encrypted,
    refresh_token_iv: r.iv,
    token_encrypted_at: a.encryptedAt,
    token_key_version: a.keyVersion,
  };
}
function canonicalGrant(expiresAt = new Date(Date.now() + 1_800_000)) {
  return {
    access_token_expires_at: expiresAt,
    granted_scopes: ["payroll.employees"],
    id: "grant_1",
    last_refreshed_at: new Date(),
    provider_app_id: "client-id",
    status: "active",
    xero_user_id: "user1",
    ...buildStoredTokenFields(),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  process.env.XERO_CLIENT_ID = "client-id";
  process.env.XERO_CLIENT_SECRET = "client-secret";
  process.env.XERO_REDIRECT_URI =
    "https://api.example.com/api/xero/oauth/callback";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
  delete process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION;
  delete process.env.XERO_TOKEN_ENCRYPTION_KEYS_JSON;
  delete process.env.VERCEL_ENV;
  dbMock.organisation.findMany.mockResolvedValue([]);
  dbMock.xeroOAuthSession.findMany.mockResolvedValue([]);
  dbMock.$queryRaw.mockResolvedValue([]);
  dbMock.$transaction.mockImplementation((callback) => callback(dbMock));
  lockMock.grant.mockImplementation((_input, callback) => callback(dbMock));
  dbMock.xeroOAuthSession.create.mockImplementation(({ data }) => {
    const row = { id: "session_1", ...data };
    dbMock.xeroOAuthSession.findFirst.mockResolvedValue(row);
    return row;
  });
  dbMock.xeroOAuthSession.updateMany.mockResolvedValue({ count: 1 });
  dbMock.xeroConnection.updateMany.mockResolvedValue({ count: 1 });
  dbMock.xeroConnection.findFirst.mockResolvedValue(null);
  dbMock.xeroAuthorisation.upsert.mockImplementation(({ create }) => ({
    id: "grant_1",
    ...create,
  }));
  identityMock.verify.mockResolvedValue({
    ok: true,
    value: {
      authEventId: null,
      expiresAt: new Date(Date.now() + 1_800_000),
      grantedScopes: ["payroll.employees"],
      xeroUserId: "user1",
    },
  });
  feedMock.ensureDefaultCalendarFeed.mockResolvedValue({
    ok: true,
    value: { created: true, feedId: "feed_1" },
  });
  availabilityMock.ensureDefaultPublicHolidaysForOrganisation.mockResolvedValue(
    {
      ok: true,
      value: {
        importedCount: 2,
        importedYears: [2026, 2027],
        skippedCount: 0,
        skippedYears: [],
      },
    }
  );
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
  it("uses business actions for state and configuration failures", async () => {
    expect(
      await completeXeroOAuth({
        authenticatedClerkOrgId: "org_1",
        authenticatedUserId: "user_1",
        code: "code",
        nonce: "nonce",
        state: "invalid",
      })
    ).toMatchObject({
      error: { message: "Start connecting Xero again." },
      ok: false,
    });
    delete process.env.XERO_CLIENT_SECRET;
    expect(
      await buildXeroOAuthStartUrl({ clerkOrgId: "org_1", userId: "user_1" })
    ).toMatchObject({
      error: { message: "Connecting Xero is unavailable. Contact support." },
      ok: false,
    });
  });
  it("requests exactly the minimal four scopes", async () => {
    const result = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    expect(
      result.ok && new URL(result.value.redirectUrl).searchParams.get("scope")
    ).toBe(
      "offline_access accounting.settings.read payroll.employees payroll.settings.read"
    );
  });
  it("disables Xero connect on preview deployments", async () => {
    process.env.VERCEL_ENV = "preview";

    const result = await buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("connect_disabled");
    }
  });

  it("returns oauth_not_configured when credentials are missing", async () => {
    delete process.env.XERO_CLIENT_ID;
    delete process.env.XERO_CLIENT_SECRET;

    const result = await buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("oauth_not_configured");
    }
  });

  it("fails closed when verifying state without the client secret", async () => {
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
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
        nonce: start.value.nonce,
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

  it("uses the pre-registered redirect URI when configured", async () => {
    const result = await buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const redirectUrl = new URL(result.value.redirectUrl);
      expect(redirectUrl.searchParams.get("redirect_uri")).toBe(
        "https://api.example.com/api/xero/oauth/callback"
      );
    }
  });

  it("signs the default local return path", async () => {
    const result = await buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(readStatePayload(result.value.redirectUrl).returnTo).toBe(
        "/settings/integrations/xero"
      );
    }
  });

  it("preserves a valid local return path with a query and fragment", async () => {
    const returnTo = "/calendar?team=people#upcoming";
    const result = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      returnTo,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(readStatePayload(result.value.redirectUrl).returnTo).toBe(
        returnTo
      );
    }
  });

  it.each([
    "https://attacker.example/path",
    "http://attacker.example/path",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "/settings\n/integrations",
  ])("rejects the unsafe return path %j", async (returnTo) => {
    const result = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      returnTo,
    });

    expect(result).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
  });
});

describe("completeXeroOAuth", () => {
  it("returns and logs no code, token, state or nonce when the exchange fails", async () => {
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    if (!start.ok) {
      throw new Error("Expected start");
    }
    const state =
      new URL(start.value.redirectUrl).searchParams.get("state") ?? "";
    const code = "sensitive-synthetic-code";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            access_token: "sensitive-synthetic-token",
            error: "synthetic-error",
          },
          { status: 400 }
        )
      )
    );
    const result = await completeXeroOAuth({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code,
      nonce: start.value.nonce,
      state,
    });
    expect(result.ok).toBe(false);
    const exposed = JSON.stringify({
      logs: [
        loggerMock.info.mock.calls,
        loggerMock.warn.mock.calls,
        loggerMock.error.mock.calls,
      ],
      result,
    });
    for (const secret of [
      code,
      state,
      start.value.nonce,
      "sensitive-synthetic-token",
    ]) {
      expect(exposed).not.toContain(secret);
    }
  });

  it("stores the exact remote connection tuple in the reference-only selection session", async () => {
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    expect(start.ok).toBe(true);
    if (!start.ok) {
      return;
    }

    const state = new URL(start.value.redirectUrl).searchParams.get("state");
    dbMock.xeroOAuthSession.create.mockResolvedValueOnce({ id: "session_1" });
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token",
            expires_in: 1800,
            refresh_token: "refresh-token",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "xero-connection-1",
              tenantId: "xero-tenant-1",
              tenantName: "Acme Payroll",
              tenantType: "ORGANISATION",
            },
            {
              id: "xero-connection-2",
              tenantId: "xero-tenant-2",
              tenantName: "Second Payroll",
              tenantType: "ORGANISATION",
            },
          ]),
          { headers: { "Content-Type": "application/json" }, status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await completeXeroOAuth({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "authorisation-code",
      nonce: start.value.nonce,
      state: state ?? "",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { sessionId: "session_1" },
    });
    expect(dbMock.xeroOAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          available_tenants_json: {
            authEventId: null,
            tenants: [
              {
                connectionId: "xero-connection-1",
                tenantId: "xero-tenant-1",
                tenantName: "Acme Payroll",
              },
              {
                connectionId: "xero-connection-2",
                tenantId: "xero-tenant-2",
                tenantName: "Second Payroll",
              },
            ],
          },
        }),
      })
    );
  });

  it("rejects a missing nonce before exchanging the authorisation code", async () => {
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    expect(start.ok).toBe(true);
    if (!start.ok) {
      return;
    }

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await completeXeroOAuth({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "authorisation-code",
      nonce: null,
      state: new URL(start.value.redirectUrl).searchParams.get("state") ?? "",
    });

    expect(result).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a mismatched nonce before exchanging the authorisation code", async () => {
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    expect(start.ok).toBe(true);
    if (!start.ok) {
      return;
    }

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await completeXeroOAuth({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "authorisation-code",
      nonce: "mismatched-nonce",
      state: new URL(start.value.redirectUrl).searchParams.get("state") ?? "",
    });

    expect(result).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("isLocalApplicationPath", () => {
  it("accepts local application paths only", () => {
    expect(isLocalApplicationPath("/calendar?team=people#upcoming")).toBe(true);
    expect(isLocalApplicationPath("/")).toBe(true);
    expect(isLocalApplicationPath("//attacker.example/path")).toBe(false);
    expect(isLocalApplicationPath("/\\attacker.example/path")).toBe(false);
    expect(isLocalApplicationPath("/settings\u0085/integrations")).toBe(false);
  });
});

describe("Xero OAuth state", () => {
  it("mints distinct states for identical inputs", async () => {
    const first = await buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });
    const second = await buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });
    expect(first.ok && second.ok).toBe(true);
    if (!(first.ok && second.ok)) {
      return;
    }

    expect(first.value.nonce).not.toBe(second.value.nonce);
    expect(new URL(first.value.redirectUrl).searchParams.get("state")).not.toBe(
      new URL(second.value.redirectUrl).searchParams.get("state")
    );
  });

  it("rejects an eleven-minute-old state before exchanging the authorisation code", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    expect(start.ok).toBe(true);
    if (!start.ok) {
      return;
    }

    nowSpy.mockReturnValue(1_660_000);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await completeXeroOAuth({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "authorisation-code",
      nonce: start.value.nonce,
      state: new URL(start.value.redirectUrl).searchParams.get("state") ?? "",
    });

    expect(result).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a tampered state", async () => {
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    expect(start.ok).toBe(true);
    if (!start.ok) {
      return;
    }

    const state =
      new URL(start.value.redirectUrl).searchParams.get("state") ?? "";
    const [encoded, signature] = state.split(".");
    const result = await completeXeroOAuth({
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "authorisation-code",
      nonce: start.value.nonce,
      state: `${encoded.slice(0, -1)}x.${signature}`,
    });

    expect(result).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
  });
});

describe("canonical callback security", () => {
  async function startCallback() {
    const start = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      userId: "user_1",
    });
    if (!start.ok) {
      throw new Error("Expected start");
    }
    return {
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "code",
      nonce: start.value.nonce,
      state: new URL(start.value.redirectUrl).searchParams.get("state") ?? "",
    };
  }
  it.each([
    { authenticatedClerkOrgId: "foreign" },
    { authenticatedUserId: "foreign" },
  ])(
    "rejects a changed authenticated actor %j before code exchange",
    async (change) => {
      const input = await startCallback();
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      expect(await completeXeroOAuth({ ...input, ...change })).toMatchObject({
        error: { code: "invalid_state" },
        ok: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
  it("rejects callback replay before code exchange", async () => {
    const input = await startCallback();
    dbMock.xeroOAuthSession.updateMany.mockResolvedValueOnce({ count: 0 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await completeXeroOAuth(input)).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("rejects Unicode signature and nonce mismatches without throwing", async () => {
    const input = await startCallback();
    const [payload, signature] = input.state.split(".");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(
      await completeXeroOAuth({
        ...input,
        state: `${payload}.${"é".repeat(signature?.length ?? 0)}`,
      })
    ).toMatchObject({ error: { code: "invalid_state" }, ok: false });
    expect(
      await cancelXeroOAuth({ ...input, nonce: "é".repeat(input.nonce.length) })
    ).toMatchObject({ error: { code: "invalid_state" }, ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("cancels authenticated consent without exchanging a code", async () => {
    const input = await startCallback();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await cancelXeroOAuth(input)).toMatchObject({
      ok: true,
      value: {
        redirectTo: "/settings/integrations/xero?xero=cancelled",
        sessionId: "session_1",
      },
    });
    expect(dbMock.xeroOAuthSession.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nonce_hash: null,
          state_hash: null,
          status: "cancelled",
          xero_authorisation_id: null,
        }),
        where: expect.objectContaining({
          clerk_org_id: "org_1",
          created_by_user_id: "user_1",
          status: "pending",
        }),
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("cannot adopt a grant without a configured provider app identity", async () => {
    const input = await startCallback();
    const provider = vi.fn((url) => {
      if (String(url).endsWith("/connect/token")) {
        delete process.env.XERO_CLIENT_ID;
        return Response.json({
          access_token: "access-token",
          expires_in: 1800,
          refresh_token: "refresh-token",
        });
      }
      return Response.json([
        {
          id: "link_1",
          tenantId: "file_1",
          tenantName: "Payroll",
          tenantType: "ORGANISATION",
        },
        {
          id: "link_2",
          tenantId: "file_2",
          tenantName: "Other",
          tenantType: "ORGANISATION",
        },
      ]);
    });
    vi.stubGlobal("fetch", provider);
    expect(await completeXeroOAuth(input)).toMatchObject({
      error: { code: "oauth_not_configured" },
      ok: false,
    });
    expect(dbMock.xeroAuthorisation.upsert).not.toHaveBeenCalled();
  });
  it("adopts encrypted credentials in the canonical grant and leaves the session reference-only", async () => {
    const input = await startCallback();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "access-token",
          expires_in: 1800,
          refresh_token: "refresh-token",
          scope: "payroll.employees",
        })
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            id: "link_1",
            tenantId: "file_1",
            tenantName: "Payroll",
            tenantType: "ORGANISATION",
          },
          {
            id: "link_2",
            tenantId: "file_2",
            tenantName: "Other",
            tenantType: "ORGANISATION",
          },
        ])
      );
    vi.stubGlobal("fetch", fetchSpy);
    expect(await completeXeroOAuth(input)).toMatchObject({ ok: true });
    const saved = dbMock.xeroAuthorisation.upsert.mock.calls[0]?.[0].create;
    expect(saved).toMatchObject({
      granted_scopes: ["payroll.employees"],
      provider_app_id: "client-id",
      xero_user_id: "user1",
    });
    expect(
      decryptXeroToken({
        authTag: saved.access_token_auth_tag,
        encrypted: saved.access_token_encrypted,
        iv: saved.access_token_iv,
        keyVersion: saved.token_key_version,
      })
    ).toBe("access-token");
    for (const [call] of dbMock.xeroOAuthSession.updateMany.mock.calls) {
      expect(call.data).not.toHaveProperty("access_token_encrypted");
      expect(call.data).not.toHaveProperty("refresh_token_encrypted");
    }
    expect(dbMock.xeroOAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "selecting",
          xero_authorisation_id: "grant_1",
        }),
      })
    );
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://identity.xero.com/connect/token");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`
    );
    expect(new URLSearchParams(init.body).get("redirect_uri")).toBe(
      "https://api.example.com/api/xero/oauth/callback"
    );
  });
});

describe("canonical refresh", () => {
  const input = {
    clerkOrgId: "org_1",
    connectionId: "conn_1",
    organisationId: "payroll_1",
  };
  function setup(expiresAt = new Date(Date.now() - 60_000)) {
    const grant = canonicalGrant(expiresAt);
    dbMock.xeroConnection.findFirst.mockResolvedValue({
      authorisation: grant,
      id: input.connectionId,
      payroll_region: "AU",
      status: "active",
      xero_authorisation_id: grant.id,
      xero_tenant_id: "file_1",
    });
    dbMock.xeroAuthorisation.findUnique.mockResolvedValue(grant);
    dbMock.xeroAuthorisation.findUniqueOrThrow.mockResolvedValue(grant);
    dbMock.xeroAuthorisation.update.mockImplementation(({ data }) => ({
      ...grant,
      ...data,
    }));
    return grant;
  }
  it("uses a comfortably valid canonical token without HTTP or credential writes", async () => {
    setup(new Date(Date.now() + 1_800_000));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolveXeroAccess(input)).toMatchObject({
      ok: true,
      value: { accessToken: "access-token" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMock.xeroAuthorisation.update).not.toHaveBeenCalled();
  });
  it("refreshes within the buffer under the credential lock and stores one encrypted pair", async () => {
    setup(new Date(Date.now() + 60_000));
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json({
        access_token: "new-access",
        expires_in: 1800,
        refresh_token: "new-refresh",
        scope: "payroll.employees",
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolveXeroAccess(input)).toMatchObject({
      ok: true,
      value: { accessToken: "new-access" },
    });
    expect(lockMock.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "refresh",
        providerAppId: "client-id",
        xeroUserId: "user1",
      }),
      expect.any(Function)
    );
    const data = dbMock.xeroAuthorisation.update.mock.calls[0]?.[0].data;
    expect(
      decryptXeroToken({
        authTag: data.access_token_auth_tag,
        encrypted: data.access_token_encrypted,
        iv: data.access_token_iv,
        keyVersion: data.token_key_version,
      })
    ).toBe("new-access");
    expect(
      decryptXeroToken({
        authTag: data.refresh_token_auth_tag,
        encrypted: data.refresh_token_encrypted,
        iv: data.refresh_token_iv,
        keyVersion: data.token_key_version,
      })
    ).toBe("new-refresh");
    expect(dbMock.xeroConnection.updateMany).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      new URLSearchParams(fetchSpy.mock.calls[0]?.[1].body).get("refresh_token")
    ).toBe("refresh-token");
  });
  it("rechecks expiry under the lock and skips a concurrent caller's completed rotation", async () => {
    setup();
    dbMock.xeroAuthorisation.findUniqueOrThrow.mockResolvedValue(
      canonicalGrant()
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolveXeroAccess(input)).toMatchObject({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each(["disconnected", "reconnect_required"])(
    "never refreshes an inactive %s connection",
    async (status) => {
      setup();
      dbMock.xeroConnection.findFirst.mockResolvedValue({
        authorisation: canonicalGrant(),
        status,
      });
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      expect(await resolveXeroAccess(input)).toMatchObject({
        error: {
          code:
            status === "disconnected"
              ? "disconnected"
              : "reauthorisation_required",
        },
        ok: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
  it("returns a service error when acquiring the credential lock fails", async () => {
    setup();
    lockMock.grant.mockRejectedValueOnce(new Error("lock unavailable"));
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    await expect(resolveXeroAccess(input)).resolves.toMatchObject({
      error: { code: "unknown_error" },
      ok: false,
    });
    expect(provider).not.toHaveBeenCalled();
  });
  it("scopes connection retrieval with both tenant keys and connection ID", async () => {
    dbMock.xeroConnection.findFirst.mockResolvedValue(null);
    expect(await resolveXeroAccess(input)).toMatchObject({ ok: false });
    expect(dbMock.xeroConnection.findFirst).toHaveBeenCalledWith({
      include: { authorisation: true },
      where: {
        clerk_org_id: "org_1",
        id: "conn_1",
        organisation_id: "payroll_1",
      },
    });
  });
  it.each([
    { expires_in: 1800, refresh_token: "refresh" },
    { access_token: "access", expires_in: 1800, refresh_token: "" },
    { access_token: "access", expires_in: 0, refresh_token: "refresh" },
    { access_token: "access", expires_in: 1.5, refresh_token: "refresh" },
  ])("rejects invalid token response %j", async (body) => {
    setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect(await resolveXeroAccess(input)).toMatchObject({
      error: { code: "invalid_token_response" },
      ok: false,
    });
    expect(dbMock.xeroAuthorisation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          access_token_encrypted: expect.any(String),
        }),
      })
    );
  });
  it("rejects non-JSON success without replacing canonical tokens", async () => {
    setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
    expect(await resolveXeroAccess(input)).toMatchObject({
      error: { code: "invalid_token_response" },
      ok: false,
    });
  });
  it.each(["invalid_grant", "refresh_token_invalid"])(
    "classifies %s and marks only the canonical grant reconnect-required",
    async (error) => {
      setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 }))
      );
      expect(await resolveXeroAccess(input)).toMatchObject({
        error: { code: "refresh_token_invalid" },
        ok: false,
      });
      expect(dbMock.xeroAuthorisation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            last_refresh_error_code: "refresh_token_invalid",
            status: "reconnect_required",
          }),
        })
      );
      expect(dbMock.xeroConnection.updateMany).not.toHaveBeenCalled();
    }
  );
  it.each(["invalid_client", "unauthorized_client"])(
    "classifies %s as configuration failure without revoking the grant",
    async (error) => {
      setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ error }, { status: 401 }))
      );
      expect(await resolveXeroAccess(input)).toMatchObject({
        error: { code: "client_credentials_invalid" },
        ok: false,
      });
      expect(
        dbMock.xeroAuthorisation.update.mock.calls[0]?.[0].data
      ).not.toHaveProperty("status");
    }
  );
  it("surfaces transient token HTTP failure without marking reconnect-required", async () => {
    setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "temporary" }, { status: 503 })
        )
    );
    expect(await resolveXeroAccess(input)).toMatchObject({
      error: { code: "network_error" },
      ok: false,
    });
    expect(
      dbMock.xeroAuthorisation.update.mock.calls[0]?.[0].data
    ).not.toHaveProperty("status");
  });
  it("surfaces dropped token HTTP connections without revoking the grant", async () => {
    setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect(await resolveXeroAccess(input)).toMatchObject({
      error: { code: "network_error" },
      ok: false,
    });
    expect(
      dbMock.xeroAuthorisation.update.mock.calls[0]?.[0].data
    ).not.toHaveProperty("status");
  });
});

describe("canonical tenant selection", () => {
  const input = {
    clerkOrgId: "org_1",
    sessionId: "session_1",
    tenantId: "file_1",
    userId: "user_1",
  };
  beforeEach(() => {
    dbMock.xeroOAuthSession.findFirst.mockResolvedValue({
      available_tenants_json: {
        tenants: [
          {
            connectionId: "remote_1",
            tenantId: "file_1",
            tenantName: "Acme Payroll",
          },
        ],
      },
      id: input.sessionId,
      organisation_id: null,
      return_to: "/calendar",
      xero_authorisation_id: "grant_1",
    });
    dbMock.xeroAuthorisation.findUnique.mockResolvedValue(canonicalGrant());
    dbMock.organisation.findMany.mockResolvedValue([]);
    dbMock.xeroOAuthSession.findMany.mockResolvedValue([]);
    dbMock.organisation.create.mockResolvedValue({ id: "payroll_1" });
    dbMock.xeroConnection.create.mockResolvedValue({
      id: "conn_1",
      organisation_id: "payroll_1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).endsWith("/connections")
          ? Response.json([
              {
                id: "remote_1",
                tenantId: "file_1",
                tenantName: "Acme Payroll",
                tenantType: "ORGANISATION",
              },
            ])
          : Response.json({
              Organisations: [{ CountryCode: "AU", Name: "Acme Payroll" }],
            })
      )
    );
  });
  it("returns a safe error for malformed organisation metadata before saving a connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).endsWith("/connections")
          ? Response.json([
              {
                id: "remote_1",
                tenantId: "file_1",
                tenantName: "Payroll",
                tenantType: "ORGANISATION",
              },
            ])
          : Response.json({ Organisations: [{ CountryCode: 42 }] })
      )
    );
    await expect(completeXeroTenantSelection(input)).resolves.toMatchObject({
      error: { code: "invalid_token_response" },
      ok: false,
    });
    expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
  });
  it("creates one merged connection, completes the session and provisions defaults", async () => {
    expect(await completeXeroTenantSelection(input)).toEqual({
      ok: true,
      value: {
        connectionId: "conn_1",
        organisationId: "payroll_1",
        returnTo: "/calendar",
      },
    });
    expect(dbMock.xeroConnection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clerk_org_id: "org_1",
        organisation_id: "payroll_1",
        payroll_region: "AU",
        remote_connection_id: "remote_1",
        xero_authorisation_id: "grant_1",
        xero_tenant_id: "file_1",
      }),
    });
    expect(feedMock.ensureDefaultCalendarFeed).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      organisationId: "payroll_1",
    });
    expect(
      availabilityMock.ensureDefaultPublicHolidaysForOrganisation
    ).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      organisationId: "payroll_1",
    });
    expect(dbMock.xeroOAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "completed" }),
        where: expect.objectContaining({
          clerk_org_id: "org_1",
          created_by_user_id: "user_1",
          status: "selecting",
        }),
      })
    );
  });
  it("prevents two callers consuming the same selection session", async () => {
    dbMock.xeroOAuthSession.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await completeXeroTenantSelection(input)).toMatchObject({
      ok: false,
    });
    expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
    expect(dbMock.organisation.create).not.toHaveBeenCalled();
  });
  it("reloads the exact remote tuple rather than accepting stale inventory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          {
            id: "other_remote",
            tenantId: "file_1",
            tenantName: "Acme",
            tenantType: "ORGANISATION",
          },
        ])
      )
    );
    expect(await completeXeroTenantSelection(input)).toMatchObject({
      error: { code: "tenant_not_found" },
      ok: false,
    });
    expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
  });
  it.each(["NZ", "GB", "US"])(
    "rejects selecting %s payroll",
    async (country) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).endsWith("/connections")
            ? Response.json([
                {
                  id: "remote_1",
                  tenantId: "file_1",
                  tenantName: "Acme",
                  tenantType: "ORGANISATION",
                },
              ])
            : Response.json({ Organisations: [{ CountryCode: country }] })
        )
      );
      expect(await completeXeroTenantSelection(input)).toMatchObject({
        error: { code: "invalid_country" },
        ok: false,
      });
      expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
    }
  );
  it("rejects a selected file that differs from the scoped organisation country", async () => {
    dbMock.xeroOAuthSession.findFirst.mockResolvedValue({
      available_tenants_json: {
        tenants: [
          {
            connectionId: "remote_1",
            tenantId: "file_1",
            tenantName: "Acme Payroll",
          },
        ],
      },
      id: input.sessionId,
      organisation_id: "payroll_1",
      return_to: "/calendar",
      xero_authorisation_id: "grant_1",
    });
    dbMock.organisation.findMany.mockResolvedValue([
      { country_code: "NZ", id: "payroll_1" },
    ]);
    dbMock.organisation.findFirst.mockResolvedValue({
      country_code: "NZ",
      id: "payroll_1",
    });
    expect(
      await completeXeroTenantSelection({
        ...input,
        organisationId: "payroll_1",
      })
    ).toMatchObject({ error: { code: "invalid_country" }, ok: false });
    expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
  });
  it("rejects replacing an existing payroll organisation's external file", async () => {
    dbMock.organisation.findMany.mockResolvedValue([
      { country_code: "AU", id: "payroll_1" },
    ]);
    dbMock.organisation.findFirst.mockResolvedValue({
      country_code: "AU",
      id: "payroll_1",
    });
    dbMock.xeroConnection.findFirst.mockResolvedValue({
      id: "conn_1",
      remote_connection_id: "remote_1",
      status: "active",
      sync_paused_at: null,
      updated_at: new Date("2026-10-07T00:00:00Z"),
      xero_authorisation_id: "grant_1",
      xero_tenant_id: "old_file",
    });
    expect(
      await completeXeroTenantSelection({
        ...input,
        organisationId: "payroll_1",
      })
    ).toMatchObject({
      error: { code: "tenant_replacement_required" },
      ok: false,
    });
    expect(dbMock.xeroConnection.update).not.toHaveBeenCalled();
  });
  it("reconnects the same file without changing its external tenant identity", async () => {
    dbMock.organisation.findMany.mockResolvedValue([
      { country_code: "AU", id: "payroll_1" },
    ]);
    dbMock.organisation.findFirst.mockResolvedValue({
      country_code: "AU",
      id: "payroll_1",
    });
    dbMock.xeroConnection.findFirst.mockResolvedValue({
      id: "conn_1",
      remote_connection_id: "remote_1",
      status: "active",
      sync_paused_at: null,
      updated_at: new Date("2026-10-07T00:00:00Z"),
      xero_authorisation_id: "grant_1",
      xero_tenant_id: "file_1",
    });
    dbMock.xeroConnection.update.mockResolvedValue({
      id: "conn_1",
      organisation_id: "payroll_1",
    });
    expect(
      await completeXeroTenantSelection({
        ...input,
        organisationId: "payroll_1",
      })
    ).toMatchObject({
      ok: true,
    });
    expect(
      dbMock.xeroConnection.update.mock.calls[0]?.[0].data
    ).not.toHaveProperty("xero_tenant_id");
  });
  it("refuses to overwrite an unresolved remote link owned by a different authoriser", async () => {
    dbMock.organisation.findMany.mockResolvedValue([
      { country_code: "AU", id: "payroll_1" },
    ]);
    dbMock.organisation.findFirst.mockResolvedValue({
      country_code: "AU",
      id: "payroll_1",
    });
    const old = { ...canonicalGrant(), id: "old_grant" };
    dbMock.xeroConnection.findFirst.mockResolvedValue({
      authorisation: old,
      id: "conn_1",
      payroll_region: "AU",
      remote_connection_id: "old_remote",
      status: "active",
      updated_at: new Date(),
      xero_authorisation_id: "old_grant",
      xero_tenant_id: "file_1",
    });
    dbMock.xeroAuthorisation.findUnique.mockResolvedValue(canonicalGrant());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).includes("/connections")
          ? Response.json([
              {
                id: "remote_1",
                tenantId: "file_1",
                tenantName: "Payroll",
                tenantType: "ORGANISATION",
              },
              {
                id: "old_remote",
                tenantId: "file_1",
                tenantName: "Payroll",
                tenantType: "ORGANISATION",
              },
            ])
          : Response.json({ Organisations: [{ CountryCode: "AU" }] })
      )
    );
    expect(
      await completeXeroTenantSelection({
        ...input,
        organisationId: "payroll_1",
      })
    ).toMatchObject({ error: { code: "tenant_binding_conflict" }, ok: false });
    expect(dbMock.xeroConnection.update).not.toHaveBeenCalled();
  });
  it("keeps completed selection when default feed setup fails", async () => {
    feedMock.ensureDefaultCalendarFeed.mockResolvedValue({
      error: { code: "unknown_error" },
      ok: false,
    });
    expect(await completeXeroTenantSelection(input)).toMatchObject({
      ok: true,
    });
    expect(loggerMock.error).toHaveBeenCalled();
  });
  it("keeps completed selection when default holiday setup fails", async () => {
    availabilityMock.ensureDefaultPublicHolidaysForOrganisation.mockResolvedValue(
      { error: { code: "unknown_error" }, ok: false }
    );
    expect(await completeXeroTenantSelection(input)).toMatchObject({
      ok: true,
    });
    expect(loggerMock.error).toHaveBeenCalled();
  });
});

describe("canonical housekeeping", () => {
  it("deletes expired and terminal reference-only sessions", async () => {
    const now = new Date();
    await purgeClosedXeroOAuthSessions(now);
    expect(dbMock.xeroOAuthSession.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expires_at: { lte: now } },
          { status: { in: ["cancelled", "completed"] } },
        ],
        xero_authorisation_id: null,
      },
    });
  });
});

describe("straight protected OAuth connection", () => {
  async function callbackInput() {
    const started = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      returnTo: "/calendar#upcoming",
      userId: "user_1",
    });
    if (!started.ok) {
      throw new Error("Expected OAuth start");
    }
    return {
      authenticatedClerkOrgId: "org_1",
      authenticatedUserId: "user_1",
      code: "code",
      nonce: started.value.nonce,
      state: new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
    };
  }
  const inventory = (id = "remote_1", tenantId = "file_1") => ({
    id,
    tenantId,
    tenantName: "Payroll",
    tenantType: "ORGANISATION",
  });
  const token = () =>
    Response.json({
      access_token: "access-token",
      expires_in: 1800,
      refresh_token: "refresh-token",
      scope: "payroll.employees payroll.settings.read accounting.settings.read",
    });
  beforeEach(() => {
    dbMock.organisation.findMany.mockResolvedValue([]);
    dbMock.xeroOAuthSession.findMany.mockResolvedValue([]);
    dbMock.organisation.create.mockResolvedValue({ id: "payroll_1" });
    dbMock.xeroConnection.create.mockResolvedValue({
      id: "conn_1",
      organisation_id: "payroll_1",
    });
    dbMock.xeroAuthorisation.findUnique.mockImplementation(async () =>
      canonicalGrant()
    );
    dbMock.xeroOAuthSession.updateMany.mockImplementation(({ data }) => {
      if (data.status === "selecting") {
        dbMock.xeroOAuthSession.findFirst.mockResolvedValue({
          id: "session_1",
          organisation_id: null,
          return_to: "/calendar#upcoming",
          ...data,
        });
      }
      return { count: 1 };
    });
  });
  it("automatically attaches the only authorised payroll file and clears temporary session state", async () => {
    const input = await callbackInput();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(Response.json([inventory()]))
        .mockResolvedValueOnce(Response.json([inventory()]))
        .mockResolvedValueOnce(
          Response.json({ Organisations: [{ CountryCode: "AU" }] })
        )
    );
    expect(await completeXeroOAuth(input)).toMatchObject({
      ok: true,
      value: {
        connected: { connectionId: "conn_1", organisationId: "payroll_1" },
        redirectTo: "/calendar?org=payroll_1#upcoming",
      },
    });
    expect(dbMock.xeroOAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          available_tenants_json: expect.anything(),
          nonce_hash: null,
          state_hash: null,
          status: "completed",
          xero_authorisation_id: null,
        }),
      })
    );
  });
  it("shows selection only when more than one eligible payroll file exists", async () => {
    const input = await callbackInput();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(
          Response.json([inventory(), inventory("remote_2", "file_2")])
        )
    );
    expect(await completeXeroOAuth(input)).toMatchObject({
      ok: true,
      value: {
        redirectTo: "/settings/integrations/xero/connect?session=session_1",
      },
    });
    expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
  });
  it("describes exchange unavailability without exposing token mechanics", async () => {
    const input = await callbackInput();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "temporary" }, { status: 503 })
        )
    );
    expect(await completeXeroOAuth(input)).toMatchObject({
      error: { message: "Xero is temporarily unavailable. Try again." },
      ok: false,
    });
  });
  it("retains target selection for one Xero file and multiple local payroll organisations", async () => {
    const input = await callbackInput();
    dbMock.organisation.findMany.mockResolvedValue([
      { id: "payroll_1" },
      { id: "payroll_2" },
    ]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(Response.json([inventory()]))
    );
    expect(await completeXeroOAuth(input)).toMatchObject({
      ok: true,
      value: {
        redirectTo: "/settings/integrations/xero/connect?session=session_1",
      },
    });
    expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
  });
  it.each([503, 429])(
    "never replays a code exchange after %s",
    async (status) => {
      const input = await callbackInput();
      const provider = vi
        .fn()
        .mockResolvedValue(Response.json({ error: "temporary" }, { status }));
      vi.stubGlobal("fetch", provider);
      expect(await completeXeroOAuth(input)).toMatchObject({ ok: false });
      expect(provider).toHaveBeenCalledTimes(1);
    }
  );
  it("rejects missing authenticated actor before code exchange", async () => {
    const input = await callbackInput();
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(
      await completeXeroOAuth({ ...input, authenticatedUserId: undefined })
    ).toMatchObject({ error: { code: "invalid_state" }, ok: false });
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([
    [{ id: "remote", tenantId: "file", tenantName: "Missing type" }],
    [
      {
        id: "",
        tenantId: "file",
        tenantName: "Payroll",
        tenantType: "ORGANISATION",
      },
    ],
    { connections: [] },
  ])(
    "rejects malformed inventory without storing a partial selection",
    async (rows) => {
      const input = await callbackInput();
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(token())
          .mockResolvedValueOnce(Response.json(rows))
      );
      expect(await completeXeroOAuth(input)).toMatchObject({
        error: { code: "invalid_token_response" },
        ok: false,
      });
      expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
    }
  );
  it("highlights current consent without hiding previously authorised files from new attachment", async () => {
    const input = await callbackInput();
    identityMock.verify.mockResolvedValueOnce({
      ok: true,
      value: {
        authEventId: "event_1",
        expiresAt: new Date(Date.now() + 1_800_000),
        grantedScopes: ["payroll.employees"],
        xeroUserId: "user1",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(
          Response.json([inventory(), inventory("remote_2", "file_2")])
        )
        .mockResolvedValueOnce(Response.json([inventory("remote_2", "file_2")]))
    );
    expect(await completeXeroOAuth(input)).toMatchObject({
      ok: true,
      value: {
        redirectTo: "/settings/integrations/xero/connect?session=session_1",
      },
    });
    expect(dbMock.xeroConnection.create).not.toHaveBeenCalled();
    expect(dbMock.xeroOAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          available_tenants_json: {
            authEventId: "event_1",
            tenants: [
              {
                connectionId: "remote_2",
                isCurrentConsent: true,
                tenantId: "file_2",
                tenantName: "Payroll",
              },
              {
                connectionId: "remote_1",
                isCurrentConsent: false,
                tenantId: "file_1",
                tenantName: "Payroll",
              },
            ],
          },
        }),
      })
    );
  });
  it("keeps an authorised same-file reconnect available outside the current consent event", async () => {
    dbMock.organisation.findFirst.mockResolvedValue({
      country_code: "AU",
      id: "payroll_1",
    });
    dbMock.organisation.findMany.mockResolvedValue([
      { country_code: "AU", id: "payroll_1" },
    ]);
    const started = await buildXeroOAuthStartUrl({
      clerkOrgId: "org_1",
      organisationId: "payroll_1",
      userId: "user_1",
    });
    if (!started.ok) {
      throw new Error("Expected scoped start");
    }
    const current = {
      id: "conn_1",
      remote_connection_id: "remote_1",
      status: "active",
      sync_paused_at: null,
      updated_at: new Date(),
      xero_authorisation_id: "grant_1",
      xero_tenant_id: "file_1",
    };
    dbMock.xeroOAuthSession.updateMany.mockImplementation(({ data }) => {
      if (data.status === "selecting") {
        dbMock.xeroOAuthSession.findFirst.mockResolvedValue({
          id: "session_1",
          organisation_id: "payroll_1",
          return_to: "/calendar",
          ...data,
        });
      }
      return { count: 1 };
    });
    dbMock.xeroConnection.findFirst.mockResolvedValue(current);
    dbMock.xeroConnection.update.mockResolvedValue({
      id: "conn_1",
      organisation_id: "payroll_1",
    });
    identityMock.verify.mockResolvedValueOnce({
      ok: true,
      value: {
        authEventId: "event_1",
        expiresAt: new Date(Date.now() + 1_800_000),
        grantedScopes: ["payroll.employees"],
        xeroUserId: "user1",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(token())
        .mockResolvedValueOnce(
          Response.json([inventory(), inventory("remote_2", "file_2")])
        )
        .mockResolvedValueOnce(Response.json([inventory("remote_2", "file_2")]))
        .mockResolvedValueOnce(
          Response.json([inventory(), inventory("remote_2", "file_2")])
        )
        .mockResolvedValueOnce(
          Response.json({ Organisations: [{ CountryCode: "AU" }] })
        )
    );
    expect(
      await completeXeroOAuth({
        authenticatedClerkOrgId: "org_1",
        authenticatedUserId: "user_1",
        code: "code",
        nonce: started.value.nonce,
        state:
          new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
      })
    ).toMatchObject({
      ok: true,
      value: {
        connected: { connectionId: "conn_1", organisationId: "payroll_1" },
      },
    });
    expect(
      dbMock.xeroConnection.update.mock.calls[0]?.[0].data.remote_connection_id
    ).toBe("remote_1");
  });
  it("uses the verified auth event for current consent and keeps the complete authorised inventory", async () => {
    const input = await callbackInput();
    identityMock.verify.mockResolvedValue({
      ok: true,
      value: {
        authEventId: "event_1",
        expiresAt: new Date(Date.now() + 1_800_000),
        grantedScopes: ["payroll.employees"],
        xeroUserId: "user1",
      },
    });
    const provider = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        Response.json([inventory(), inventory("remote_2", "file_2")])
      )
      .mockResolvedValueOnce(
        Response.json([inventory(), inventory("remote_2", "file_2")])
      );
    vi.stubGlobal("fetch", provider);
    expect(await completeXeroOAuth(input)).toMatchObject({ ok: true });
    expect(provider.mock.calls.map(([url]) => String(url))).toContain(
      "https://api.xero.com/connections?authEventId=event_1"
    );
  });
});
