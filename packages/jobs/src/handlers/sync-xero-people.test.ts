import "./setup-env";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { database } from "@repo/database";
import { getRegisteredSyncEventName } from "../events";
import { syncXeroPeople } from "./sync-xero-people";

// Mock fetchEmployeesForRegion and toPlainLanguageMessage from @repo/xero
const mockFetchEmployeesForRegion = vi.fn();
vi.mock("@repo/xero", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/xero")>();
  return {
    ...original,
    fetchEmployeesForRegion: (...args: any[]) =>
      mockFetchEmployeesForRegion(...args),
  };
});

const tenantA = {
  clerkOrgId: "org_test_people_sync_a",
  organisationId: "30000000-0000-4000-8000-000000000001",
  xeroConnectionId: "30000000-0000-4000-8000-000000000002",
  xeroTenantId: "30000000-0000-4000-8000-000000000003",
} as const;

const tenantB = {
  clerkOrgId: "org_test_people_sync_b",
  organisationId: "40000000-0000-4000-8000-000000000001",
  xeroConnectionId: "40000000-0000-4000-8000-000000000002",
  xeroTenantId: "40000000-0000-4000-8000-000000000003",
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

async function setupTenant(tenant: typeof tenantA) {
  await database.organisation.create({
    data: {
      id: tenant.organisationId,
      clerk_org_id: tenant.clerkOrgId,
      name: `Test Org ${tenant.clerkOrgId}`,
      country_code: "AU",
    },
  });

  await database.xeroConnection.create({
    data: {
      id: tenant.xeroConnectionId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      access_token_encrypted: "encrypted-token",
      expires_at: new Date(Date.now() + 3_600_000), // 1 hour in future
      status: "active",
    },
  });

  await database.xeroTenant.create({
    data: {
      id: tenant.xeroTenantId,
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      xero_connection_id: tenant.xeroConnectionId,
      xero_tenant_id: "xero-tenant-uuid",
      tenant_name: "Xero Tenant",
      payroll_region: "AU",
    },
  });
}

async function cleanTestData() {
  const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
  await database.failedRecord.deleteMany({ where: scope });
  await database.syncRun.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.xeroTenant.deleteMany({ where: scope });
  await database.xeroConnection.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("sync-xero-people handler", () => {
  it("resolves registered event name correctly", () => {
    expect(getRegisteredSyncEventName("people")).toBe("sync-xero-people");
  });

  it("syncs AU employees successfully and is idempotent", async () => {
    await setupTenant(tenantA);

    const mockEmployees = [
      {
        employeeId: "11111111-1111-4111-8111-111111111111",
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        status: "ACTIVE",
        jobTitle: "Developer",
        startDate: "2026-01-01",
        employmentType: "EMPLOYEE",
        rawPayload: { employee: "data" },
      },
      {
        employeeId: "22222222-2222-4222-8222-222222222222",
        firstName: "Jane",
        lastName: "Smith",
        email: "",
        status: "ACTIVE",
        jobTitle: "Manager",
        startDate: null,
        employmentType: "CONTRACTOR",
        rawPayload: { employee: "data2" },
      },
    ];

    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        rawResponse: {},
        employees: mockEmployees,
      },
    });

    const input = {
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      triggerType: "manual" as const,
      xeroTenantId: tenantA.xeroTenantId,
    };

    // Run 1
    const result1 = await syncXeroPeople(input);
    expect(result1.ok).toBe(true);
    if (result1.ok) {
      expect(result1.value.fetched).toBe(2);
      expect(result1.value.upserted).toBe(2);
      expect(result1.value.failed).toBe(0);
      expect(result1.value.status).toBe("succeeded");
    }

    // Assert DB state after Run 1
    const people1 = await database.person.findMany({
      where: { clerk_org_id: tenantA.clerkOrgId },
      orderBy: { first_name: "asc" },
    });
    expect(people1.length).toBe(2);
    expect(people1[0]).toMatchObject({
      first_name: "Jane",
      last_name: "Smith",
      email: "jane.smith@noemail.leavesync.app", // fallback email
      employment_type: "contractor",
      is_active: true,
    });
    expect(people1[1]).toMatchObject({
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
      employment_type: "employee",
      is_active: true,
    });

    // Run 2 (Idempotency check)
    const result2 = await syncXeroPeople(input);
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.value.fetched).toBe(2);
      expect(result2.value.upserted).toBe(2);
      expect(result2.value.failed).toBe(0);
      expect(result2.value.status).toBe("succeeded");
    }

    const people2 = await database.person.findMany({
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(people2.length).toBe(2); // no duplicates
  });

  it("enforces dual-tenant isolation during upsert", async () => {
    await setupTenant(tenantA);
    await setupTenant(tenantB);

    const mockEmployee = {
      employeeId: "11111111-1111-4111-8111-111111111111",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      status: "ACTIVE",
      jobTitle: "Developer",
      startDate: "2026-01-01",
      employmentType: "EMPLOYEE",
      rawPayload: { employee: "data" },
    };

    // Run for Tenant A
    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        rawResponse: {},
        employees: [mockEmployee],
      },
    });

    await syncXeroPeople({
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      triggerType: "manual" as const,
      xeroTenantId: tenantA.xeroTenantId,
    });

    // Run for Tenant B with same Employee ID
    await syncXeroPeople({
      clerkOrgId: tenantB.clerkOrgId,
      organisationId: tenantB.organisationId,
      triggerType: "manual" as const,
      xeroTenantId: tenantB.xeroTenantId,
    });

    const peopleA = await database.person.findMany({
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    const peopleB = await database.person.findMany({
      where: { clerk_org_id: tenantB.clerkOrgId },
    });

    expect(peopleA.length).toBe(1);
    expect(peopleB.length).toBe(1);
    expect(peopleA[0].clerk_org_id).toBe(tenantA.clerkOrgId);
    expect(peopleB[0].clerk_org_id).toBe(tenantB.clerkOrgId);
    expect(peopleA[0].organisation_id).toBe(tenantA.organisationId);
    expect(peopleB[0].organisation_id).toBe(tenantB.organisationId);
  });

  it("handles record-level failures without failing the entire run", async () => {
    await setupTenant(tenantA);

    const mockEmployees = [
      {
        // Valid employee
        employeeId: "11111111-1111-4111-8111-111111111111",
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        status: "ACTIVE",
        jobTitle: "Developer",
        startDate: "2026-01-01",
        employmentType: "EMPLOYEE",
        rawPayload: { employee: "data1" },
      },
      {
        // Invalid employee (missing last name)
        employeeId: "22222222-2222-4222-8222-222222222222",
        firstName: "Jane",
        lastName: "",
        email: "jane@example.com",
        status: "ACTIVE",
        jobTitle: "Developer",
        startDate: "2026-01-01",
        employmentType: "EMPLOYEE",
        rawPayload: { employee: "bad-data" },
      },
    ];

    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        rawResponse: {},
        employees: mockEmployees,
      },
    });

    const result = await syncXeroPeople({
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      triggerType: "manual" as const,
      xeroTenantId: tenantA.xeroTenantId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fetched).toBe(2);
      expect(result.value.upserted).toBe(1);
      expect(result.value.failed).toBe(1);
      expect(result.value.status).toBe("partial_success");
    }

    // Verify valid employee synced
    const people = await database.person.findMany({
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(people.length).toBe(1);
    expect(people[0].first_name).toBe("John");

    // Verify failed record logged in database
    const failedRecords = await database.failedRecord.findMany({
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(failedRecords.length).toBe(1);
    expect(failedRecords[0]).toMatchObject({
      entity_type: "people",
      record_type: "people",
      source_id: "22222222-2222-4222-8222-222222222222",
      error_code: "validation_error",
      error_message: "Last name is required",
    });
  });

  it("handles NZ/UK region stubbing without failing the run", async () => {
    await setupTenant(tenantA);
    // Update tenant to NZ
    await database.xeroTenant.update({
      where: { id: tenantA.xeroTenantId },
      data: { payroll_region: "NZ" },
    });

    const result = await syncXeroPeople({
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      triggerType: "manual" as const,
      xeroTenantId: tenantA.xeroTenantId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
      expect(result.value.fetched).toBe(0);
      expect(result.value.upserted).toBe(0);
    }

    const run = await database.syncRun.findFirst({
      where: { clerk_org_id: tenantA.clerkOrgId, id: result.value?.runId },
    });
    expect(run).toBeDefined();
    expect(run?.status).toBe("succeeded");
    expect(run?.error_summary).toContain(
      "NZ payroll employee reads are not yet available."
    );
  });
});
