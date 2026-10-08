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
  await database.person.deleteMany({ where: ownedScopes });
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
  it("connects an existing payroll organisation for all Clerk members while keeping provider identity and credentials canonical", async () => {
    const adminUserId = "user_integration_admin_a";
    const memberUserId = "user_integration_member_b";
    const existing = await organisation();
    await organisation({
      ...primary,
      organisationId: allocation.id("sibling-organisation"),
    });
    await grant(new Date(Date.now() + 1_800_000));
    await database.person.createMany({
      data: [adminUserId, memberUserId].map((userId, index) => ({
        clerk_org_id: fixture.clerkOrgId,
        clerk_user_id: userId,
        email: `${allocation.key("shared-access", index)}@example.test`,
        employment_type: "employee",
        first_name: index === 0 ? "Admin" : "Member",
        id: allocation.id("shared-access-person", index),
        last_name: "Integration",
        organisation_id: fixture.organisationId,
        source_system: "MANUAL",
      })),
    });
    const payroll = stubPayroll();
    const provider = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/connect/token") ? tokenResponse() : payroll(url)
    );
    vi.stubGlobal("fetch", provider);
    const started = await service.buildXeroOAuthStartUrl({
      clerkOrgId: fixture.clerkOrgId,
      organisationId: existing.id,
      userId: adminUserId,
    });
    if (!started.ok) {
      throw new Error("Expected existing-organisation OAuth start");
    }
    const pending = await database.xeroOAuthSession.findFirstOrThrow({
      where: {
        clerk_org_id: fixture.clerkOrgId,
        created_by_user_id: adminUserId,
        status: "pending",
      },
    });
    expect(pending.organisation_id).toBe(existing.id);
    const callback = {
      authenticatedClerkOrgId: fixture.clerkOrgId,
      authenticatedUserId: adminUserId,
      code: "admin-owned-code",
      nonce: started.value.nonce,
      state: new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
    };
    expect(
      await service.completeXeroOAuth({
        ...callback,
        authenticatedUserId: memberUserId,
      })
    ).toMatchObject({ error: { code: "invalid_state" }, ok: false });
    expect(provider).not.toHaveBeenCalled();
    const completed = await service.completeXeroOAuth(callback);
    expect(completed).toMatchObject({
      ok: true,
      value: { connected: { organisationId: existing.id } },
    });
    if (!(completed.ok && completed.value.connected)) {
      throw new Error("Expected connected existing organisation");
    }
    provider.mockClear();
    expect(await service.completeXeroOAuth(callback)).toMatchObject({
      error: { code: "invalid_state" },
      ok: false,
    });
    expect(provider).not.toHaveBeenCalled();
    const { connectionId } = completed.value.connected;
    const member = await database.person.findFirstOrThrow({
      where: {
        clerk_org_id: fixture.clerkOrgId,
        clerk_user_id: memberUserId,
        organisation_id: existing.id,
      },
    });
    // Member B supplies their own tenant scope; the connector's Clerk identity
    // is required only for the OAuth callback, never for payroll access.
    provider.mockClear();
    identity.verify.mockClear();
    expect(
      await canonical.resolveXeroAccess({
        clerkOrgId: member.clerk_org_id,
        connectionId,
        organisationId: member.organisation_id,
      })
    ).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
    expect(
      await canonical.resolveXeroAccess({
        clerkOrgId: secondary.clerkOrgId,
        connectionId,
        organisationId: existing.id,
      })
    ).toMatchObject({ ok: false });
    expect(
      await canonical.resolveXeroAccess({
        clerkOrgId: fixture.clerkOrgId,
        connectionId,
        organisationId: allocation.id("sibling-organisation"),
      })
    ).toMatchObject({ ok: false });
    expect(provider).not.toHaveBeenCalled();
    expect(identity.verify).not.toHaveBeenCalled();
    const connected = await database.xeroConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    const session = await database.xeroOAuthSession.findUniqueOrThrow({
      where: { id: pending.id },
    });
    const authorisation = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(connected).toMatchObject({
      organisation_id: existing.id,
      xero_authorisation_id: authorisation.id,
    });
    expect(session).toMatchObject({
      created_by_user_id: adminUserId,
      organisation_id: existing.id,
      status: "completed",
      xero_authorisation_id: null,
    });
    expect(authorisation.xero_user_id).toBe(allocation.id("xero-user"));
    expect(authorisation.xero_user_id).not.toBe(adminUserId);
    expect(authorisation.xero_user_id).not.toBe(memberUserId);
    expect(tokenText(authorisation, "access")).toBe("new-access-token");
    expect(tokenText(authorisation, "refresh")).toBe("new-refresh-token");
    const people = await database.person.findMany({
      where: {
        clerk_org_id: fixture.clerkOrgId,
        organisation_id: existing.id,
      },
    });
    expect(people.map((person) => person.clerk_user_id).sort()).toEqual(
      [adminUserId, memberUserId].sort()
    );
    for (const row of [connected, session, ...people]) {
      for (const credentialField of [
        "access_token_encrypted",
        "access_token_iv",
        "access_token_auth_tag",
        "refresh_token_encrypted",
        "refresh_token_iv",
        "refresh_token_auth_tag",
        "token_key_version",
        "xero_user_id",
      ]) {
        expect(row).not.toHaveProperty(credentialField);
      }
      expect(JSON.stringify(row)).not.toContain("new-access-token");
      expect(JSON.stringify(row)).not.toContain("new-refresh-token");
    }
    expect(await database.organisation.count({ where: ownedScopes })).toBe(2);
    await database.person.deleteMany({
      where: {
        clerk_org_id: fixture.clerkOrgId,
        clerk_user_id: adminUserId,
        organisation_id: existing.id,
      },
    });
    await database.xeroOAuthSession.delete({ where: { id: pending.id } });
    expect(
      await canonical.resolveXeroAccess({
        clerkOrgId: member.clerk_org_id,
        connectionId,
        organisationId: member.organisation_id,
      })
    ).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
    expect(provider).not.toHaveBeenCalled();
    expect(identity.verify).not.toHaveBeenCalled();
  });
  it("rejects an OAuth start without an existing organisation or initiating Clerk user", async () => {
    await organisation();
    expect(
      await service.buildXeroOAuthStartUrl({
        clerkOrgId: fixture.clerkOrgId,
        userId: "user_integration_1",
      })
    ).toMatchObject({ ok: false });
    expect(
      await service.buildXeroOAuthStartUrl({
        clerkOrgId: fixture.clerkOrgId,
        organisationId: fixture.organisationId,
      })
    ).toMatchObject({ ok: false });
    expect(await database.xeroOAuthSession.count({ where: ownedScopes })).toBe(
      0
    );
  });
  it("cannot select a sibling organisation in a session bound to the original payroll organisation", async () => {
    await organisation();
    const sibling = await organisation({
      ...primary,
      organisationId: allocation.id("sibling-organisation"),
    });
    await selection();
    const provider = stubPayroll();
    expect(
      await service.completeXeroTenantSelection({
        clerkOrgId: fixture.clerkOrgId,
        organisationId: sibling.id,
        sessionId: fixture.sessionId,
        tenantId: fixture.externalId,
        userId: "user_integration_1",
      })
    ).toMatchObject({ ok: false });
    expect(provider).not.toHaveBeenCalled();
    expect(await database.xeroConnection.count({ where: ownedScopes })).toBe(0);
    expect(
      await database.xeroOAuthSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
      })
    ).toMatchObject({
      organisation_id: fixture.organisationId,
      status: "selecting",
    });
  });
  it("rejects a callback after the persisted OAuth session expires before token exchange", async () => {
    await organisation();
    const started = await service.buildXeroOAuthStartUrl({
      clerkOrgId: fixture.clerkOrgId,
      organisationId: fixture.organisationId,
      userId: "user_integration_1",
    });
    if (!started.ok) {
      throw new Error("Expected existing-organisation OAuth start");
    }
    await database.xeroOAuthSession.updateMany({
      data: { expires_at: new Date(Date.now() - 1000) },
      where: ownedScopes,
    });
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(
      await service.completeXeroOAuth({
        authenticatedClerkOrgId: fixture.clerkOrgId,
        authenticatedUserId: "user_integration_1",
        code: "expired-session-code",
        nonce: started.value.nonce,
        state:
          new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
      })
    ).toMatchObject({ error: { code: "invalid_state" }, ok: false });
    expect(provider).not.toHaveBeenCalled();
    expect(await database.xeroConnection.count({ where: ownedScopes })).toBe(0);
    expect(
      await database.xeroOAuthSession.findFirstOrThrow({ where: ownedScopes })
    ).toMatchObject({
      organisation_id: fixture.organisationId,
      status: "pending",
      xero_authorisation_id: null,
    });
  });
  it("rejects a tenant substituted outside the persisted selection inventory", async () => {
    await organisation();
    await selection();
    const provider = stubPayroll();
    expect(await select(allocation.id("substituted-tenant"))).toMatchObject({
      ok: false,
    });
    expect(provider).not.toHaveBeenCalled();
    expect(await database.xeroConnection.count({ where: ownedScopes })).toBe(0);
    expect(
      await database.xeroOAuthSession.findUniqueOrThrow({
        where: { id: fixture.sessionId },
      })
    ).toMatchObject({ status: "selecting" });
  });
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
    const results = await Promise.all(
      Array.from({ length: 5 }, () => canonical.resolveXeroAccess(scope()))
    );
    for (const result of results) {
      expect(result).toMatchObject({
        ok: true,
        value: { accessToken: "new-access-token" },
      });
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const saved = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(tokenText(saved, "access")).toBe("new-access-token");
    expect(tokenText(saved, "refresh")).toBe("new-refresh-token");
  });
  it("saves rotated credentials without a post-refresh JWKS dependency", async () => {
    await connection();
    identity.verify.mockRejectedValue(new Error("JWKS unavailable"));
    const provider = vi.fn<typeof fetch>(async () => tokenResponse());
    vi.stubGlobal("fetch", provider);
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
    const saved = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(tokenText(saved, "refresh")).toBe("new-refresh-token");
    expect(saved.xero_user_id).toBe(allocation.id("xero-user"));
    expect(saved.status).toBe("active");
    expect(saved.access_token_expires_at.getTime()).toBeGreaterThan(Date.now());
    await database.xeroAuthorisation.update({
      data: { access_token_expires_at: new Date(Date.now() - 1000) },
      where: { id: saved.id },
    });
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: true,
    });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(
      new URLSearchParams(String(provider.mock.calls[1]?.[1]?.body)).get(
        "refresh_token"
      )
    ).toBe("new-refresh-token");
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
  it.each(["disconnected", "archived", "inactive"] as const)(
    "skips dormant rotation if its Organisation connection becomes %s before the locked recheck",
    async (state) => {
      await connection();
      const now = new Date();
      const before = await database.xeroAuthorisation.update({
        data: {
          last_refreshed_at: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
        },
        where: { id: fixture.authorisationId },
      });
      if (state === "disconnected") {
        await database.xeroConnection.update({
          data: { disconnected_at: now, status: "disconnected" },
          where: { id: fixture.connectionId },
        });
      } else {
        await database.organisation.update({
          data:
            state === "archived" ? { archived_at: now } : { is_active: false },
          where: { id: fixture.organisationId },
        });
      }
      const provider = vi.fn();
      vi.stubGlobal("fetch", provider);
      // The scheduler may already have enumerated this grant before the change.
      expect(
        await canonical.refreshXeroAuthorisation({
          authorisationId: fixture.authorisationId,
          deadline: { expiresAtMs: Date.now() + 10_000 },
          now,
          reason: "dormant",
        })
      ).toMatchObject({ ok: true });
      const after = await database.xeroAuthorisation.findUniqueOrThrow({
        where: { id: fixture.authorisationId },
      });
      expect(after.refresh_token_encrypted).toBe(
        before.refresh_token_encrypted
      );
      expect(after.last_refreshed_at).toEqual(before.last_refreshed_at);
      expect(provider).not.toHaveBeenCalled();
    }
  );

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
    const saved = await database.xeroAuthorisation.findUniqueOrThrow({
      where: { id: fixture.authorisationId },
    });
    expect(tokenText(saved, "access")).toBe("new-access-token");
    expect(tokenText(saved, "refresh")).toBe("new-refresh-token");
    expect(await canonical.refreshDormantXeroAuthorisations(now)).toEqual({
      ok: true,
      value: { failed: 0, refreshed: 0, scanned: 0, skipped: 0 },
    });
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
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
  it("permits a later admin to reconnect after confirmed soft disconnect without losing business data", async () => {
    await connection();
    await database.xeroAuthorisation.update({
      data: { access_token_expires_at: new Date(Date.now() + 1_800_000) },
      where: { id: fixture.authorisationId },
    });
    const person = await database.person.create({
      data: {
        clerk_org_id: fixture.clerkOrgId,
        email: `${allocation.key("preserved-person")}@example.test`,
        employment_type: "employee",
        first_name: "Preserved",
        id: allocation.id("preserved-person"),
        last_name: "Person",
        organisation_id: fixture.organisationId,
        source_system: "MANUAL",
      },
    });
    const provider = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 })
    );
    vi.stubGlobal("fetch", provider);
    expect(
      await (await import("./disconnect")).disconnectXeroOAuthConnection({
        ...scope(),
        destructive: false,
        performedByUserId: "disconnect_admin_a",
      })
    ).toMatchObject({ ok: true, value: { state: "disconnected" } });
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: false,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    const replacement = await grant(
      new Date(Date.now() + 1_800_000),
      ownedGrants[1]
    );
    identity.verify.mockResolvedValue({
      ok: true,
      value: {
        authEventId: null,
        expiresAt: new Date(Date.now() + 1_800_000),
        grantedScopes: ["payroll.employees"],
        xeroUserId: replacement.xero_user_id,
      },
    });
    const payroll = stubPayroll();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) =>
        String(url).endsWith("/connect/token") ? tokenResponse() : payroll(url)
      )
    );
    const started = await service.buildXeroOAuthStartUrl({
      clerkOrgId: fixture.clerkOrgId,
      organisationId: fixture.organisationId,
      userId: "reconnect_admin_b",
    });
    if (!started.ok) {
      throw new Error("Expected later admin reconnect start");
    }
    expect(
      await service.completeXeroOAuth({
        authenticatedClerkOrgId: fixture.clerkOrgId,
        authenticatedUserId: "reconnect_admin_b",
        code: "later-admin-code",
        nonce: started.value.nonce,
        state:
          new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
      })
    ).toMatchObject({
      ok: true,
      value: { connected: { connectionId: fixture.connectionId } },
    });
    expect(
      await database.person.findUniqueOrThrow({ where: { id: person.id } })
    ).toEqual(person);
    expect(
      await database.xeroConnection.findUniqueOrThrow({
        where: { id: fixture.connectionId },
      })
    ).toMatchObject({
      organisation_id: fixture.organisationId,
      status: "active",
      xero_authorisation_id: replacement.id,
      xero_tenant_id: fixture.externalId,
    });
    expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
      ok: true,
      value: { accessToken: "new-access-token" },
    });
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
  it("rejects an unbound selection without creating a local organisation", async () => {
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
        await organisation();
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
        organisationId: fixture.organisationId,
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

  it.each(["user_integration_admin_a", "user_integration_admin_b"])(
    "reconnects through OAuth as %s after the original app Person and provider credentials become unavailable",
    async (adminUserId) => {
      await connection();
      await database.person.create({
        data: {
          clerk_org_id: fixture.clerkOrgId,
          clerk_user_id: "user_integration_admin_a",
          email: `${allocation.key("former-admin")}@example.test`,
          employment_type: "employee",
          first_name: "Former",
          id: allocation.id("former-admin"),
          last_name: "Admin",
          organisation_id: fixture.organisationId,
          source_system: "MANUAL",
        },
      });
      await database.person.deleteMany({ where: ownedScopes });
      await database.xeroAuthorisation.update({
        data: {
          access_token_encrypted: "unavailable-original-credentials",
          refresh_token_encrypted: "unavailable-original-credentials",
          status: "reconnect_required",
        },
        where: { id: fixture.authorisationId },
      });
      const oldGrant = await database.xeroAuthorisation.findUniqueOrThrow({
        where: { id: fixture.authorisationId },
      });
      const replacement = await grant(
        new Date(Date.now() + 1_800_000),
        ownedGrants[1]
      );
      identity.verify.mockResolvedValue({
        ok: true,
        value: {
          authEventId: null,
          expiresAt: new Date(Date.now() + 1_800_000),
          grantedScopes: ["payroll.employees"],
          xeroUserId: replacement.xero_user_id,
        },
      });
      const replacementRemote = allocation.id("replacement-remote");
      const provider = vi.fn<typeof fetch>((url, init) => {
        if (String(url).endsWith("/connect/token")) {
          return Promise.resolve(tokenResponse());
        }
        if (
          new Headers(init?.headers).get("Authorization") !==
          "Bearer new-access-token"
        ) {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.resolve(
          String(url).endsWith("/connections")
            ? Response.json([
                {
                  id: replacementRemote,
                  tenantId: fixture.externalId,
                  tenantName: "Payroll",
                  tenantType: "ORGANISATION",
                },
              ])
            : Response.json({ Organisations: [{ CountryCode: "AU" }] })
        );
      });
      vi.stubGlobal("fetch", provider);
      const started = await service.buildXeroOAuthStartUrl({
        clerkOrgId: fixture.clerkOrgId,
        organisationId: fixture.organisationId,
        userId: adminUserId,
      });
      if (!started.ok) {
        throw new Error("Expected administrator reconnect start");
      }
      expect(
        await service.completeXeroOAuth({
          authenticatedClerkOrgId: fixture.clerkOrgId,
          authenticatedUserId: adminUserId,
          code: "replacement-authoriser-code",
          nonce: started.value.nonce,
          state:
            new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
        })
      ).toMatchObject({
        ok: true,
        value: {
          connected: {
            connectionId: fixture.connectionId,
            organisationId: fixture.organisationId,
          },
        },
      });
      expect(
        await database.xeroConnection.findUniqueOrThrow({
          where: { id: fixture.connectionId },
        })
      ).toMatchObject({
        id: fixture.connectionId,
        organisation_id: fixture.organisationId,
        remote_connection_id: replacementRemote,
        status: "active",
        xero_authorisation_id: replacement.id,
        xero_tenant_id: fixture.externalId,
      });
      expect(
        await database.auditEvent.findMany({ where: ownedScopes })
      ).toMatchObject([
        {
          action: "xero_connected",
          actor_user_id: adminUserId,
          organisation_id: fixture.organisationId,
          resource_id: fixture.connectionId,
        },
      ]);
      expect(
        await database.xeroAuthorisation.findUniqueOrThrow({
          where: { id: oldGrant.id },
        })
      ).toEqual(oldGrant);
      expect(await canonical.resolveXeroAccess(scope())).toMatchObject({
        ok: true,
        value: {
          accessToken: "new-access-token",
          connectionId: fixture.connectionId,
          xeroTenantId: fixture.externalId,
        },
      });
      expect(
        await database.xeroAuthorisation.findUniqueOrThrow({
          where: { id: replacement.id },
        })
      ).toMatchObject({
        status: "active",
        xero_user_id: replacement.xero_user_id,
      });
      expect(await database.person.count({ where: ownedScopes })).toBe(0);
      expect(await database.xeroConnection.count({ where: ownedScopes })).toBe(
        1
      );
      expect(
        provider.mock.calls.filter(([url]) =>
          String(url).endsWith("/connect/token")
        )
      ).toHaveLength(1);
    }
  );
  it.each(["cancelled", "exchange_failed"])(
    "preserves the original connection and credential when administrator B's reconnect is %s",
    async (outcome) => {
      const originalConnection = await connection();
      const originalGrant = await database.xeroAuthorisation.findUniqueOrThrow({
        where: { id: fixture.authorisationId },
      });
      const started = await service.buildXeroOAuthStartUrl({
        clerkOrgId: fixture.clerkOrgId,
        organisationId: fixture.organisationId,
        userId: "user_integration_admin_b",
      });
      if (!started.ok) {
        throw new Error("Expected administrator reconnect start");
      }
      const callback = {
        authenticatedClerkOrgId: fixture.clerkOrgId,
        authenticatedUserId: "user_integration_admin_b",
        nonce: started.value.nonce,
        state:
          new URL(started.value.redirectUrl).searchParams.get("state") ?? "",
      };
      const provider = vi.fn<typeof fetch>(async () =>
        Response.json({ error: "invalid_grant" }, { status: 400 })
      );
      vi.stubGlobal("fetch", provider);
      if (outcome === "cancelled") {
        expect(await service.cancelXeroOAuth(callback)).toMatchObject({
          ok: true,
        });
        expect(provider).not.toHaveBeenCalled();
      } else {
        expect(
          await service.completeXeroOAuth({
            ...callback,
            code: "rejected-code",
          })
        ).toMatchObject({ ok: false });
        expect(provider).toHaveBeenCalledTimes(1);
      }
      expect(
        await database.xeroConnection.findUniqueOrThrow({
          where: { id: fixture.connectionId },
        })
      ).toEqual(originalConnection);
      expect(
        await database.xeroAuthorisation.findUniqueOrThrow({
          where: { id: fixture.authorisationId },
        })
      ).toEqual(originalGrant);
      expect(await database.auditEvent.count({ where: ownedScopes })).toBe(0);
    }
  );
  it("allows only one competing reconnect selection to commit against the same connection snapshot", async () => {
    await connection();
    const replacement = await grant(
      new Date(Date.now() + 1_800_000),
      ownedGrants[1]
    );
    await selection();
    await database.xeroOAuthSession.update({
      data: { xero_authorisation_id: replacement.id },
      where: { id: fixture.sessionId },
    });
    const competingSessionId = allocation.id("competing-reconnect-session");
    await database.xeroOAuthSession.create({
      data: {
        available_tenants_json: {
          tenants: [
            {
              connectionId: fixture.remoteId,
              tenantId: fixture.externalId,
              tenantName: "Payroll",
            },
          ],
        },
        clerk_org_id: fixture.clerkOrgId,
        created_by_user_id: "user_integration_admin_b",
        expires_at: new Date(Date.now() + 600_000),
        id: competingSessionId,
        organisation_id: fixture.organisationId,
        return_to: "/calendar",
        status: "selecting",
        xero_authorisation_id: replacement.id,
      },
    });
    let inventories = 0;
    let releaseInventories: () => void = () => {
      throw new Error("Uninitialised competing selection barrier");
    };
    const bothSnapshotsLoaded = new Promise<void>((resolve) => {
      releaseInventories = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        if (String(url).endsWith("/connections")) {
          inventories += 1;
          if (inventories === 2) {
            releaseInventories();
          }
          await bothSnapshotsLoaded;
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
      })
    );
    const results = await Promise.all([
      select(),
      service.completeXeroTenantSelection({
        clerkOrgId: fixture.clerkOrgId,
        organisationId: fixture.organisationId,
        sessionId: competingSessionId,
        tenantId: fixture.externalId,
        userId: "user_integration_admin_b",
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([
      { error: { code: "tenant_binding_conflict" }, ok: false },
    ]);
    expect(await database.xeroConnection.count({ where: ownedScopes })).toBe(1);
    expect(
      await database.xeroConnection.findUniqueOrThrow({
        where: { id: fixture.connectionId },
      })
    ).toMatchObject({
      organisation_id: fixture.organisationId,
      xero_authorisation_id: replacement.id,
      xero_tenant_id: fixture.externalId,
    });
    expect(await database.auditEvent.count({ where: ownedScopes })).toBe(1);
    const sessions = await database.xeroOAuthSession.findMany({
      where: ownedScopes,
    });
    expect(sessions.map((session) => session.status).sort()).toEqual([
      "completed",
      "selecting",
    ]);
  });

  it.each([
    { expired: false, hasSibling: false, status: "active" },
    { expired: false, hasSibling: true, status: "active" },
    { expired: false, hasSibling: false, status: "reconnect_required" },
    { expired: false, hasSibling: true, status: "reconnect_required" },
    { expired: true, hasSibling: false, status: "reconnect_required" },
    { expired: true, hasSibling: true, status: "reconnect_required" },
  ] satisfies Array<{
    expired: boolean;
    hasSibling: boolean;
    status: "active" | "reconnect_required";
  }>)(
    "replaces an old link without using its credentials with $status status, expired grant $expired and sibling usage $hasSibling",
    async ({ expired, hasSibling, status }) => {
      await connection();
      await database.xeroConnection.update({
        data: { status },
        where: { id: fixture.connectionId },
      });
      await database.xeroAuthorisation.update({
        data: {
          access_token_expires_at: new Date(
            Date.now() + (expired ? -60_000 : 1_800_000)
          ),
        },
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
      const provider = vi.fn<typeof fetch>((url, init) => {
        const bearer = new Headers(init?.headers).get("Authorization");
        if (bearer !== "Bearer replacement-access") {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        if (String(url).endsWith("/connections")) {
          return Promise.resolve(
            Response.json([
              {
                id: replacementRemote,
                tenantId: fixture.externalId,
                tenantName: "Payroll",
                tenantType: "ORGANISATION",
              },
            ])
          );
        }
        return Promise.resolve(
          Response.json({ Organisations: [{ CountryCode: "AU" }] })
        );
      });
      vi.stubGlobal("fetch", provider);
      expect(await select()).toMatchObject({ ok: true });
      expect(provider).toHaveBeenCalledTimes(2);
      for (const [url, init] of provider.mock.calls) {
        expect(String(url)).not.toContain("/connect/token");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer replacement-access"
        );
      }
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
      ).toMatchObject({
        id: fixture.connectionId,
        remote_connection_id: replacementRemote,
        status: "active",
        xero_authorisation_id: replacement.id,
      });
      if (hasSibling) {
        expect(
          await database.xeroConnection.findFirstOrThrow({
            where: {
              clerk_org_id: secondary.clerkOrgId,
              organisation_id: secondary.organisationId,
            },
          })
        ).toMatchObject({
          status: "active",
          xero_authorisation_id: fixture.authorisationId,
        });
      }
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
