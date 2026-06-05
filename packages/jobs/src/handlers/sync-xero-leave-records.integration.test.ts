import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFetchLeaveRecordsForRegion = vi.fn();
const mockInngestSend = vi.fn(async () => ({ ids: ["event_1"] }));
const ICAL_UID_SUFFIX_REGEX = /@ical\.leavesync\.app$/;

vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-leave-records" })),
    send: mockInngestSend,
  },
}));

vi.mock("@repo/xero", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/xero")>();
  return {
    ...original,
    fetchLeaveRecordsForRegion: (...args: unknown[]) =>
      mockFetchLeaveRecordsForRegion(...args),
  };
});

await import("./setup-env");

const { getRegisteredSyncEventName } = await import("../events");

let database: typeof import("@repo/database")["database"];
let syncXeroLeaveRecords: typeof import("./sync-xero-leave-records")["syncXeroLeaveRecords"];
const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

if (process.env.DATABASE_URL) {
  ({ database } = await import("@repo/database"));
  ({ syncXeroLeaveRecords } = await import("./sync-xero-leave-records"));
}

const tenantA = {
  clerkOrgId: "org_test_leave_sync_a",
  organisationId: "50000000-0000-4000-8000-000000000001",
  personId: "50000000-0000-4000-8000-000000000004",
  xeroConnectionId: "50000000-0000-4000-8000-000000000002",
  xeroEmployeeId: "50000000-0000-4000-8000-000000000005",
  xeroTenantId: "50000000-0000-4000-8000-000000000003",
} as const;

const tenantB = {
  clerkOrgId: "org_test_leave_sync_b",
  organisationId: "60000000-0000-4000-8000-000000000001",
  personId: "60000000-0000-4000-8000-000000000004",
  xeroConnectionId: "60000000-0000-4000-8000-000000000002",
  xeroEmployeeId: tenantA.xeroEmployeeId,
  xeroTenantId: "60000000-0000-4000-8000-000000000003",
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

describe("sync-xero-leave-records handler", () => {
  it("is registered for dispatch", () => {
    expect(getRegisteredSyncEventName("leave_records")).toBe(
      "sync-xero-leave-records"
    );
  });
});

describeWithDatabase("sync-xero-leave-records database flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });

  it("syncs AU leave idempotently and archives stale scoped records", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    await setupFeed(tenantA);
    await createStaleRecord(tenantA);

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const input = syncInput(tenantA);
    const first = await syncXeroLeaveRecords(input);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value).toMatchObject({
        archived: 1,
        failed: 0,
        fetched: 1,
        status: "succeeded",
        upserted: 1,
      });
    }

    const second = await syncXeroLeaveRecords(input);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value).toMatchObject({
        archived: 0,
        failed: 0,
        fetched: 1,
        status: "succeeded",
        upserted: 1,
      });
    }

    const records = await database.availabilityRecord.findMany({
      orderBy: { source_remote_id: "asc" },
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
        source_type: "xero_leave",
      },
    });
    expect(records).toHaveLength(2);
    expect(
      records.filter((record) => record.archived_at === null)
    ).toHaveLength(1);
    expect(
      records.find((record) => record.source_remote_id === leaveId())
        ?.derived_uid_key
    ).toMatch(ICAL_UID_SUFFIX_REGEX);
    expect(
      records.find((record) => record.source_remote_id === staleLeaveId())
        ?.publish_status
    ).toBe("archived");

    expect(mockInngestSend).toHaveBeenCalledWith({
      data: {
        clerkOrgId: tenantA.clerkOrgId,
        feedId: expect.any(String),
        organisationId: tenantA.organisationId,
        reason: "xero_leave_records_synced",
      },
      name: "rebuild-feed-cache",
    });
  });

  it("isolates record failures and completes as partial_success", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        leaveRecords: [
          xeroLeaveRecord(tenantA),
          {
            ...xeroLeaveRecord(tenantA),
            employeeId: "",
            leaveApplicationId: "",
          },
        ],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        fetched: 2,
        status: "partial_success",
        upserted: 1,
      });
    }

    const failedRecords = await database.failedRecord.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
      },
    });
    expect(failedRecords).toHaveLength(1);
    expect(failedRecords[0]).toMatchObject({
      entity_type: "leave_records",
      error_code: "validation_error",
      record_type: "leave_records",
    });
  });

  it("requires both Clerk org and Organisation scope for people and records", async () => {
    await setupTenant(tenantA);
    await setupTenant(tenantB);
    await setupPerson(tenantB);

    mockFetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        leaveRecords: [xeroLeaveRecord(tenantA)],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(syncInput(tenantA));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        status: "partial_success",
        upserted: 0,
      });
    }

    const tenantBRecords = await database.availabilityRecord.findMany({
      where: {
        clerk_org_id: tenantB.clerkOrgId,
        organisation_id: tenantB.organisationId,
      },
    });
    expect(tenantBRecords).toHaveLength(0);
  });
});

async function setupTenant(tenant: typeof tenantA | typeof tenantB) {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Test Org ${tenant.clerkOrgId}`,
    },
  });

  await database.xeroConnection.create({
    data: {
      access_token_encrypted: "encrypted-token",
      clerk_org_id: tenant.clerkOrgId,
      expires_at: new Date(Date.now() + 3_600_000),
      id: tenant.xeroConnectionId,
      organisation_id: tenant.organisationId,
      status: "active",
    },
  });

  await database.xeroTenant.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: tenant.xeroTenantId,
      organisation_id: tenant.organisationId,
      payroll_region: "AU",
      tenant_name: "Xero Tenant",
      xero_connection_id: tenant.xeroConnectionId,
      xero_tenant_id: `xero-${tenant.xeroTenantId}`,
    },
  });
}

async function setupPerson(tenant: typeof tenantA | typeof tenantB) {
  await database.person.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      email: `${tenant.personId}@example.com`,
      employment_type: "employee",
      first_name: "Pat",
      id: tenant.personId,
      last_name: "Taylor",
      organisation_id: tenant.organisationId,
      source_person_key: tenant.xeroEmployeeId,
      source_system: "XERO",
      xero_employee_id: tenant.xeroEmployeeId,
    },
  });
}

async function setupFeed(tenant: typeof tenantA) {
  const feed = await database.feed.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id: "50000000-0000-4000-8000-000000000010",
      name: "Team feed",
      organisation_id: tenant.organisationId,
      slug: "team-feed",
      status: "active",
    },
    select: { id: true },
  });
  await database.feedScope.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      feed_id: feed.id,
      organisation_id: tenant.organisationId,
      scope_type: "person",
      scope_value: tenant.personId,
    },
  });
}

async function createStaleRecord(tenant: typeof tenantA) {
  await database.availabilityRecord.create({
    data: {
      all_day: true,
      approval_status: "approved",
      clerk_org_id: tenant.clerkOrgId,
      contactability: "unavailable",
      derived_uid_key: "stale",
      ends_at: new Date("2026-05-05T00:00:00.000Z"),
      organisation_id: tenant.organisationId,
      person_id: tenant.personId,
      privacy_mode: "named",
      publish_status: "eligible",
      record_type: "annual_leave",
      source_remote_id: staleLeaveId(),
      source_type: "xero_leave",
      starts_at: new Date("2026-05-04T00:00:00.000Z"),
    },
  });
}

async function cleanTestData() {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.failedRecord.deleteMany({ where: scope });
  await database.syncRun.deleteMany({ where: scope });
  await database.availabilityRecord.deleteMany({ where: scope });
  await database.feedScope.deleteMany({ where: scope });
  await database.feed.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.xeroTenant.deleteMany({ where: scope });
  await database.xeroConnection.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
}

function syncInput(tenant: typeof tenantA) {
  return {
    clerkOrgId: tenant.clerkOrgId,
    organisationId: tenant.organisationId,
    triggerType: "manual" as const,
    xeroTenantId: tenant.xeroTenantId,
  };
}

function xeroLeaveRecord(tenant: typeof tenantA) {
  return {
    employeeId: tenant.xeroEmployeeId,
    endDate: "2026-05-08",
    leaveApplicationId: leaveId(),
    leaveTypeId: "annual",
    leaveTypeName: "Annual Leave",
    rawPayload: {
      LeaveApplicationID: leaveId(),
      LeaveType: "Annual Leave",
    },
    startDate: "2026-05-07",
    status: "APPROVED" as const,
    title: "Annual leave",
    units: 15.2,
    updatedDateUtc: "2026-05-01T01:02:03.000Z",
  };
}

function leaveId() {
  return "50000000-0000-4000-8000-000000000006";
}

function staleLeaveId() {
  return "50000000-0000-4000-8000-000000000009";
}
