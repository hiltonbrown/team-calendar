// biome-ignore-all lint/style/useFilenamingConvention: Integration tests use the repository's .integration.test.ts convention.
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/feeds", () => ({
  ensureDefaultCalendarFeed: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}));
vi.mock("@repo/availability", () => ({
  ensureDefaultPublicHolidaysForOrganisation: vi
    .fn()
    .mockResolvedValue({ ok: true, value: {} }),
  XERO_WRITE_CLAIM_LEASE_MS: 5 * 60 * 1000,
}));
const identity = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("./identity", () => ({
  verifyXeroAccessTokenIdentity: identity.verify,
}));
const allocation = allocateLiveTestFixture(
  "packages/xero/src/oauth/service.integration.test.ts"
);
const primary = requireTenant(0);
const secondary = requireTenant(1);
function requireTenant(index: number) {
  const slot = allocation.tenants[index];
  if (!slot) {
    throw new Error("Missing owned integration fixture slot");
  }
  return slot;
}
const fixture = {
  ...primary,
  authorisationId: allocation.id("authorisation"),
  connectionId: allocation.id("connection"),
  externalId: allocation.id("external"),
  remoteId: allocation.id("remote"),
  sessionId: allocation.id("session"),
};
const ownedScopes = {
  clerk_org_id: { in: allocation.tenants.map((t) => t.clerkOrgId) },
};
const ownedGrants = [
  fixture.authorisationId,
  allocation.id("authorisation", 1),
];
const originalEnv = { ...process.env };
let database: typeof import("@repo/database")["database"];
let crypto: typeof import("../crypto/tokens");
let canonical: typeof import("./authorisation");
let service: typeof import("./service");
let reencryptXeroTokens: typeof import("./reencrypt-tokens")["reencryptXeroTokens"];
beforeAll(async () => {
  process.env.XERO_CLIENT_ID = allocation.globalKey("provider_app");
  process.env.XERO_CLIENT_SECRET = "integration-secret";
  process.env.XERO_REDIRECT_URI =
    "http://localhost:3002/api/xero/oauth/callback";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64"
  );
  ({ database } = await import("@repo/database"));
  crypto = await import("../crypto/tokens");
  service = await import("./service");
  canonical = await import("./authorisation");
  ({ reencryptXeroTokens } = await import("./reencrypt-tokens"));
});
beforeEach(async () => {
  await clean();
  vi.resetAllMocks();
  process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "1";
  delete process.env.XERO_TOKEN_ENCRYPTION_KEYS_JSON;
  identity.verify.mockResolvedValue({
    ok: true,
    value: {
      authEventId: null,
      expiresAt: new Date(Date.now() + 1_800_000),
      grantedScopes: ["payroll.employees"],
      xeroUserId: allocation.id("xero-user"),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await clean();
  await database.$disconnect();
  process.env = { ...originalEnv };
});
async function clean() {
  if (!database) {
    return;
  }
  await database.auditEvent.deleteMany({ where: ownedScopes });
  await database.xeroOAuthSession.deleteMany({ where: ownedScopes });
  await database.xeroSyncCursor.deleteMany({ where: ownedScopes });
  await database.xeroConnection.deleteMany({ where: ownedScopes });
  await database.organisation.deleteMany({ where: ownedScopes });
  await database.xeroAuthorisation.deleteMany({
    where: { id: { in: ownedGrants } },
  });
}
function tokens(access = "expired-access-token", refresh = "refresh-token") {
  const a = crypto.encryptXeroToken(access),
    r = crypto.encryptXeroToken(refresh);
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
async function grant(
  expiresAt = new Date(Date.now() - 60_000),
  id = fixture.authorisationId
) {
  return await database.xeroAuthorisation.create({
    data: {
      id,
      provider_app_id: allocation.globalKey("provider_app"),
      xero_user_id:
        id === fixture.authorisationId
          ? allocation.id("xero-user")
          : allocation.id("xero-user", 1),
      ...tokens(),
      access_token_expires_at: expiresAt,
      granted_scopes: ["payroll.employees"],
      last_refreshed_at: new Date(),
    },
  });
}
async function organisation(slot = primary) {
  return await database.organisation.create({
    data: {
      clerk_org_id: slot.clerkOrgId,
      country_code: "AU",
      id: slot.organisationId,
      name: "Owned OAuth integration payroll",
    },
  });
}
async function connection() {
  await organisation();
  await grant();
  return database.xeroConnection.create({
    data: {
      clerk_org_id: fixture.clerkOrgId,
      id: fixture.connectionId,
      organisation_id: fixture.organisationId,
      payroll_region: "AU",
      remote_connection_id: fixture.remoteId,
      tenant_name: "Payroll",
      xero_authorisation_id: fixture.authorisationId,
      xero_tenant_id: fixture.externalId,
    },
  });
}
const scope = () => ({
  clerkOrgId: fixture.clerkOrgId,
  connectionId: fixture.connectionId,
  organisationId: fixture.organisationId,
});
function tokenResponse() {
  return Response.json({
    access_token: "new-access-token",
    expires_in: 1800,
    refresh_token: "new-refresh-token",
    scope: "payroll.employees",
  });
}
function tokenText(
  row: Awaited<ReturnType<typeof grant>>,
  prefix: "access" | "refresh"
) {
  return crypto.decryptXeroToken({
    authTag: row[`${prefix}_token_auth_tag`],
    encrypted: row[`${prefix}_token_encrypted`],
    iv: row[`${prefix}_token_iv`],
    keyVersion: row.token_key_version,
  });
}
async function selection(
  externalId = fixture.externalId,
  organisationId: string | null = fixture.organisationId
) {
  if (
    !(await database.xeroAuthorisation.findUnique({
      where: { id: fixture.authorisationId },
    }))
  ) {
    await grant(new Date(Date.now() + 1_800_000));
  }
  return database.xeroOAuthSession.create({
    data: {
      available_tenants_json: {
        tenants: [
          {
            connectionId: fixture.remoteId,
            tenantId: externalId,
            tenantName: "Payroll",
          },
        ],
      },
      clerk_org_id: fixture.clerkOrgId,
      created_by_user_id: "user_integration_1",
      expires_at: new Date(Date.now() + 600_000),
      id: fixture.sessionId,
      organisation_id: organisationId,
      return_to: "/calendar",
      status: "selecting",
      xero_authorisation_id: fixture.authorisationId,
    },
  });
}
function stubPayroll(externalId = fixture.externalId, country = "AU") {
  const fetchSpy = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith("/connections")
      ? Response.json([
          {
            id: fixture.remoteId,
            tenantId: externalId,
            tenantName: "Payroll",
            tenantType: "ORGANISATION",
          },
        ])
      : Response.json({
          Organisations: [{ CountryCode: country, Name: "Payroll" }],
        })
  );
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}
function select(externalId = fixture.externalId) {
  return service.completeXeroTenantSelection({
    clerkOrgId: fixture.clerkOrgId,
    organisationId: fixture.organisationId,
    sessionId: fixture.sessionId,
    tenantId: externalId,
    userId: "user_integration_1",
  });
}
function versionTwo() {
  process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "2";
  process.env.XERO_TOKEN_ENCRYPTION_KEYS_JSON = JSON.stringify({
    "2": Buffer.alloc(32, 8).toString("base64"),
  });
}

describe("canonical OAuth persistence", () => {
  it("refreshes expired canonical credentials under PostgreSQL advisory locking", async () => {
    await connection();
    const fetchSpy = vi.fn(async () => tokenResponse());
    vi.stubGlobal("fetch", fetchSpy);
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const saved = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(tokenText(saved, "access")).toBe("new-access-token");
    expect(tokenText(saved, "refresh")).toBe("new-refresh-token");
    expect(saved.last_refreshed_at).toBeInstanceOf(Date);
    expect(saved.last_refresh_error_code).toBeNull();
    const persisted = await database.xeroConnection.findUniqueOrThrow({
      where: { id: fixture.connectionId },
    });
    expect(persisted).not.toHaveProperty("access_token_encrypted");
    expect(persisted.xero_authorisation_id).toBe(saved.id);
  });
  it("serialises concurrent refreshes and persists exactly one rotated token pair", async () => {
    await connection();
    const fetchSpy = vi.fn(async () => tokenResponse());
    vi.stubGlobal("fetch", fetchSpy);
    const results = await Promise.all([
      canonical.resolveXeroAccess(scope()),
      canonical.resolveXeroAccess(scope()),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const saved = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(tokenText(saved, "access")).toBe("new-access-token");
    expect(tokenText(saved, "refresh")).toBe("new-refresh-token");
  });
  it("recovers a lost provider response on the next normal attempt using grace", async () => {
    await connection();
    const before = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    const provider = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost after rotation"))
      .mockResolvedValueOnce(tokenResponse());
    vi.stubGlobal("fetch", provider);
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      error: { code: "network_error" },
      ok: false,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    const retained = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(retained.refresh_token_encrypted).toBe(
      before.refresh_token_encrypted
    );
    expect(retained.status).toBe("active");
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
    expect(provider).toHaveBeenCalledTimes(2);
    for (const [, init] of provider.mock.calls) {
      expect(new URLSearchParams(init.body).get("refresh_token")).toBe(
        "refresh-token"
      );
    }
  });
  it("rolls back both token envelopes after a save failure and recovers on the next normal attempt", async () => {
    await connection();
    const before = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    const constraint = `phase3_pair_${fixture.authorisationId.replaceAll("-", "")}`;
    // The isolated local fixture constraint forces a real PostgreSQL transaction rollback.
    await database.$executeRawUnsafe(
      `ALTER TABLE xero_authorisations ADD CONSTRAINT ${constraint} CHECK (id <> '${fixture.authorisationId}'::uuid OR access_token_encrypted = '${before.access_token_encrypted}') NOT VALID`
    );
    const provider = vi.fn(async () => tokenResponse());
    vi.stubGlobal("fetch", provider);
    try {
      expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
        ok: false,
      });
      expect(provider).toHaveBeenCalledTimes(1);
      const retained = await database.xeroAuthorisation.findUniqueOrThrow({
        where: { id: fixture.authorisationId },
      });
      expect(retained.access_token_encrypted).toBe(
        before.access_token_encrypted
      );
      expect(retained.refresh_token_encrypted).toBe(
        before.refresh_token_encrypted
      );
      expect(retained.last_refreshed_at).toEqual(before.last_refreshed_at);
    } finally {
      await database.$executeRawUnsafe(
        `ALTER TABLE xero_authorisations DROP CONSTRAINT IF EXISTS ${constraint}`
      );
    }
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
    expect(provider).toHaveBeenCalledTimes(2);
    for (const [, init] of provider.mock.calls) {
      expect(new URLSearchParams(init.body).get("refresh_token")).toBe(
        "refresh-token"
      );
    }
  });
  it("marks a late invalid grant for every connection sharing the authorisation", async () => {
    await connection();
    await organisation(secondary);
    await database.xeroConnection.create({
      data: {
        clerk_org_id: secondary.clerkOrgId,
        organisation_id: secondary.organisationId,
        payroll_region: "AU",
        remote_connection_id: allocation.id("remote", 1),
        xero_authorisation_id: fixture.authorisationId,
        xero_tenant_id: allocation.id("external", 1),
      },
    });
    const provider = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "invalid_grant" }, { status: 400 })
      );
    vi.stubGlobal("fetch", provider);
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      error: { code: "refresh_token_invalid" },
      ok: false,
    });
    expect(
      await canonical.resolveXeroAccess({
        clerkOrgId: secondary.clerkOrgId,
        organisationId: secondary.organisationId,
      })
    ).toMatchObject({ error: { code: "reauthorisation_required" }, ok: false });
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("rotates one paused shared dormant grant once across concurrent maintenance calls", async () => {
    await connection();
    await organisation(secondary);
    await database.xeroConnection.updateMany({
      data: { sync_paused_at: new Date() },
      where: {
        clerk_org_id: fixture.clerkOrgId,
        id: fixture.connectionId,
        organisation_id: fixture.organisationId,
      },
    });
    await database.xeroConnection.create({
      data: {
        clerk_org_id: secondary.clerkOrgId,
        organisation_id: secondary.organisationId,
        payroll_region: "AU",
        remote_connection_id: allocation.id("remote", 1),
        sync_paused_at: new Date(),
        xero_authorisation_id: fixture.authorisationId,
        xero_tenant_id: allocation.id("external", 1),
      },
    });
    const now = new Date();
    await database.xeroAuthorisation.update({
      data: {
        last_refreshed_at: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
      },
      where: { id: fixture.authorisationId },
    });
    const provider = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return tokenResponse();
    });
    vi.stubGlobal("fetch", provider);
    const outcomes = await Promise.all([
      canonical.refreshDormantXeroAuthorisations(now),
      canonical.refreshDormantXeroAuthorisations(now),
    ]);
    expect(outcomes.every((result) => result.ok)).toBe(true);
    const totals = outcomes.reduce(
      (count, result) =>
        result.ok
          ? {
              failed: count.failed + result.value.failed,
              refreshed: count.refreshed + result.value.refreshed,
            }
          : count,
      { failed: 0, refreshed: 0 }
    );
    expect(totals).toEqual({ failed: 0, refreshed: 1 });
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("adopts reauthorisation once for both consumers while an old refresh waits for issuance", async () => {
    await connection();
    await organisation(secondary);
    await database.xeroConnection.create({
      data: {
        clerk_org_id: secondary.clerkOrgId,
        organisation_id: secondary.organisationId,
        payroll_region: "AU",
        remote_connection_id: allocation.id("remote", 1),
        xero_authorisation_id: fixture.authorisationId,
        xero_tenant_id: allocation.id("external", 1),
      },
    });
    let releaseCode: () => void = () => {
      throw new Error("Missing code barrier");
    };
    let markDispatched: () => void = () => {
      throw new Error("Missing dispatched barrier");
    };
    const release = new Promise<void>((resolve) => {
      releaseCode = resolve;
    });
    const dispatched = new Promise<void>((resolve) => {
      markDispatched = resolve;
    });
    let refreshCalls = 0;
    const provider = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).endsWith("/connect/token")) {
          const body = new URLSearchParams(
            typeof init?.body === "string"
              ? init.body
              : String(init?.body ?? "")
          );
          if (body.get("grant_type") === "authorization_code") {
            markDispatched();
            await release;
          } else {
            refreshCalls += 1;
          }
          return tokenResponse();
        }
        if (String(url).includes("/connections")) {
          return Response.json([
            {
              id: fixture.remoteId,
              tenantId: fixture.externalId,
              tenantName: "Payroll",
              tenantType: "ORGANISATION",
            },
          ]);
        }
        return Response.json({ Organisations: [{ CountryCode: "AU" }] });
      }
    );
    vi.stubGlobal("fetch", provider);
    const start = await service.buildXeroOAuthStartUrl({
      clerkOrgId: fixture.clerkOrgId,
      organisationId: fixture.organisationId,
      userId: "user_integration_1",
    });
    if (!start.ok) {
      throw new Error("Expected protected OAuth start");
    }
    const callback = service.completeXeroOAuth({
      authenticatedClerkOrgId: fixture.clerkOrgId,
      authenticatedUserId: "user_integration_1",
      code: "owned-code",
      nonce: start.value.nonce,
      state: new URL(start.value.redirectUrl).searchParams.get("state") ?? "",
    });
    await dispatched;
    const refresh = canonical.resolveXeroAccess(scope());
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      releaseCode();
    }
    expect(await callback).toMatchObject({
      ok: true,
      value: { connected: { connectionId: fixture.connectionId } },
    });
    expect(await refresh).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
    expect(refreshCalls).toBe(0);
    expect(
      await database.xeroAuthorisation.count({
        where: {
          provider_app_id: allocation.globalKey("provider_app"),
          xero_user_id: allocation.id("xero-user"),
        },
      })
    ).toBe(1);
    expect(
      await canonical.resolveXeroAccess({
        clerkOrgId: secondary.clerkOrgId,
        organisationId: secondary.organisationId,
      })
    ).toMatchObject({ ok: true, value: { accessToken: "new-access-token" } });
  });
  it("scopes refresh access to both Clerk account and payroll organisation", async () => {
    await connection();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(
      await canonical.resolveXeroAccess({
        ...scope(),
        clerkOrgId: secondary.clerkOrgId,
      })
    ).toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("atomically consumes the reference-only tenant selection and rejects replay", async () => {
    await organisation();
    await selection();
    stubPayroll();
    expect(await select()).toMatchObject({
      ok: true,
      value: { organisationId: fixture.organisationId },
    });
    const session = await database.xeroOAuthSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session.status).toBe("completed");
    expect(session.xero_authorisation_id).toBeNull();
    expect(session.available_tenants_json).toBeNull();
    expect(session.state_hash).toBeNull();
    expect(session.nonce_hash).toBeNull();
    expect(session).not.toHaveProperty("access_token_encrypted");
    expect(await select()).toMatchObject({
      error: { code: "session_not_found" },
      ok: false,
    });
    expect(await database.xeroConnection.count({ where: ownedScopes })).toBe(1);
  });
  it("rolls back selection consumption and connection mutation for wrong-file reconnect", async () => {
    await connection();
    const original = await database.xeroConnection.findUniqueOrThrow({
      where: { id: fixture.connectionId },
    });
    const other = allocation.id("other-file");
    await selection(other);
    stubPayroll(other);
    expect(await select(other)).toMatchObject({
      error: { code: "tenant_replacement_required" },
      ok: false,
    });
    expect(
      (
        await database.xeroOAuthSession.findUniqueOrThrow({
          where: { id: fixture.sessionId },
        })
      ).status
    ).toBe("selecting");
    expect(
      await database.xeroConnection.findUniqueOrThrow({
        where: { id: fixture.connectionId },
      })
    ).toEqual(original);
  });
  it("preserves connection and external file identity on same-file reconnect", async () => {
    await connection();
    const intentionalPause = new Date("2026-09-01");
    await database.xeroConnection.update({
      data: {
        balance_next_person_id: allocation.id("balance-person"),
        balance_sweep_failed: true,
        initial_sync_completed_at: intentionalPause,
        initial_sync_requested_at: intentionalPause,
        leave_next_person_id: allocation.id("leave-person"),
        leave_sweep_failed: true,
        sync_paused_at: intentionalPause,
      },
      where: { id: fixture.connectionId },
    });
    await selection();
    stubPayroll();
    const reconnectStartedAt = new Date();
    expect(await select()).toMatchObject({
      ok: true,
      value: { connectionId: fixture.connectionId },
    });
    expect(
      await database.xeroConnection.findUniqueOrThrow({
        where: { id: fixture.connectionId },
      })
    ).toMatchObject({
      balance_next_person_id: null,
      balance_sweep_failed: false,
      initial_sync_completed_at: null,
      initial_sync_requested_at: expect.any(Date),
      leave_next_person_id: null,
      leave_sweep_failed: false,
      remote_connection_id: fixture.remoteId,
      sync_paused_at: intentionalPause,
      xero_authorisation_id: fixture.authorisationId,
      xero_tenant_id: fixture.externalId,
    });
    expect(
      (
        await database.xeroConnection.findUniqueOrThrow({
          where: { id: fixture.connectionId },
        })
      ).initial_sync_requested_at?.getTime()
    ).toBeGreaterThanOrEqual(reconnectStartedAt.getTime());
  });

  it("rejects selection when disconnect commits after inventory validation", async () => {
    await connection();
    await database.xeroAuthorisation.update({
      data: { access_token_expires_at: new Date(Date.now() + 1_800_000) },
      where: { id: fixture.authorisationId },
    });
    await selection();
    let validated: () => void = () => {
      throw new Error("uninitialised barrier");
    };
    const inventoryValidated = new Promise<void>((resolve) => {
      validated = resolve;
    });
    let resume: () => void = () => {
      throw new Error("uninitialised barrier");
    };
    const continueSelection = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith(`/connections/${fixture.remoteId}`)) {
          return new Response(null, { status: 204 });
        }
        if (String(url).endsWith("/connections")) {
          return Response.json([
            {
              id: fixture.remoteId,
              tenantId: fixture.externalId,
              tenantName: "Payroll",
              tenantType: "ORGANISATION",
            },
          ]);
        }
        validated();
        await continueSelection;
        return Response.json({
          Organisations: [{ CountryCode: "AU", Name: "Payroll" }],
        });
      })
    );
    const selecting = select();
    await inventoryValidated;
    try {
      expect(
        await (await import("./disconnect")).disconnectXeroOAuthConnection({
          ...scope(),
          destructive: false,
        })
      ).toMatchObject({ ok: true });
    } finally {
      resume();
    }
    expect(await selecting).toMatchObject({
      error: { code: "tenant_binding_conflict" },
      ok: false,
    });
    expect(
      await database.xeroConnection.findUniqueOrThrow({
        where: { id: fixture.connectionId },
      })
    ).toMatchObject({
      remote_connection_id: null,
      status: "disconnected",
      xero_authorisation_id: null,
    });
    expect(
      (
        await database.xeroOAuthSession.findUniqueOrThrow({
          where: { id: fixture.sessionId },
        })
      ).status
    ).toBe("selecting");
  });
  it("revives a disconnected same-file connection without replacing its ID", async () => {
    await connection();
    await database.xeroConnection.update({
      data: {
        disconnected_at: new Date(),
        remote_connection_id: null,
        status: "disconnected",
        sync_paused_at: new Date(),
        xero_authorisation_id: null,
      },
      where: { id: fixture.connectionId },
    });
    await selection();
    stubPayroll();
    expect(await select()).toMatchObject({
      ok: true,
      value: { connectionId: fixture.connectionId },
    });
    expect(
      await database.xeroConnection.findUniqueOrThrow({
        where: { id: fixture.connectionId },
      })
    ).toMatchObject({
      disconnected_at: null,
      status: "active",
      sync_paused_at: null,
      xero_tenant_id: fixture.externalId,
    });
  });
  it("rolls back a newly created organisation when another ordinary connection owns the external file", async () => {
    await organisation(secondary);
    await grant(new Date(Date.now() + 1_800_000));
    await database.xeroConnection.create({
      data: {
        clerk_org_id: secondary.clerkOrgId,
        organisation_id: secondary.organisationId,
        payroll_region: "AU",
        remote_connection_id: fixture.remoteId,
        xero_authorisation_id: fixture.authorisationId,
        xero_tenant_id: fixture.externalId,
      },
    });
    await selection(fixture.externalId, null);
    stubPayroll();
    expect(await select()).toMatchObject({
      error: { code: "tenant_binding_conflict" },
      ok: false,
    });
    expect(
      await database.organisation.count({
        where: { clerk_org_id: fixture.clerkOrgId },
      })
    ).toBe(0);
    expect(
      (
        await database.xeroOAuthSession.findUniqueOrThrow({
          where: { id: fixture.sessionId },
        })
      ).status
    ).toBe("selecting");
  });
  it.each([false, true])(
    "cleans an empty-inventory callback grant while preserving sibling usage: %s",
    async (hasSibling) => {
      if (hasSibling) {
        await connection();
      } else {
        await grant();
      }
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).endsWith("/connect/token")
            ? tokenResponse()
            : Response.json([])
        )
      );
      const started = await service.buildXeroOAuthStartUrl({
        clerkOrgId: fixture.clerkOrgId,
        userId: "user_integration_1",
      });
      if (!started.ok) {
        throw new Error("Expected protected OAuth start");
      }
      expect(
        await service.completeXeroOAuth({
          authenticatedClerkOrgId: fixture.clerkOrgId,
          authenticatedUserId: "user_integration_1",
          code: "owned-code",
          nonce: started.value.nonce,
          state:
            new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
        })
      ).toMatchObject({ error: { code: "tenant_not_found" }, ok: false });
      const closed = await database.xeroOAuthSession.findFirstOrThrow({
        where: { clerk_org_id: fixture.clerkOrgId, status: "cancelled" },
      });
      expect(closed.xero_authorisation_id).toBe(fixture.authorisationId);
      await service.purgeClosedXeroOAuthSessions();
      expect(
        await database.xeroAuthorisation.count({
          where: { id: fixture.authorisationId },
        })
      ).toBe(hasSibling ? 1 : 0);
    }
  );

  it.each([false, true])(
    "prunes a replaced authoriser only when no sibling still uses it: %s",
    async (hasSibling) => {
      await connection();
      await database.xeroAuthorisation.update({
        data: { access_token_expires_at: new Date(Date.now() + 1_800_000) },
        where: { id: fixture.authorisationId },
      });
      if (hasSibling) {
        await organisation(secondary);
        await database.xeroConnection.create({
          data: {
            clerk_org_id: secondary.clerkOrgId,
            organisation_id: secondary.organisationId,
            payroll_region: "AU",
            remote_connection_id: allocation.id("remote", 1),
            xero_authorisation_id: fixture.authorisationId,
            xero_tenant_id: allocation.id("external", 1),
          },
        });
      }
      const replacement = await grant(
        new Date(Date.now() + 1_800_000),
        ownedGrants[1]
      );
      await database.xeroAuthorisation.update({
        data: tokens("replacement-access", "replacement-refresh"),
        where: { id: replacement.id },
      });
      await selection();
      const replacementRemote = allocation.id("replacement-remote");
      await database.xeroOAuthSession.update({
        data: {
          available_tenants_json: {
            tenants: [
              {
                connectionId: replacementRemote,
                tenantId: fixture.externalId,
                tenantName: "Payroll",
              },
            ],
          },
          xero_authorisation_id: replacement.id,
        },
        where: { id: fixture.sessionId },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn((url, init) => {
          if (String(url).endsWith("/connections")) {
            return Promise.resolve(
              Response.json(
                new Headers(init?.headers).get("Authorization") ===
                  "Bearer replacement-access"
                  ? [
                      {
                        id: replacementRemote,
                        tenantId: fixture.externalId,
                        tenantName: "Payroll",
                        tenantType: "ORGANISATION",
                      },
                    ]
                  : []
              )
            );
          }
          return Promise.resolve(
            Response.json({ Organisations: [{ CountryCode: "AU" }] })
          );
        })
      );
      expect(await select()).toMatchObject({ ok: true });
      await service.purgeClosedXeroOAuthSessions();
      expect(
        await database.xeroAuthorisation.count({
          where: { id: fixture.authorisationId },
        })
      ).toBe(hasSibling ? 1 : 0);
      expect(
        await database.xeroConnection.findUniqueOrThrow({
          where: { id: fixture.connectionId },
        })
      ).toMatchObject({ xero_authorisation_id: replacement.id });
    }
  );

  it("deletes expired and terminal sessions while retaining a live selection reference", async () => {
    await organisation();
    await selection();
    const now = new Date();
    await database.xeroOAuthSession.createMany({
      data: [
        {
          clerk_org_id: fixture.clerkOrgId,
          expires_at: new Date(now.getTime() - 1),
          id: allocation.id("expired-session"),
          return_to: "/calendar",
          status: "pending",
        },
        {
          clerk_org_id: fixture.clerkOrgId,
          expires_at: new Date(now.getTime() + 60_000),
          id: allocation.id("completed-session"),
          return_to: "/calendar",
          status: "completed",
        },
        {
          clerk_org_id: fixture.clerkOrgId,
          expires_at: new Date(now.getTime() + 60_000),
          id: allocation.id("cancelled-session"),
          return_to: "/calendar",
          status: "cancelled",
        },
      ],
    });
    await service.purgeClosedXeroOAuthSessions(now);
    expect(
      await database.xeroOAuthSession.findMany({
        select: { id: true },
        where: ownedScopes,
      })
    ).toEqual([{ id: fixture.sessionId }]);
    expect(
      await database.xeroAuthorisation.count({
        where: { id: fixture.authorisationId },
      })
    ).toBe(1);
  });
  it("re-encrypts only canonical tokens in pages and is idempotent", async () => {
    await grant(new Date(Date.now() + 1_800_000));
    await grant(new Date(Date.now() + 1_800_000), ownedGrants[1]);
    versionTwo();
    expect(
      await reencryptXeroTokens({
        batchSize: 1,
        only: { authorisationIds: ownedGrants },
      })
    ).toEqual({ ok: true, value: { failed: 0, rewritten: 2, skipped: 0 } });
    const saved = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(saved.token_key_version).toBe(2);
    expect(tokenText(saved, "access")).toBe("expired-access-token");
    expect(tokenText(saved, "refresh")).toBe("refresh-token");
    expect(
      await reencryptXeroTokens({
        batchSize: 1,
        only: { authorisationIds: ownedGrants },
      })
    ).toEqual({ ok: true, value: { failed: 0, rewritten: 0, skipped: 0 } });
  });
  it("preflights unknown canonical key versions before writing any grant", async () => {
    const first = await grant();
    await grant(new Date(Date.now() + 1_800_000), ownedGrants[1]);
    await database.xeroAuthorisation.update({
      data: { token_key_version: 99 },
      where: { id: ownedGrants[1] },
    });
    versionTwo();
    expect(
      await reencryptXeroTokens({
        batchSize: 1,
        only: { authorisationIds: ownedGrants },
      })
    ).toEqual({ error: { code: "unknown_key_version_present" }, ok: false });
    expect(
      await database.xeroAuthorisation.findUniqueOrThrow({
        where: { id: first.id },
      })
    ).toEqual(first);
  });
  it("counts corrupt ciphertext and continues to another valid canonical grant", async () => {
    await grant();
    await grant(new Date(Date.now() + 1_800_000), ownedGrants[1]);
    await database.xeroAuthorisation.update({
      data: { access_token_encrypted: "corrupt" },
      where: { id: fixture.authorisationId },
    });
    versionTwo();
    expect(
      await reencryptXeroTokens({
        batchSize: 1,
        only: { authorisationIds: ownedGrants },
      })
    ).toEqual({ ok: true, value: { failed: 1, rewritten: 1, skipped: 0 } });
  });
});
