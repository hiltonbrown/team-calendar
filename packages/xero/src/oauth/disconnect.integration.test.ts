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
const fixture = allocateLiveTestFixture(
  "packages/xero/src/oauth/disconnect.integration.test.ts"
);
function allocateTenant(index: number) {
  const slot = fixture.tenants[index];
  if (!slot) {
    throw new Error("Missing owned integration fixture slot");
  }
  return {
    ...slot,
    authorisationId: fixture.id("authorisation", index),
    availabilityRecordId: fixture.id("availability-record", index),
    candidatePersonId: fixture.id("candidate-person", index),
    connectionId: fixture.id("connection", index),
    cursorId: fixture.id("cursor", index),
    leaveBalanceId: fixture.id("leave-balance", index),
    matchId: fixture.id("match", index),
    remoteId: fixture.id("remote", index),
    syncRunId: fixture.id("sync-run", index),
    xeroPersonId: fixture.id("xero-person", index),
  };
}
const tenantA = allocateTenant(0),
  tenantB = allocateTenant(1);
const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId];
let database: typeof import("@repo/database")["database"];
let disconnectXeroOAuthConnection: typeof import("./service")["disconnectXeroOAuthConnection"];
let encryptXeroToken: typeof import("../crypto/tokens")["encryptXeroToken"];
let decryptXeroToken: typeof import("../crypto/tokens")["decryptXeroToken"];
const originalEnv = { ...process.env };
beforeAll(async () => {
  process.env.XERO_CLIENT_ID = "test-xero-client-id";
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64"
  );
  ({ database } = await import("@repo/database"));
  ({ disconnectXeroOAuthConnection } = await import("./service"));
  ({ encryptXeroToken, decryptXeroToken } = await import("../crypto/tokens"));
});
beforeEach(async () => {
  await cleanTestData();
  await createTenantFixture(tenantA);
  await createTenantFixture(tenantB);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 }))
  );
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
  process.env = { ...originalEnv };
});
async function cleanTestData() {
  if (!database) {
    return;
  }
  const where = { clerk_org_id: { in: testClerkOrgIds } };
  await database.auditEvent.deleteMany({ where });
  await database.xeroSyncCursor.deleteMany({ where });
  await database.syncRun.deleteMany({ where });
  await database.leaveBalance.deleteMany({ where });
  await database.xeroPersonMatch.deleteMany({ where });
  await database.availabilityPublication.deleteMany({ where });
  await database.availabilityRecord.deleteMany({ where });
  await database.person.deleteMany({ where });
  await database.xeroConnection.deleteMany({ where });
  await database.organisation.deleteMany({ where });
  await database.xeroAuthorisation.deleteMany({
    where: { id: { in: [tenantA.authorisationId, tenantB.authorisationId] } },
  });
}
function disconnect(destructive = false) {
  return disconnectXeroOAuthConnection({
    clerkOrgId: tenantA.clerkOrgId,
    connectionId: tenantA.connectionId,
    destructive,
    organisationId: tenantA.organisationId,
    performedByUserId: "admin_1",
  });
}
describe("canonical disconnect isolation", () => {
  it("deletes the exact remote connection and retains target payroll data on ordinary disconnect", async () => {
    const provider = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", provider);
    expect(await disconnect()).toEqual({
      ok: true,
      value: { connectionId: tenantA.connectionId, state: "disconnected" },
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]?.[0]).toBe(
      `https://api.xero.com/connections/${tenantA.remoteId}`
    );
    expect(provider.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
    expect(
      new Headers(provider.mock.calls[0]?.[1].headers).get("Authorization")
    ).toBe("Bearer access-token");
    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectConnectionActive(tenantB);
    await expectTenantDataPresent(tenantA, true);
    await expectTenantDataPresent(tenantB);
  });
  it("destructive disconnect clears only target-scoped Xero source data", async () => {
    expect(await disconnect(true)).toEqual({
      ok: true,
      value: { connectionId: tenantA.connectionId, state: "disconnected" },
    });
    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectTargetTenantDestroyed(tenantA);
    await expectConnectionActive(tenantB);
    await expectTenantDataPresent(tenantB);
  });
  it("does not tear down local state when remote DELETE is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 }))
    );
    expect(await disconnect()).toMatchObject({ ok: false });
    await expectConnectionActive(tenantA);
    await expectTenantDataPresent(tenantA);
    await expectConnectionActive(tenantB);
  });
  it("does not tear down local state after a dropped remote response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect(await disconnect()).toMatchObject({ ok: false });
    await expectConnectionActive(tenantA);
    await expectTenantDataPresent(tenantA);
  });
  it("rejects a foreign Clerk account before provider DELETE", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    expect(
      await disconnectXeroOAuthConnection({
        clerkOrgId: tenantB.clerkOrgId,
        connectionId: tenantA.connectionId,
        destructive: false,
        organisationId: tenantA.organisationId,
      })
    ).toMatchObject({ ok: false });
    expect(provider).not.toHaveBeenCalled();
    await expectConnectionActive(tenantA);
  });
  it("accepts remote 404 as confirmed absence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    expect(await disconnect()).toMatchObject({ ok: true });
    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectConnectionActive(tenantB);
  });
});
async function createTenantFixture(tenant: typeof tenantA) {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Disconnect fixture ${tenant.clerkOrgId}`,
    },
  });
  const a = encryptXeroToken("access-token"),
    r = encryptXeroToken("refresh-token");
  await database.xeroAuthorisation.create({
    data: {
      access_token_auth_tag: a.authTag,
      access_token_encrypted: a.encrypted,
      access_token_expires_at: new Date(Date.now() + 1_800_000),
      access_token_iv: a.iv,
      granted_scopes: ["payroll.employees"],
      id: tenant.authorisationId,
      last_refreshed_at: new Date(),
      provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
      refresh_token_auth_tag: r.authTag,
      refresh_token_encrypted: r.encrypted,
      refresh_token_iv: r.iv,
      token_encrypted_at: a.encryptedAt,
      token_key_version: a.keyVersion,
      xero_user_id: tenant.authorisationId,
    },
  });
  await database.xeroConnection.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.connectionId,
      organisation_id: tenant.organisationId,
      payroll_region: "AU",
      remote_connection_id: tenant.remoteId,
      status: "active",
      tenant_name: "Payroll",
      xero_authorisation_id: tenant.authorisationId,
      xero_tenant_id: `xero-${tenant.clerkOrgId}`,
    },
  });
  await database.person.createMany({
    data: [
      {
        clerk_org_id: tenant.clerkOrgId,
        clerk_user_id: `user_${tenant.clerkOrgId}`,
        email: `${tenant.clerkOrgId}.xero@example.com`,
        employment_type: "employee",
        first_name: "Xero",
        id: tenant.xeroPersonId,
        is_active: true,
        last_name: "Person",
        organisation_id: tenant.organisationId,
        source_person_key: `employee-${tenant.clerkOrgId}`,
        source_system: "XERO",
        xero_employee_id: `employee-${tenant.clerkOrgId}`,
      },
      {
        clerk_org_id: tenant.clerkOrgId,
        email: `${tenant.clerkOrgId}.candidate@example.com`,
        employment_type: "employee",
        first_name: "Candidate",
        id: tenant.candidatePersonId,
        is_active: true,
        last_name: "Person",
        organisation_id: tenant.organisationId,
        source_person_key: null,
        source_system: "MANUAL",
        xero_employee_id: null,
      },
    ],
  });
  await database.leaveBalance.create({
    data: {
      balance: 76,
      balance_unit: "hours",
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.leaveBalanceId,
      leave_type_name: "Annual Leave",
      leave_type_xero_id: `annual-${tenant.clerkOrgId}`,
      organisation_id: tenant.organisationId,
      person_id: tenant.xeroPersonId,
      record_type: "annual_leave",
      xero_connection_id: tenant.connectionId,
    },
  });
  await database.xeroPersonMatch.create({
    data: {
      candidate_person_id: tenant.candidatePersonId,
      clerk_org_id: tenant.clerkOrgId,
      detected_reason: "email_match",
      id: tenant.matchId,
      organisation_id: tenant.organisationId,
      status: "pending",
      xero_person_id: tenant.xeroPersonId,
    },
  });
  await database.availabilityRecord.create({
    data: {
      all_day: true,
      approval_status: "approved",
      clerk_org_id: tenant.clerkOrgId,
      contactability: "unavailable",
      derived_uid_key: `uid-${tenant.clerkOrgId}`,
      ends_at: new Date("2026-06-05T00:00:00.000Z"),
      id: tenant.availabilityRecordId,
      organisation_id: tenant.organisationId,
      person_id: tenant.xeroPersonId,
      privacy_mode: "named",
      publish_status: "eligible",
      record_type: "annual_leave",
      source_remote_id: `leave-${tenant.clerkOrgId}`,
      source_type: "xero_leave",
      starts_at: new Date("2026-06-04T00:00:00.000Z"),
      title: "Annual leave",
    },
  });
  await database.syncRun.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.syncRunId,
      organisation_id: tenant.organisationId,
      run_type: "leave_records",
      started_at: new Date("2026-06-01T00:00:00.000Z"),
      status: "succeeded",
      trigger_type: "manual",
      xero_connection_id: tenant.connectionId,
    },
  });
  await database.xeroSyncCursor.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      entity_type: "leave_records",
      id: tenant.cursorId,
      modified_since: new Date(),
      organisation_id: tenant.organisationId,
      xero_connection_id: tenant.connectionId,
    },
  });
}

async function expectConnectionDisconnected(
  tenant: typeof tenantA,
  disconnectedByUserId: string
) {
  const connection = await database.xeroConnection.findUniqueOrThrow({
    where: { id: tenant.connectionId },
  });

  expect(connection).toMatchObject({
    disconnected_by_user_id: disconnectedByUserId,
    remote_connection_id: null,
    status: "disconnected",
    xero_authorisation_id: null,
  });
  expect(connection.disconnected_at).toBeInstanceOf(Date);
}

async function expectConnectionActive(tenant: typeof tenantA) {
  const connection = await database.xeroConnection.findUniqueOrThrow({
    where: { id: tenant.connectionId },
  });

  expect(connection.status).toBe("active");
  expect(connection.xero_authorisation_id).toBe(tenant.authorisationId);
  const grant = await database.xeroAuthorisation.findUniqueOrThrow({
    where: { id: tenant.authorisationId },
  });
  expect(
    decryptXeroToken({
      authTag: grant.access_token_auth_tag,
      encrypted: grant.access_token_encrypted,
      iv: grant.access_token_iv,
      keyVersion: grant.token_key_version,
    })
  ).toBe("access-token");
  expect(connection.disconnected_at).toBeNull();
}

async function expectTenantDataPresent(
  tenant: typeof tenantA,
  disconnected = false
) {
  await expect(
    database.leaveBalance.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(1);
  await expect(
    database.xeroPersonMatch.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(1);
  await expect(
    database.syncRun.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(1);
  await expect(
    database.xeroSyncCursor.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(disconnected ? 0 : 1);

  const person = await database.person.findUniqueOrThrow({
    where: { id: tenant.xeroPersonId },
  });
  expect(person.archived_at).toBeNull();
  expect(person.clerk_user_id).toBe(`user_${tenant.clerkOrgId}`);
  expect(person.xero_employee_id).toBe(`employee-${tenant.clerkOrgId}`);

  const record = await database.availabilityRecord.findUniqueOrThrow({
    where: { id: tenant.availabilityRecordId },
  });
  expect(record.archived_at).toBeNull();
  expect(record.publish_status).toBe("eligible");
}

async function expectTargetTenantDestroyed(tenant: typeof tenantA) {
  await expect(
    database.leaveBalance.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);
  await expect(
    database.xeroPersonMatch.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);
  await expect(
    database.syncRun.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);
  await expect(
    database.xeroSyncCursor.count({
      where: { clerk_org_id: tenant.clerkOrgId },
    })
  ).resolves.toBe(0);

  const person = await database.person.findUniqueOrThrow({
    where: { id: tenant.xeroPersonId },
  });
  expect(person.archived_at).toBeInstanceOf(Date);
  expect(person.clerk_user_id).toBeNull();
  expect(person.xero_employee_id).toBeNull();

  const record = await database.availabilityRecord.findUniqueOrThrow({
    where: { id: tenant.availabilityRecordId },
  });
  expect(record.archived_at).toBeInstanceOf(Date);
  expect(record.publish_status).toBe("archived");
}
