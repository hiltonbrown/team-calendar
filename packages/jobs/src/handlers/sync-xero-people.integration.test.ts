import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { database } from "@repo/database";
import { getRegisteredSyncEventName } from "../events";
import { syncXeroPeople } from "./sync-xero-people";

const fixture = allocateLiveTestFixture(
  "packages/jobs/src/handlers/sync-xero-people.integration.test.ts"
);

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
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
  organisationId: fixture.tenants[0]?.organisationId as string,
  xeroConnectionId: fixture.id("connection", 0),
  xeroTenantId: fixture.id("tenant", 0),
} as const;

const tenantB = {
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
  organisationId: fixture.tenants[1]?.organisationId as string,
  xeroConnectionId: fixture.id("connection", 1),
  xeroTenantId: fixture.id("tenant", 1),
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;

async function setupTenant(tenant: typeof tenantA) {
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
      expires_at: new Date(Date.now() + 3_600_000), // 1 hour in future
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
      xero_tenant_id: "xero-tenant-uuid",
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
        email: "john.doe@example.com",
        employeeId: "11111111-1111-4111-8111-111111111111",
        employmentType: "EMPLOYEE",
        firstName: "John",
        jobTitle: "Developer",
        lastName: "Doe",
        rawPayload: { employee: "data" },
        startDate: "2026-01-01",
        status: "ACTIVE",
      },
      {
        email: "",
        employeeId: "22222222-2222-4222-8222-222222222222",
        employmentType: "CONTRACTOR",
        firstName: "Jane",
        jobTitle: "Manager",
        lastName: "Smith",
        rawPayload: { employee: "data2" },
        startDate: null,
        status: "ACTIVE",
      },
    ];

    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        employees: mockEmployees,
        failures: [],
        rawItemCount: mockEmployees.length,
        rawResponse: {},
        seenEmployeeIds: mockEmployees.map((e) => e.employeeId),
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
      orderBy: { first_name: "asc" },
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(people1.length).toBe(2);
    expect(people1[0]).toMatchObject({
      clerk_user_id: null,
      email: "jane.smith@noemail.teamcalendar.online", // fallback email
      employment_type: "contractor",
      first_name: "Jane",
      is_active: true,
      last_name: "Smith",
      person_type: "contractor",
    });
    expect(people1[1]).toMatchObject({
      clerk_user_id: null,
      email: "john.doe@example.com",
      employment_type: "employee",
      first_name: "John",
      is_active: true,
      last_name: "Doe",
      person_type: "employee",
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
      orderBy: { first_name: "asc" },
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(people2.length).toBe(2); // no duplicates
    expect(people2[0].person_type).toBe("contractor");
    expect(people2[1].person_type).toBe("employee");

    // Run 3 (Update check - employment type changed in Xero)
    const updatedEmployees = [
      {
        ...mockEmployees[0],
        employmentType: "EMPLOYEE",
      },
      {
        ...mockEmployees[1],
        employmentType: "EMPLOYEE",
      },
    ];
    mockFetchEmployeesForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: updatedEmployees,
        failures: [],
        rawItemCount: updatedEmployees.length,
        rawResponse: {},
        seenEmployeeIds: updatedEmployees.map((e) => e.employeeId),
      },
    });

    const result3 = await syncXeroPeople(input);
    expect(result3.ok).toBe(true);
    if (result3.ok) {
      expect(result3.value.upserted).toBe(2);
      expect(result3.value.status).toBe("succeeded");
    }

    const people3 = await database.person.findMany({
      orderBy: { first_name: "asc" },
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(people3.length).toBe(2);
    expect(people3[0]).toMatchObject({
      employment_type: "employee",
      first_name: "Jane",
      person_type: "employee",
    });
    expect(people3[1]).toMatchObject({
      employment_type: "employee",
      first_name: "John",
      person_type: "employee",
    });

    const tenantRow = await database.xeroTenant.findFirst({
      where: { id: tenantA.xeroTenantId },
    });
    expect(tenantRow?.last_people_sync_at).toBeDefined();
    expect(tenantRow?.last_people_sync_at).not.toBeNull();
  });

  it("enforces dual-tenant isolation during upsert", async () => {
    await setupTenant(tenantA);
    await setupTenant(tenantB);

    const mockEmployee = {
      email: "john.doe@example.com",
      employeeId: "11111111-1111-4111-8111-111111111111",
      employmentType: "EMPLOYEE",
      firstName: "John",
      jobTitle: "Developer",
      lastName: "Doe",
      rawPayload: { employee: "data" },
      startDate: "2026-01-01",
      status: "ACTIVE",
    };

    // Run for Tenant A
    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        employees: [mockEmployee],
        failures: [],
        rawItemCount: 1,
        rawResponse: {},
        seenEmployeeIds: [mockEmployee.employeeId],
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
        email: "john.doe@example.com",
        // Valid employee
        employeeId: "11111111-1111-4111-8111-111111111111",
        employmentType: "EMPLOYEE",
        firstName: "John",
        jobTitle: "Developer",
        lastName: "Doe",
        rawPayload: { employee: "data1" },
        startDate: "2026-01-01",
        status: "ACTIVE",
      },
      {
        email: "jane@example.com",
        // Invalid employee (missing last name)
        employeeId: "22222222-2222-4222-8222-222222222222",
        employmentType: "EMPLOYEE",
        firstName: "Jane",
        jobTitle: "Developer",
        lastName: "",
        rawPayload: { employee: "bad-data" },
        startDate: "2026-01-01",
        status: "ACTIVE",
      },
    ];

    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        employees: mockEmployees,
        failures: [],
        rawItemCount: mockEmployees.length,
        rawResponse: {},
        seenEmployeeIds: mockEmployees.map((e) => e.employeeId),
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
      error_code: "validation_error",
      error_message: "Last name is required",
      record_type: "people",
      source_id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("records Xero page mapping failures separately from handler validation failures", async () => {
    await setupTenant(tenantA);

    const validEmployee = {
      email: "john.doe@example.com",
      employeeId: "11111111-1111-4111-8111-111111111111",
      employmentType: "EMPLOYEE",
      firstName: "John",
      jobTitle: "Developer",
      lastName: "Doe",
      rawPayload: { employee: "data1" },
      startDate: "2026-01-01",
      status: "ACTIVE",
    };

    // fetchEmployeesForRegion already isolated a malformed page record into
    // `failures` before it ever became an XeroEmployee, distinct from the
    // handler's own validateEmployee failures (covered by the previous
    // test) and from persistence (db_error) failures.
    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        employees: [validEmployee],
        failures: [
          {
            index: 1,
            rawEmployeeId: null,
            rawPayload: { Broken: true },
            reason: "Missing Employee ID",
          },
        ],
        rawItemCount: 2,
        rawResponse: {},
        seenEmployeeIds: [validEmployee.employeeId],
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
      // fetched reflects the raw item count Xero returned, including the
      // record that could not be mapped.
      expect(result.value.fetched).toBe(2);
      expect(result.value.upserted).toBe(1);
      expect(result.value.failed).toBe(1);
      expect(result.value.status).toBe("partial_success");
    }

    const failedRecords = await database.failedRecord.findMany({
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(failedRecords).toHaveLength(1);
    expect(failedRecords[0]).toMatchObject({
      error_code: "mapping_error",
      error_message: "Missing Employee ID",
      source_id: "unknown",
    });
  });

  it("reuses the same Person and clears archived_at when a previously archived EmployeeID returns from Xero", async () => {
    await setupTenant(tenantA);

    const employeeId = "11111111-1111-4111-8111-111111111111";
    const archived = await database.person.create({
      data: {
        archived_at: new Date("2026-01-01T00:00:00.000Z"),
        clerk_org_id: tenantA.clerkOrgId,
        display_name: "John Doe",
        email: "john.doe@example.com",
        employment_type: "employee",
        first_name: "John",
        is_active: false,
        last_name: "Doe",
        organisation_id: tenantA.organisationId,
        person_type: "employee",
        source_person_key: employeeId,
        source_system: "XERO",
      },
    });

    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        employees: [
          {
            email: "john.doe@example.com",
            employeeId,
            employmentType: "EMPLOYEE",
            firstName: "John",
            jobTitle: "Developer",
            lastName: "Doe",
            rawPayload: { employee: "data" },
            startDate: "2026-01-01",
            status: "ACTIVE",
          },
        ],
        failures: [],
        rawItemCount: 1,
        rawResponse: {},
        seenEmployeeIds: [employeeId],
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
      expect(result.value.upserted).toBe(1);
      expect(result.value.failed).toBe(0);
      expect(result.value.status).toBe("succeeded");
    }

    const people = await database.person.findMany({
      where: { clerk_org_id: tenantA.clerkOrgId },
    });
    expect(people).toHaveLength(1);
    expect(people[0].id).toBe(archived.id);
    expect(people[0].archived_at).toBeNull();
    expect(people[0].is_active).toBe(true);
  });

  it("maps active, inactive, and terminated employees independently from archival state, and leaves a manual same-email person untouched", async () => {
    await setupTenant(tenantA);

    const manualPerson = await database.person.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        display_name: "Manual Person",
        email: "shared@example.com",
        employment_type: "employee",
        first_name: "Manual",
        is_active: true,
        last_name: "Person",
        organisation_id: tenantA.organisationId,
        person_type: "employee",
        source_system: "MANUAL",
      },
    });

    const activeId = "11111111-1111-4111-8111-111111111111";
    const inactiveId = "22222222-2222-4222-8222-222222222222";
    const terminatedId = "33333333-3333-4333-8333-333333333333";

    const mockEmployees = [
      {
        email: "shared@example.com",
        employeeId: activeId,
        employmentType: "EMPLOYEE",
        firstName: "Active",
        jobTitle: "Developer",
        lastName: "Person",
        rawPayload: { employee: "active" },
        startDate: "2026-01-01",
        status: "ACTIVE",
      },
      {
        email: "inactive@example.com",
        employeeId: inactiveId,
        employmentType: "EMPLOYEE",
        firstName: "Inactive",
        jobTitle: "Developer",
        lastName: "Person",
        rawPayload: { employee: "inactive" },
        startDate: "2026-01-01",
        status: "INACTIVE",
      },
      {
        email: "terminated@example.com",
        employeeId: terminatedId,
        employmentType: "EMPLOYEE",
        firstName: "Terminated",
        jobTitle: "Developer",
        lastName: "Person",
        rawPayload: { employee: "terminated" },
        startDate: "2026-01-01",
        status: "TERMINATED",
      },
    ];

    mockFetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        employees: mockEmployees,
        failures: [],
        rawItemCount: mockEmployees.length,
        rawResponse: {},
        seenEmployeeIds: mockEmployees.map((e) => e.employeeId),
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
      expect(result.value.upserted).toBe(3);
      expect(result.value.failed).toBe(0);
      expect(result.value.status).toBe("succeeded");
    }

    const xeroPeople = await database.person.findMany({
      orderBy: { first_name: "asc" },
      where: { clerk_org_id: tenantA.clerkOrgId, source_system: "XERO" },
    });
    expect(xeroPeople).toHaveLength(3);
    expect(
      xeroPeople.find((p) => p.source_person_key === activeId)
    ).toMatchObject({
      archived_at: null,
      is_active: true,
      person_type: "employee",
    });
    expect(
      xeroPeople.find((p) => p.source_person_key === inactiveId)
    ).toMatchObject({
      archived_at: null,
      is_active: false,
      person_type: "employee",
    });
    expect(
      xeroPeople.find((p) => p.source_person_key === terminatedId)
    ).toMatchObject({
      archived_at: null,
      is_active: false,
      person_type: "employee",
    });

    // The manual person sharing an email must remain untouched: same row,
    // still MANUAL, still active, unaffected by the Xero-sourced import.
    const manualAfter = await database.person.findFirst({
      where: { id: manualPerson.id },
    });
    expect(manualAfter).toMatchObject({
      archived_at: null,
      first_name: "Manual",
      is_active: true,
      person_type: "employee",
      source_system: "MANUAL",
    });
  });

  it("syncs NZ and UK regional employees through their respective adapters", async () => {
    await setupTenant(tenantA);
    // Update tenant to NZ
    await database.xeroTenant.update({
      data: { payroll_region: "NZ" },
      where: { id: tenantA.xeroTenantId },
    });

    mockFetchEmployeesForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [
          {
            email: "aroha@example.co.nz",
            employeeId: "11111111-1111-4111-8111-111111111111",
            employmentType: "Employee",
            firstName: "Aroha",
            jobTitle: "Software Engineer",
            lastName: "Tane",
            rawPayload: { employeeID: "11111111-1111-4111-8111-111111111111" },
            startDate: "2026-01-15",
            status: "Active",
          },
        ],
        failures: [],
        rawItemCount: 1,
        rawResponse: {},
        seenEmployeeIds: ["11111111-1111-4111-8111-111111111111"],
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
      expect(result.value.status).toBe("succeeded");
      expect(result.value.fetched).toBe(1);
      expect(result.value.upserted).toBe(1);
    }

    expect(mockFetchEmployeesForRegion).toHaveBeenCalledWith(
      "NZ",
      expect.objectContaining({
        xeroTenant: expect.objectContaining({ payroll_region: "NZ" }),
      })
    );

    const person = await database.person.findFirst({
      where: {
        clerk_org_id: tenantA.clerkOrgId,
        source_person_key: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(person).toBeDefined();
    expect(person?.first_name).toBe("Aroha");
    expect(person?.last_name).toBe("Tane");
    expect(person?.email).toBe("aroha@example.co.nz");
    expect(person?.is_active).toBe(true);
  });

  it("handles regional fetch errors by failing the sync run", async () => {
    await setupTenant(tenantA);
    await database.xeroTenant.update({
      data: { payroll_region: "UK" },
      where: { id: tenantA.xeroTenantId },
    });

    mockFetchEmployeesForRegion.mockResolvedValueOnce({
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
      },
      ok: false,
    });

    const result = await syncXeroPeople({
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      triggerType: "manual" as const,
      xeroTenantId: tenantA.xeroTenantId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
      expect(result.value.fetched).toBe(0);
      expect(result.value.upserted).toBe(0);
    }

    const run = await database.syncRun.findFirst({
      where: { clerk_org_id: tenantA.clerkOrgId, id: result.value.runId },
    });
    expect(run?.status).toBe("failed");
    expect(run?.error_summary).toBeDefined();
  });

  describe("absence confirmation and archival lifecycle (Plan 098)", () => {
    interface TestPerson {
      email: string;
      first_name: string;
      id: string;
      last_name: string;
      source_person_key: string;
      xero_employee_id: string;
    }

    function atIndex<T>(items: T[], index: number): T {
      const item = items[index];
      if (!item) {
        throw new Error(`Item at index ${index} not found`);
      }
      return item;
    }

    async function createXeroPeople(
      tenant: typeof tenantA,
      count: number,
      overrides?: (index: number) => Record<string, unknown>
    ): Promise<TestPerson[]> {
      const people: TestPerson[] = [];
      for (let i = 0; i < count; i += 1) {
        const hex = (i + 1).toString().padStart(4, "0");
        const employeeId = `11111111-1111-4111-8111-11111111${hex}`;
        const person = await database.person.create({
          data: {
            clerk_org_id: tenant.clerkOrgId,
            display_name: `Employee ${i + 1}`,
            email: `emp${i + 1}@example.com`,
            employment_type: "employee",
            first_name: `Emp${i + 1}`,
            is_active: true,
            last_name: "Test",
            organisation_id: tenant.organisationId,
            person_type: "employee",
            source_person_key: employeeId,
            source_system: "XERO",
            xero_employee_id: employeeId,
            ...(overrides ? overrides(i) : {}),
          },
        });
        people.push({
          email: person.email,
          first_name: person.first_name,
          id: person.id,
          last_name: person.last_name,
          source_person_key: employeeId,
          xero_employee_id: employeeId,
        });
      }
      return people;
    }

    it("first complete missing observation marks xero_missing_since but archives nobody", async () => {
      await setupTenant(tenantA);
      const people = await createXeroPeople(tenantA, 10);

      // Return 9 out of 10 employees (person 10 is missing: 1/10 = 10% < 20%, count = 1 <= 5)
      const returnedEmployees = people.slice(0, 9).map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 9,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("succeeded");
      }

      const person9 = atIndex(people, 9);
      const person0 = atIndex(people, 0);

      const missingPerson = await database.person.findFirst({
        where: { id: person9.id },
      });
      expect(missingPerson).toBeDefined();
      expect(missingPerson?.xero_missing_since).not.toBeNull();
      expect(missingPerson?.archived_at).toBeNull();
      expect(missingPerson?.is_active).toBe(true);

      const activeReturned = await database.person.findFirst({
        where: { id: person0.id },
      });
      expect(activeReturned?.xero_missing_since).toBeNull();
      expect(activeReturned?.archived_at).toBeNull();
    });

    it("leaves missing person unarchived when missing age is under 24 hours (23h 59m)", async () => {
      await setupTenant(tenantA);
      const missingSince = new Date(Date.now() - (23 * 3600 + 59 * 60) * 1000);
      const people = await createXeroPeople(tenantA, 10, (i) =>
        i === 9 ? { xero_missing_since: missingSince } : {}
      );

      const returnedEmployees = people.slice(0, 9).map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 9,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("succeeded");
      }

      const person9 = atIndex(people, 9);
      const missingPerson = await database.person.findFirst({
        where: { id: person9.id },
      });
      expect(missingPerson?.archived_at).toBeNull();
      expect(missingPerson?.is_active).toBe(true);
      expect(missingPerson?.xero_missing_since).toEqual(missingSince);
    });

    it("archives missing person only after at least 24 continuous hours of absence (24h 01m)", async () => {
      await setupTenant(tenantA);
      const missingSince = new Date(Date.now() - (24 * 3600 + 60) * 1000);
      const people = await createXeroPeople(tenantA, 10, (i) =>
        i === 9
          ? {
              clerk_user_id: "user_test_missing_123",
              xero_missing_since: missingSince,
            }
          : {}
      );

      const returnedEmployees = people.slice(0, 9).map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 9,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("succeeded");
      }

      const person9 = atIndex(people, 9);
      const missingPerson = await database.person.findFirst({
        where: { id: person9.id },
      });
      expect(missingPerson?.archived_at).not.toBeNull();
      expect(missingPerson?.is_active).toBe(false);
      // Preserves clerk_user_id, source keys, and identity
      expect(missingPerson?.clerk_user_id).toBe("user_test_missing_123");
      expect(missingPerson?.source_person_key).toBe(person9.source_person_key);
      expect(missingPerson?.xero_employee_id).toBe(person9.xero_employee_id);
    });

    it("returned employee clears missing marker before record validation", async () => {
      await setupTenant(tenantA);
      const missingSince = new Date(Date.now() - 10 * 3600 * 1000);
      const people = await createXeroPeople(tenantA, 5, (i) =>
        i === 0 ? { xero_missing_since: missingSince } : {}
      );

      const returnedEmployees = people.map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 5,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      const person0 = atIndex(people, 0);
      const restored = await database.person.findFirst({
        where: { id: person0.id },
      });
      expect(restored?.xero_missing_since).toBeNull();
      expect(restored?.archived_at).toBeNull();
    });

    it("reappearance after archival reactivates person and clears both archived_at and xero_missing_since", async () => {
      await setupTenant(tenantA);
      const archivedPerson = await database.person.create({
        data: {
          archived_at: new Date(Date.now() - 48 * 3600 * 1000),
          clerk_org_id: tenantA.clerkOrgId,
          clerk_user_id: "user_reactivate_123",
          display_name: "Archived Person",
          email: "archived@example.com",
          employment_type: "employee",
          first_name: "Archived",
          is_active: false,
          last_name: "Person",
          organisation_id: tenantA.organisationId,
          person_type: "employee",
          source_person_key: "11111111-1111-4111-8111-111111119999",
          source_system: "XERO",
          xero_employee_id: "11111111-1111-4111-8111-111111119999",
          xero_missing_since: new Date(Date.now() - 72 * 3600 * 1000),
        },
      });

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: [
            {
              email: "archived@example.com",
              employeeId: "11111111-1111-4111-8111-111111119999",
              employmentType: "EMPLOYEE",
              firstName: "Archived",
              jobTitle: "Senior Developer",
              lastName: "Person",
              rawPayload: { id: "11111111-1111-4111-8111-111111119999" },
              startDate: "2026-01-01",
              status: "ACTIVE",
            },
          ],
          failures: [],
          rawItemCount: 1,
          rawResponse: {},
          seenEmployeeIds: ["11111111-1111-4111-8111-111111119999"],
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      const reactivated = await database.person.findFirst({
        where: { id: archivedPerson.id },
      });
      expect(reactivated?.id).toBe(archivedPerson.id);
      expect(reactivated?.archived_at).toBeNull();
      expect(reactivated?.xero_missing_since).toBeNull();
      expect(reactivated?.is_active).toBe(true);
      expect(reactivated?.clerk_user_id).toBe("user_reactivate_123");
    });

    it("blocks entire absence pass when snapshot is empty (guard: empty snapshot)", async () => {
      await setupTenant(tenantA);
      await createXeroPeople(tenantA, 10);

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: [],
          failures: [],
          rawItemCount: 0,
          rawResponse: {},
          seenEmployeeIds: [],
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("partial_success");
      }

      const run = await database.syncRun.findFirst({
        where: { id: result.ok ? result.value.runId : "" },
      });
      expect(run?.status).toBe("partial_success");
      expect(run?.error_summary).toBe(
        "Missing person guard threshold exceeded"
      );

      // Verify no people were marked or archived
      const dbPeople = await database.person.findMany({
        where: { clerk_org_id: tenantA.clerkOrgId },
      });
      for (const p of dbPeople) {
        expect(p.xero_missing_since).toBeNull();
        expect(p.archived_at).toBeNull();
        expect(p.is_active).toBe(true);
      }
    });

    it("blocks entire absence pass when exactly 20% of people are missing (guard: >= 20%)", async () => {
      await setupTenant(tenantA);
      // 5 people in DB, 1 missing -> 1/5 = exactly 20%
      const people = await createXeroPeople(tenantA, 5);

      const returnedEmployees = people.slice(0, 4).map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 4,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("partial_success");
      }

      const person4 = atIndex(people, 4);
      const missingPerson = await database.person.findFirst({
        where: { id: person4.id },
      });
      expect(missingPerson?.xero_missing_since).toBeNull();
      expect(missingPerson?.archived_at).toBeNull();
    });

    it("blocks entire absence pass for one-of-two missing employees (50% >= 20%)", async () => {
      await setupTenant(tenantA);
      const people = await createXeroPeople(tenantA, 2);
      const person0 = atIndex(people, 0);
      const person1 = atIndex(people, 1);

      const returnedEmployees = [
        {
          email: person0.email,
          employeeId: person0.source_person_key,
          employmentType: "EMPLOYEE",
          firstName: person0.first_name,
          jobTitle: "Developer",
          lastName: person0.last_name,
          rawPayload: { id: person0.source_person_key },
          startDate: "2026-01-01",
          status: "ACTIVE",
        },
      ];

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 1,
          rawResponse: {},
          seenEmployeeIds: [person0.source_person_key],
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("partial_success");
      }

      const missingPerson = await database.person.findFirst({
        where: { id: person1.id },
      });
      expect(missingPerson?.xero_missing_since).toBeNull();
      expect(missingPerson?.archived_at).toBeNull();
    });

    it("allows absence pass when missing ratio is below 20% and count is <= 5 (e.g. 5 of 35 = 14.3%)", async () => {
      await setupTenant(tenantA);
      const people = await createXeroPeople(tenantA, 35);

      // Return 30 of 35 (5 missing = 5/35 = 14.28% < 20%, count = 5 <= 5)
      const returnedEmployees = people.slice(0, 30).map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 30,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("succeeded");
      }

      const missingPeople = await database.person.findMany({
        where: {
          id: { in: people.slice(30, 35).map((p) => p.id) },
        },
      });
      expect(missingPeople).toHaveLength(5);
      for (const p of missingPeople) {
        expect(p.xero_missing_since).not.toBeNull();
        expect(p.archived_at).toBeNull();
      }
    });

    it("blocks entire absence pass when missing count is greater than 5 (e.g. 6 of 35 = 17.1% < 20%, but count = 6 > 5)", async () => {
      await setupTenant(tenantA);
      const people = await createXeroPeople(tenantA, 35);

      // Return 29 of 35 (6 missing = 6/35 = 17.14% < 20%, but count = 6 > 5)
      const returnedEmployees = people.slice(0, 29).map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 29,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("partial_success");
      }

      const missingPeople = await database.person.findMany({
        where: {
          id: { in: people.slice(29, 35).map((p) => p.id) },
        },
      });
      for (const p of missingPeople) {
        expect(p.xero_missing_since).toBeNull();
        expect(p.archived_at).toBeNull();
      }
    });

    it("does not run absence pass on incomplete/truncated, failed, or cancelled reads", async () => {
      await setupTenant(tenantA);
      const people = await createXeroPeople(tenantA, 10);

      // Case 1: Incomplete snapshot (complete: false)
      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: false,
          employees: people.slice(0, 5).map((p) => ({
            email: p.email,
            employeeId: p.source_person_key,
            employmentType: "EMPLOYEE",
            firstName: p.first_name,
            jobTitle: "Developer",
            lastName: p.last_name,
            rawPayload: { id: p.source_person_key },
            startDate: "2026-01-01",
            status: "ACTIVE",
          })),
          failures: [],
          rawItemCount: 5,
          rawResponse: {},
          seenEmployeeIds: people.slice(0, 5).map((p) => p.source_person_key),
        },
      });

      const resultIncomplete = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(resultIncomplete.ok).toBe(true);
      // Missing candidates 5-9 must NOT be marked because snapshot was incomplete
      const peopleAfterIncomplete = await database.person.findMany({
        where: { clerk_org_id: tenantA.clerkOrgId },
      });
      for (const p of peopleAfterIncomplete) {
        expect(p.xero_missing_since).toBeNull();
      }

      // Case 2: Failed fetch
      mockFetchEmployeesForRegion.mockResolvedValue({
        error: { code: "network_error", message: "Timeout" },
        ok: false,
      });

      const resultFailed = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });
      expect(resultFailed.ok).toBe(true);
      if (resultFailed.ok) {
        expect(resultFailed.value.status).toBe("failed");
      }
    });

    it("clears missing marker for returned EmployeeID even if record fails downstream validation", async () => {
      await setupTenant(tenantA);
      const missingSince = new Date(Date.now() - 10 * 3600 * 1000);
      const people = await createXeroPeople(tenantA, 10, (i) =>
        i === 0 ? { xero_missing_since: missingSince } : {}
      );

      // Person 0 has invalid first name (empty string) causing handler validation failure
      const returnedEmployees = people.map((p, i) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: i === 0 ? "" : p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 10,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.failed).toBe(1);
      }

      // Person 0 failed validation, but was in seenEmployeeIds -> xero_missing_since MUST be cleared
      const person0 = atIndex(people, 0);
      const foundPerson0 = await database.person.findFirst({
        where: { id: person0.id },
      });
      expect(foundPerson0?.xero_missing_since).toBeNull();
      expect(foundPerson0?.archived_at).toBeNull();
    });

    it("excludes manual people from absence calculation and never marks or archives them", async () => {
      await setupTenant(tenantA);
      const manualPerson = await database.person.create({
        data: {
          clerk_org_id: tenantA.clerkOrgId,
          display_name: "Manual User",
          email: "manual@example.com",
          employment_type: "employee",
          first_name: "Manual",
          is_active: true,
          last_name: "User",
          organisation_id: tenantA.organisationId,
          person_type: "employee",
          source_system: "MANUAL",
        },
      });

      const people = await createXeroPeople(tenantA, 10);
      const returnedEmployees = people.map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      // Manual person is not returned by Xero
      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployees,
          failures: [],
          rawItemCount: 10,
          rawResponse: {},
          seenEmployeeIds: returnedEmployees.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("succeeded");
      }

      const manualAfter = await database.person.findFirst({
        where: { id: manualPerson.id },
      });
      expect(manualAfter?.xero_missing_since).toBeNull();
      expect(manualAfter?.archived_at).toBeNull();
      expect(manualAfter?.is_active).toBe(true);
    });

    it("enforces cross-tenant isolation during absence reconciliation", async () => {
      await setupTenant(tenantA);
      await setupTenant(tenantB);

      const peopleA = await createXeroPeople(tenantA, 10);
      await createXeroPeople(tenantB, 10);

      // Sync Tenant A: 1 person missing in Tenant A
      const returnedEmployeesA = peopleA.slice(0, 9).map((p) => ({
        email: p.email,
        employeeId: p.source_person_key,
        employmentType: "EMPLOYEE",
        firstName: p.first_name,
        jobTitle: "Developer",
        lastName: p.last_name,
        rawPayload: { id: p.source_person_key },
        startDate: "2026-01-01",
        status: "ACTIVE",
      }));

      mockFetchEmployeesForRegion.mockResolvedValue({
        ok: true,
        value: {
          complete: true,
          employees: returnedEmployeesA,
          failures: [],
          rawItemCount: 9,
          rawResponse: {},
          seenEmployeeIds: returnedEmployeesA.map((e) => e.employeeId),
        },
      });

      const result = await syncXeroPeople({
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        triggerType: "manual",
        xeroTenantId: tenantA.xeroTenantId,
      });

      expect(result.ok).toBe(true);

      // Tenant A missing person is marked
      const person9A = atIndex(peopleA, 9);
      const missingA = await database.person.findFirst({
        where: { id: person9A.id },
      });
      expect(missingA?.xero_missing_since).not.toBeNull();

      // Tenant B people are completely untouched
      const dbPeopleB = await database.person.findMany({
        where: { clerk_org_id: tenantB.clerkOrgId },
      });
      expect(dbPeopleB).toHaveLength(10);
      for (const p of dbPeopleB) {
        expect(p.xero_missing_since).toBeNull();
        expect(p.archived_at).toBeNull();
      }
    });
  });
});
