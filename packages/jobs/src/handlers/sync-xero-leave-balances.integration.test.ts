import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFetchLeaveBalancesForRegion = vi.fn();

vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-leave-balances" })),
    send: vi.fn(async () => ({ ids: ["event_1"] })),
  },
}));

vi.mock("@repo/xero", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/xero")>();
  return {
    ...original,
    fetchLeaveBalancesForRegion: (...args: unknown[]) =>
      mockFetchLeaveBalancesForRegion(...args),
  };
});

await import("./setup-env");

const { getRegisteredSyncEventName } = await import("../events");

let database: typeof import("@repo/database")["database"];
let syncXeroLeaveBalances: typeof import("./sync-xero-leave-balances")["syncXeroLeaveBalances"];
const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

if (process.env.DATABASE_URL) {
  ({ database } = await import("@repo/database"));
  ({ syncXeroLeaveBalances } = await import("./sync-xero-leave-balances"));
}

const tenantA = {
  clerkOrgId: "org_test_balance_sync_a",
  organisationId: "70000000-0000-4000-8000-000000000001",
  personId: "70000000-0000-4000-8000-000000000004",
  xeroConnectionId: "70000000-0000-4000-8000-000000000002",
  xeroEmployeeId: "70000000-0000-4000-8000-000000000005",
  xeroTenantId: "70000000-0000-4000-8000-000000000003",
} as const;

const tenantB = {
  clerkOrgId: "org_test_balance_sync_b",
  organisationId: "80000000-0000-4000-8000-000000000001",
  personId: "80000000-0000-4000-8000-000000000004",
  xeroConnectionId: "80000000-0000-4000-8000-000000000002",
  xeroEmployeeId: tenantA.xeroEmployeeId,
  xeroTenantId: "80000000-0000-4000-8000-000000000003",
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

describe("sync-xero-leave-balances handler", () => {
  it("is registered for dispatch", () => {
    expect(getRegisteredSyncEventName("leave_balances")).toBe(
      "sync-xero-leave-balances"
    );
  });
});

describeWithDatabase("sync-xero-leave-balances database flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });

  it("syncs AU leave balances idempotently by person, tenant, and leave type", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    mockFetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [xeroBalance(tenantA, 76)],
        rawResponses: [],
      },
    });

    const first = await syncXeroLeaveBalances(syncInput(tenantA));
    const second = await syncXeroLeaveBalances(syncInput(tenantA));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value).toMatchObject({
        failed: 0,
        fetched: 1,
        status: "succeeded",
        upserted: 1,
      });
    }

    const balances = await database.leaveBalance.findMany({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        organisation_id: tenantA.organisationId,
      },
    });
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({
      balance_unit: "hours",
      leave_type_xero_id: "annual",
      person_id: tenantA.personId,
      xero_tenant_id: tenantA.xeroTenantId,
    });
    expect(Number(balances[0]?.balance)).toBe(76);
  });

  it("requires both scope keys when resolving people for balances", async () => {
    await setupTenant(tenantA);
    await setupTenant(tenantB);
    await setupPerson(tenantB);
    mockFetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [xeroBalance(tenantA, 76)],
        rawResponses: [],
      },
    });

    const result = await syncXeroLeaveBalances(syncInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        status: "partial_success",
        upserted: 0,
      });
    }

    const tenantBRecords = await database.leaveBalance.findMany({
      where: {
        clerk_org_id: tenantB.clerkOrgId,
        organisation_id: tenantB.organisationId,
      },
    });
    expect(tenantBRecords).toHaveLength(0);
  });

  it("records per-employee fetch failures without failing the whole run", async () => {
    await setupTenant(tenantA);
    await setupPerson(tenantA);
    mockFetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [
          {
            employeeId: "99999999-9999-4999-8999-999999999999",
            error: {
              code: "not_found_error",
              httpStatus: 404,
              message: "Employee not found",
            },
          },
        ],
        leaveBalances: [xeroBalance(tenantA, 76)],
        rawResponses: [],
      },
    });

    const result = await syncXeroLeaveBalances(syncInput(tenantA));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        fetched: 1,
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
      error_code: "not_found_error",
      source_id: "99999999-9999-4999-8999-999999999999",
    });
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
      refresh_token_encrypted: "refresh-token",
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

async function cleanTestData() {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.failedRecord.deleteMany({ where: scope });
  await database.syncRun.deleteMany({ where: scope });
  await database.leaveBalance.deleteMany({ where: scope });
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

function xeroBalance(tenant: typeof tenantA, balance: number) {
  return {
    balance,
    employeeId: tenant.xeroEmployeeId,
    leaveTypeId: "annual",
    leaveTypeName: "Annual Leave",
    rawPayload: { LeaveTypeID: "annual" },
    unitType: "hours" as const,
  };
}
