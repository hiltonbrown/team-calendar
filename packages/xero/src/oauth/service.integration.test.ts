// biome-ignore-all lint/style/useFilenamingConvention: Integration tests use the repository's .integration.test.ts convention.

import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.XERO_CLIENT_ID = "integration-client-id";
  process.env.XERO_CLIENT_SECRET = "integration-client-secret";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64"
  );
});

vi.mock("server-only", () => ({}));

type CryptoModule = typeof import("../crypto/tokens");
type DatabaseModule = typeof import("@repo/database");
type ServiceModule = typeof import("./service");

let database: DatabaseModule["database"];
let decryptXeroToken: CryptoModule["decryptXeroToken"];
let encryptXeroToken: CryptoModule["encryptXeroToken"];
let completeXeroTenantSelection: ServiceModule["completeXeroTenantSelection"];
let disconnectXeroOAuthConnection: ServiceModule["disconnectXeroOAuthConnection"];
let ensureFreshXeroConnection: ServiceModule["ensureFreshXeroConnection"];
let scrubInactiveXeroOAuthSessionCredentials: ServiceModule["scrubInactiveXeroOAuthSessionCredentials"];

const allocation = allocateLiveTestFixture(
  "packages/xero/src/oauth/service.integration.test.ts"
);
function requireFixtureTenant(index: number) {
  const tenant = allocation.tenants[index];
  if (!tenant) {
    throw new Error(`Fixture tenant slot ${index} is missing`);
  }
  return tenant;
}

const primaryTenant = requireFixtureTenant(0);
const secondaryTenant = requireFixtureTenant(1);
const fixture = {
  clerkOrgId: primaryTenant.clerkOrgId,
  connectionId: allocation.id("connection"),
  organisationId: primaryTenant.organisationId,
  providerTenantId: allocation.id("provider-tenant", 0),
  second: {
    clerkOrgId: secondaryTenant.clerkOrgId,
    connectionId: allocation.id("connection", 1),
    organisationId: secondaryTenant.organisationId,
    tenantId: allocation.id("tenant", 1),
  },
  sessionId: allocation.id("session"),
  tenantId: allocation.id("tenant"),
} as const;

describe("ensureFreshXeroConnection integration", () => {
  beforeAll(async () => {
    process.env.XERO_CLIENT_ID = allocation.globalKey("provider_app");
    const [cryptoModule, databaseModule, serviceModule] = await Promise.all([
      import("../crypto/tokens"),
      import("@repo/database"),
      import("./service"),
    ]);
    ({ database } = databaseModule);
    ({ decryptXeroToken, encryptXeroToken } = cryptoModule);
    ({
      completeXeroTenantSelection,
      disconnectXeroOAuthConnection,
      ensureFreshXeroConnection,
      scrubInactiveXeroOAuthSessionCredentials,
    } = serviceModule);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await cleanTestData();
    await database.$disconnect();
  });

  it("refreshes an expired connection while holding a Prisma advisory lock", async () => {
    await cleanTestData();
    const accessToken = encryptXeroToken("expired-access-token");
    const refreshToken = encryptXeroToken("refresh-token");

    await database.organisation.create({
      data: {
        clerk_org_id: fixture.clerkOrgId,
        country_code: "AU",
        id: fixture.organisationId,
        name: "Xero refresh lock integration fixture",
      },
    });
    await database.xeroConnection.create({
      data: {
        access_token_auth_tag: accessToken.authTag,
        access_token_encrypted: accessToken.encrypted,
        access_token_iv: accessToken.iv,
        clerk_org_id: fixture.clerkOrgId,
        expires_at: new Date(Date.now() - 60_000),
        id: fixture.connectionId,
        organisation_id: fixture.organisationId,
        refresh_token_auth_tag: refreshToken.authTag,
        refresh_token_encrypted: refreshToken.encrypted,
        refresh_token_iv: refreshToken.iv,
        status: "active",
        token_encrypted_at: accessToken.encryptedAt,
        token_key_version: accessToken.keyVersion,
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          expires_in: 1800,
          refresh_token: "new-refresh-token",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await ensureFreshXeroConnection({
      clerkOrgId: fixture.clerkOrgId,
      connectionId: fixture.connectionId,
      organisationId: fixture.organisationId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.refreshed).toBe(true);
      expect(result.value.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const persisted = await database.xeroConnection.findFirst({
      select: {
        access_token_auth_tag: true,
        access_token_encrypted: true,
        access_token_iv: true,
        expires_at: true,
        last_error_code: true,
        last_refreshed_at: true,
        refresh_token_auth_tag: true,
        refresh_token_encrypted: true,
        refresh_token_iv: true,
        status: true,
      },
      where: {
        clerk_org_id: fixture.clerkOrgId,
        id: fixture.connectionId,
        organisation_id: fixture.organisationId,
      },
    });
    expect(persisted).toEqual(
      expect.objectContaining({
        last_error_code: null,
        status: "active",
      })
    );
    expect(persisted?.last_refreshed_at).toBeInstanceOf(Date);
    expect(persisted?.expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(
      decryptXeroToken({
        authTag: persisted?.access_token_auth_tag ?? null,
        encrypted: persisted?.access_token_encrypted ?? "",
        iv: persisted?.access_token_iv ?? null,
      })
    ).toBe("new-access-token");
    expect(
      decryptXeroToken({
        authTag: persisted?.refresh_token_auth_tag ?? null,
        encrypted: persisted?.refresh_token_encrypted ?? "",
        iv: persisted?.refresh_token_iv ?? null,
      })
    ).toBe("new-refresh-token");
  });

  it("serialises concurrent refreshes and persists exactly one rotated token pair", async () => {
    await cleanTestData();
    const accessToken = encryptXeroToken("expired-concurrent-access-token");
    const refreshToken = encryptXeroToken("concurrent-refresh-token");
    await createOrganisation();
    await database.xeroConnection.create({
      data: {
        access_token_auth_tag: accessToken.authTag,
        access_token_encrypted: accessToken.encrypted,
        access_token_iv: accessToken.iv,
        clerk_org_id: fixture.clerkOrgId,
        expires_at: new Date(Date.now() - 60_000),
        id: fixture.connectionId,
        organisation_id: fixture.organisationId,
        refresh_token_auth_tag: refreshToken.authTag,
        refresh_token_encrypted: refreshToken.encrypted,
        refresh_token_iv: refreshToken.iv,
        status: "active",
        token_encrypted_at: accessToken.encryptedAt,
        token_key_version: accessToken.keyVersion,
      },
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "concurrent-new-access-token",
          expires_in: 1800,
          refresh_token: "concurrent-new-refresh-token",
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const results = await Promise.all([
      ensureFreshXeroConnection({
        clerkOrgId: fixture.clerkOrgId,
        connectionId: fixture.connectionId,
        organisationId: fixture.organisationId,
      }),
      ensureFreshXeroConnection({
        clerkOrgId: fixture.clerkOrgId,
        connectionId: fixture.connectionId,
        organisationId: fixture.organisationId,
      }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const persisted = await database.xeroConnection.findUniqueOrThrow({
      select: {
        access_token_auth_tag: true,
        access_token_encrypted: true,
        access_token_iv: true,
        refresh_token_auth_tag: true,
        refresh_token_encrypted: true,
        refresh_token_iv: true,
      },
      where: { id: fixture.connectionId },
    });
    expect(
      decryptXeroToken({
        authTag: persisted.access_token_auth_tag,
        encrypted: persisted.access_token_encrypted,
        iv: persisted.access_token_iv,
      })
    ).toBe("concurrent-new-access-token");
    expect(
      decryptXeroToken({
        authTag: persisted.refresh_token_auth_tag,
        encrypted: persisted.refresh_token_encrypted,
        iv: persisted.refresh_token_iv,
      })
    ).toBe("concurrent-new-refresh-token");
  });

  it("atomically claims and scrubs an OAuth tenant-selection session", async () => {
    await cleanTestData();
    await createOrganisation();
    const accessToken = encryptXeroToken("selection-access-token");
    const refreshToken = encryptXeroToken("selection-refresh-token");
    await database.xeroOAuthSession.create({
      data: {
        access_token_auth_tag: accessToken.authTag,
        access_token_encrypted: accessToken.encrypted,
        access_token_iv: accessToken.iv,
        available_tenants_json: {
          tenants: [
            {
              connectionId: "xero-authorisation-1",
              tenantId: fixture.providerTenantId,
              tenantName: "Integration Payroll",
            },
          ],
        },
        clerk_org_id: fixture.clerkOrgId,
        created_by_user_id: "user_integration_1",
        expires_at: new Date("2099-01-01T00:30:00.000Z"),
        id: fixture.sessionId,
        organisation_id: fixture.organisationId,
        refresh_token_auth_tag: refreshToken.authTag,
        refresh_token_encrypted: refreshToken.encrypted,
        refresh_token_iv: refreshToken.iv,
        return_to: "/settings/integrations/xero",
        token_encrypted_at: accessToken.encryptedAt,
        token_expires_at: new Date("2099-01-01T00:20:00.000Z"),
        token_key_version: accessToken.keyVersion,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              Organisations: [
                { CountryCode: "AU", Name: "Integration Payroll" },
              ],
            }),
            { headers: { "content-type": "application/json" }, status: 200 }
          )
      )
    );
    const input = {
      clerkOrgId: fixture.clerkOrgId,
      organisationId: fixture.organisationId,
      sessionId: fixture.sessionId,
      tenantId: fixture.providerTenantId,
      userId: "user_integration_1",
    };

    const results = await Promise.all([
      completeXeroTenantSelection(input),
      completeXeroTenantSelection(input),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.ok && result.error.code === "session_not_found"
      )
    ).toHaveLength(1);
    const session = await database.xeroOAuthSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(session).toEqual(
      expect.objectContaining({
        access_token_auth_tag: null,
        access_token_encrypted: "",
        access_token_iv: null,
        available_tenants_json: { tenants: [] },
        refresh_token_auth_tag: null,
        refresh_token_encrypted: "",
        refresh_token_iv: null,
        status: "completed",
        token_encrypted_at: null,
      })
    );
    expect(
      await database.xeroConnection.count({
        where: { clerk_org_id: fixture.clerkOrgId },
      })
    ).toBe(1);
  });

  it("scrubs expired pending and legacy terminal OAuth sessions", async () => {
    await cleanTestData();
    const accessToken = encryptXeroToken("cleanup-access-token");
    const refreshToken = encryptXeroToken("cleanup-refresh-token");
    const common = {
      access_token_auth_tag: accessToken.authTag,
      access_token_encrypted: accessToken.encrypted,
      access_token_iv: accessToken.iv,
      available_tenants_json: { tenants: [] },
      clerk_org_id: fixture.clerkOrgId,
      expires_at: new Date("2020-01-01T00:00:00.000Z"),
      refresh_token_auth_tag: refreshToken.authTag,
      refresh_token_encrypted: refreshToken.encrypted,
      refresh_token_iv: refreshToken.iv,
      return_to: "/settings/integrations/xero",
      token_encrypted_at: accessToken.encryptedAt,
      token_expires_at: new Date("2020-01-01T00:00:00.000Z"),
      token_key_version: accessToken.keyVersion,
    } as const;
    await database.xeroOAuthSession.createMany({
      data: [
        { ...common, id: fixture.sessionId, status: "pending" },
        {
          ...common,
          id: "75000000-0000-4000-8000-000000000005",
          status: "completed",
        },
      ],
    });

    const result = await scrubInactiveXeroOAuthSessionCredentials(
      new Date("2026-08-29T00:00:00.000Z")
    );

    expect(result.ok).toBe(true);
    const sessions = await database.xeroOAuthSession.findMany({
      orderBy: { id: "asc" },
      where: { clerk_org_id: fixture.clerkOrgId },
    });
    expect(sessions).toHaveLength(2);
    expect(
      sessions.every(
        (session) =>
          session.access_token_encrypted === "" &&
          session.refresh_token_encrypted === "" &&
          session.access_token_iv === null &&
          session.refresh_token_iv === null
      )
    ).toBe(true);
    expect(
      sessions.find((session) => session.id === fixture.sessionId)?.status
    ).toBe("expired");
  });

  it("preserves local credentials until Xero confirms disconnect", async () => {
    await cleanTestData();
    await createOrganisation();
    const accessToken = encryptXeroToken("disconnect-access-token");
    const refreshToken = encryptXeroToken("disconnect-refresh-token");
    await database.xeroConnection.create({
      data: {
        access_token_auth_tag: accessToken.authTag,
        access_token_encrypted: accessToken.encrypted,
        access_token_iv: accessToken.iv,
        clerk_org_id: fixture.clerkOrgId,
        expires_at: new Date("2099-01-01T00:00:00.000Z"),
        id: fixture.connectionId,
        organisation_id: fixture.organisationId,
        refresh_token_auth_tag: refreshToken.authTag,
        refresh_token_encrypted: refreshToken.encrypted,
        refresh_token_iv: refreshToken.iv,
        status: "active",
        token_encrypted_at: accessToken.encryptedAt,
        token_key_version: accessToken.keyVersion,
        xero_authorisation_connection_id: "xero-authorisation-1",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    );
    const input = {
      clerkOrgId: fixture.clerkOrgId,
      connectionId: fixture.connectionId,
      destructive: false,
      organisationId: fixture.organisationId,
      performedByUserId: "user_integration_1",
    };

    const failed = await disconnectXeroOAuthConnection(input);

    expect(failed.ok).toBe(false);
    const preserved = await database.xeroConnection.findUniqueOrThrow({
      where: { id: fixture.connectionId },
    });
    expect(preserved.status).toBe("active");
    expect(preserved.access_token_encrypted).toBe(accessToken.encrypted);
    expect(preserved.refresh_token_encrypted).toBe(refreshToken.encrypted);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    );
    const disconnected = await disconnectXeroOAuthConnection(input);

    expect(disconnected.ok).toBe(true);
    const cleared = await database.xeroConnection.findUniqueOrThrow({
      where: { id: fixture.connectionId },
    });
    expect(cleared).toEqual(
      expect.objectContaining({
        access_token_encrypted: "",
        disconnected_by_user_id: "user_integration_1",
        refresh_token_encrypted: "",
        status: "disconnected",
      })
    );
  });

  it("rolls back the session claim and credential update on wrong-file reconnect", async () => {
    await cleanTestData();
    await seedBoundTenant(fixture.providerTenantId);
    const before = await database.xeroConnection.findUniqueOrThrow({
      where: { id: fixture.connectionId },
    });
    const replacementId = allocation.id("provider-tenant", 1);
    await createSelectionSession({ tenantId: replacementId });
    stubAustralianPayroll();

    const result = await selectTenant(replacementId);

    expect(result).toMatchObject({
      error: { code: "tenant_replacement_required" },
      ok: false,
    });
    const tenant = await database.xeroTenant.findUniqueOrThrow({
      where: { id: fixture.tenantId },
    });
    const after = await database.xeroConnection.findUniqueOrThrow({
      where: { id: fixture.connectionId },
    });
    const session = await database.xeroOAuthSession.findUniqueOrThrow({
      where: { id: fixture.sessionId },
    });
    expect(tenant.xero_tenant_id).toBe(fixture.providerTenantId);
    expect(after).toMatchObject({
      access_token_auth_tag: before.access_token_auth_tag,
      access_token_encrypted: before.access_token_encrypted,
      access_token_iv: before.access_token_iv,
      refresh_token_auth_tag: before.refresh_token_auth_tag,
      refresh_token_encrypted: before.refresh_token_encrypted,
      refresh_token_iv: before.refresh_token_iv,
      token_encrypted_at: before.token_encrypted_at,
      token_key_version: before.token_key_version,
    });
    expect(session.status).toBe("pending");
  });

  it("preserves tenant identity and advances generation on same-file reconnect", async () => {
    await cleanTestData();
    await seedBoundTenant(fixture.providerTenantId);
    await createSelectionSession({ tenantId: fixture.providerTenantId });
    stubAustralianPayroll();

    const result = await selectTenant(fixture.providerTenantId);

    expect(result.ok).toBe(true);
    const tenant = await database.xeroTenant.findUniqueOrThrow({
      where: { id: fixture.tenantId },
    });
    expect(tenant.id).toBe(fixture.tenantId);
    expect(tenant.binding_generation).toBe(2);
    expect(tenant.active_slot).toBe(1);
  });

  it("rolls back a new payroll entity when another slot reserves the Xero file", async () => {
    await cleanTestData();
    await seedBoundTenant(fixture.providerTenantId, true);
    await createSelectionSession({
      clerkOrgId: fixture.clerkOrgId,
      organisationId: null,
      tenantId: fixture.providerTenantId,
    });
    stubAustralianPayroll();

    const result = await completeXeroTenantSelection({
      clerkOrgId: fixture.clerkOrgId,
      sessionId: fixture.sessionId,
      tenantId: fixture.providerTenantId,
      userId: "user_integration_1",
    });

    expect(result).toMatchObject({
      error: { code: "tenant_binding_conflict" },
      ok: false,
    });
    expect(
      await database.organisation.count({
        where: { clerk_org_id: fixture.clerkOrgId },
      })
    ).toBe(0);
    expect(
      await database.xeroOAuthSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
      })
    ).toMatchObject({ status: "pending" });
  });

  it.each(["expired", "completed", "other-user"])(
    "rejects a %s session without writing a binding",
    async (kind) => {
      await cleanTestData();
      await createOrganisation();
      await createSelectionSession({
        expiresAt: kind === "expired" ? new Date("2020-01-01") : undefined,
        status: kind === "completed" ? "completed" : "pending",
        userId: kind === "other-user" ? "another-user" : undefined,
      });
      stubAustralianPayroll();

      const result = await selectTenant(fixture.providerTenantId);

      expect(result).toMatchObject({
        error: { code: "session_not_found" },
        ok: false,
      });
      expect(
        await database.xeroConnection.count({
          where: { clerk_org_id: fixture.clerkOrgId },
        })
      ).toBe(0);
    }
  );

  it("revives a retired same-file binding and advances generation", async () => {
    await cleanTestData();
    await seedBoundTenant(fixture.providerTenantId);
    await database.xeroTenant.update({
      data: { active_slot: null, retired_at: new Date() },
      where: { id: fixture.tenantId },
    });
    await createSelectionSession({ tenantId: fixture.providerTenantId });
    stubAustralianPayroll();

    expect((await selectTenant(fixture.providerTenantId)).ok).toBe(true);
    expect(
      await database.xeroTenant.findUniqueOrThrow({
        where: { id: fixture.tenantId },
      })
    ).toMatchObject({
      active_slot: 1,
      binding_generation: 2,
      retired_at: null,
    });
  });
});

async function createOrganisation() {
  await database.organisation.create({
    data: {
      clerk_org_id: fixture.clerkOrgId,
      country_code: "AU",
      id: fixture.organisationId,
      name: "Xero refresh lock integration fixture",
    },
  });
}

async function cleanTestData() {
  if (!database) {
    return;
  }
  const where = {
    clerk_org_id: { in: [fixture.clerkOrgId, fixture.second.clerkOrgId] },
  };
  await database.xeroOAuthSession.deleteMany({ where });
  await database.xeroTenant.deleteMany({ where });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({ where });
}

async function seedBoundTenant(providerTenantId: string, secondSlot = false) {
  const slot = secondSlot ? fixture.second : fixture;
  await database.organisation.create({
    data: {
      clerk_org_id: slot.clerkOrgId,
      country_code: "AU",
      id: slot.organisationId,
      name: "Binding integration fixture",
    },
  });
  const accessToken = encryptXeroToken("original-access-token");
  const refreshToken = encryptXeroToken("original-refresh-token");
  await database.xeroConnection.create({
    data: {
      access_token_auth_tag: accessToken.authTag,
      access_token_encrypted: accessToken.encrypted,
      access_token_iv: accessToken.iv,
      clerk_org_id: slot.clerkOrgId,
      expires_at: new Date(Date.now() + 60_000),
      id: slot.connectionId,
      organisation_id: slot.organisationId,
      refresh_token_auth_tag: refreshToken.authTag,
      refresh_token_encrypted: refreshToken.encrypted,
      refresh_token_iv: refreshToken.iv,
      status: "active",
    },
  });
  await database.xeroTenant.create({
    data: {
      active_slot: 1,
      clerk_org_id: slot.clerkOrgId,
      id: slot.tenantId,
      organisation_id: slot.organisationId,
      payroll_region: "AU",
      provider_app_id: allocation.globalKey("provider_app"),
      xero_connection_id: slot.connectionId,
      xero_tenant_id: providerTenantId,
    },
  });
}

async function createSelectionSession(
  input: {
    clerkOrgId?: string;
    expiresAt?: Date;
    organisationId?: null | string;
    status?: "pending" | "completed";
    tenantId?: string;
    userId?: string;
  } = {}
) {
  const accessToken = encryptXeroToken("selection-access-token");
  const refreshToken = encryptXeroToken("selection-refresh-token");
  await database.xeroOAuthSession.create({
    data: {
      access_token_auth_tag: accessToken.authTag,
      access_token_encrypted: accessToken.encrypted,
      access_token_iv: accessToken.iv,
      available_tenants_json: {
        tenants: [
          {
            connectionId: "xero-authorisation-1",
            tenantId: input.tenantId ?? fixture.providerTenantId,
            tenantName: "Integration Payroll",
          },
        ],
      },
      clerk_org_id: input.clerkOrgId ?? fixture.clerkOrgId,
      created_by_user_id: input.userId ?? "user_integration_1",
      expected_binding_generation: input.organisationId === null ? null : 1,
      expires_at: input.expiresAt ?? new Date("2099-01-01T00:30:00.000Z"),
      id: fixture.sessionId,
      organisation_id:
        input.organisationId === undefined
          ? fixture.organisationId
          : input.organisationId,
      refresh_token_auth_tag: refreshToken.authTag,
      refresh_token_encrypted: refreshToken.encrypted,
      refresh_token_iv: refreshToken.iv,
      return_to: "/settings/integrations/xero",
      status: input.status ?? "pending",
      token_expires_at: new Date("2099-01-01T00:20:00.000Z"),
    },
  });
}

function stubAustralianPayroll() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        Organisations: [{ CountryCode: "AU", Name: "Integration Payroll" }],
      })
    )
  );
}

function selectTenant(tenantId: string) {
  return completeXeroTenantSelection({
    clerkOrgId: fixture.clerkOrgId,
    organisationId: fixture.organisationId,
    sessionId: fixture.sessionId,
    tenantId,
    userId: "user_integration_1",
  });
}
