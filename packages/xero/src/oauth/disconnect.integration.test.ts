// biome-ignore-all lint/style/useFilenamingConvention: The requested test file is disconnect.integration.test.ts.

import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/xero/src/oauth/disconnect.integration.test.ts"
);

type DatabaseModule = typeof import("@repo/database");
type XeroServiceModule = typeof import("./service");

let database: DatabaseModule["database"];
let disconnectXeroOAuthConnection: XeroServiceModule["disconnectXeroOAuthConnection"];

const tenantA = {
  availabilityRecordId: fixture.id("availability-record", 0),
  candidatePersonId: fixture.id("candidate-person", 0),
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
  connectionId: fixture.id("connection", 0),
  cursorId: fixture.id("cursor", 0),
  leaveBalanceId: fixture.id("leave-balance", 0),
  matchId: fixture.id("match", 0),
  organisationId: fixture.tenants[0]?.organisationId as string,
  syncRunId: fixture.id("sync-run", 0),
  xeroPersonId: fixture.id("xero-person", 0),
  xeroTenantId: fixture.id("tenant", 0),
};

const tenantB = {
  availabilityRecordId: fixture.id("availability-record", 1),
  candidatePersonId: fixture.id("candidate-person", 1),
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
  connectionId: fixture.id("connection", 1),
  cursorId: fixture.id("cursor", 1),
  leaveBalanceId: fixture.id("leave-balance", 1),
  matchId: fixture.id("match", 1),
  organisationId: fixture.tenants[1]?.organisationId as string,
  syncRunId: fixture.id("sync-run", 1),
  xeroPersonId: fixture.id("xero-person", 1),
  xeroTenantId: fixture.id("tenant", 1),
};

const tenantFixtures = [tenantA, tenantB] as const;
const testClerkOrgIds = tenantFixtures.map((tenant) => tenant.clerkOrgId);

describe("disconnectXeroOAuthConnection integration", () => {
  beforeAll(async () => {
    const [databaseModule, serviceModule] = await Promise.all([
      import("@repo/database"),
      import("./service"),
    ]);
    ({ database } = databaseModule);
    ({ disconnectXeroOAuthConnection } = serviceModule);
  });

  beforeEach(async () => {
    await cleanTestData();
    await createTenantFixture(tenantA);
    await createTenantFixture(tenantB);
  });

  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });

  test("non-destructive disconnect clears only the target connection tokens", async () => {
    const result = await disconnectXeroOAuthConnection({
      clerkOrgId: tenantA.clerkOrgId,
      connectionId: tenantA.connectionId,
      destructive: false,
      organisationId: tenantA.organisationId,
      performedByUserId: "admin_1",
    });

    expect(result).toEqual({
      ok: true,
      value: { disconnected: true, remoteRevoked: false },
    });

    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectConnectionActive(tenantB);
    await expectTenantDataPresent(tenantA);
    await expectTenantDataPresent(tenantB);
  });

  test("destructive disconnect clears only tenant-scoped Xero data", async () => {
    const result = await disconnectXeroOAuthConnection({
      clerkOrgId: tenantA.clerkOrgId,
      connectionId: tenantA.connectionId,
      destructive: true,
      organisationId: tenantA.organisationId,
      performedByUserId: "admin_1",
    });

    expect(result).toEqual({
      ok: true,
      value: { disconnected: true, remoteRevoked: false },
    });

    await expectConnectionDisconnected(tenantA, "admin_1");
    await expectTargetTenantDestroyed(tenantA);
    await expectConnectionActive(tenantB);
    await expectTenantDataPresent(tenantB);
  });
});

async function cleanTestData() {
  if (!database) {
    return;
  }
  await database.xeroSyncCursor.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.syncRun.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.leaveBalance.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.xeroPersonMatch.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.availabilityPublication.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.availabilityRecord.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.person.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.xeroTenant.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.xeroConnection.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.organisation.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
}

async function createTenantFixture(tenant: typeof tenantA) {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Disconnect fixture ${tenant.clerkOrgId}`,
    },
  });
  await database.xeroConnection.create({
    data: {
      access_token_auth_tag: "access-auth-tag",
      access_token_encrypted: "access-token",
      access_token_iv: "access-iv",
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date("2026-07-01T00:00:00.000Z"),
      id: tenant.connectionId,
      last_connected_at: new Date("2026-06-01T00:00:00.000Z"),
      organisation_id: tenant.organisationId,
      refresh_token_auth_tag: "refresh-auth-tag",
      refresh_token_encrypted: "refresh-token",
      refresh_token_iv: "refresh-iv",
      status: "active",
    },
  });
  await database.xeroTenant.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.xeroTenantId,
      organisation_id: tenant.organisationId,
      payroll_region: "AU",
      tenant_name: `Tenant ${tenant.clerkOrgId}`,
      xero_connection_id: tenant.connectionId,
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
      xero_tenant_id: tenant.xeroTenantId,
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
      xero_tenant_id: tenant.xeroTenantId,
    },
  });
  await database.xeroSyncCursor.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      cursor_value: "cursor-1",
      entity_type: "leave_records",
      id: tenant.cursorId,
      organisation_id: tenant.organisationId,
      xero_tenant_id: tenant.xeroTenantId,
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
    access_token_auth_tag: null,
    access_token_encrypted: "",
    access_token_iv: null,
    disconnected_by_user_id: disconnectedByUserId,
    refresh_token_auth_tag: null,
    refresh_token_encrypted: "",
    refresh_token_iv: null,
    status: "disconnected",
  });
  expect(connection.disconnected_at).toBeInstanceOf(Date);
}

async function expectConnectionActive(tenant: typeof tenantA) {
  const connection = await database.xeroConnection.findUniqueOrThrow({
    where: { id: tenant.connectionId },
  });

  expect(connection.status).toBe("active");
  expect(connection.access_token_encrypted).toBe("access-token");
  expect(connection.refresh_token_encrypted).toBe("refresh-token");
  expect(connection.disconnected_at).toBeNull();
}

async function expectTenantDataPresent(tenant: typeof tenantA) {
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
  ).resolves.toBe(1);

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
