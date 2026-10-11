import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { encryptXeroToken } from "@repo/xero/src/crypto/tokens";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mockInngestSend = vi.hoisted(() =>
  vi.fn(async () => ({ ids: ["synthetic-people-event"] }))
);
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-people" })),
    send: mockInngestSend,
  },
}));
const beforePersonUpsert =
  vi.fn<
    (args: import("@repo/database").Prisma.PersonUpsertArgs) => Promise<void>
  >();
const afterPersonUpdateMany =
  vi.fn<
    (
      args: import("@repo/database").Prisma.PersonUpdateManyArgs,
      tx: import("@repo/database").Prisma.TransactionClient
    ) => Promise<void>
  >();
vi.mock("@repo/database", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/database")>();
  return {
    ...original,
    tenantTransaction: (clerkOrgId, operation, options) =>
      original.tenantTransaction(
        clerkOrgId,
        async (tx) =>
          operation(
            new Proxy(tx, {
              get(transaction, delegateName, transactionReceiver) {
                if (delegateName !== "person") {
                  return Reflect.get(
                    transaction,
                    delegateName,
                    transactionReceiver
                  );
                }
                return new Proxy(transaction.person, {
                  get(delegate, method, delegateReceiver) {
                    if (method === "updateMany") {
                      return async (
                        args: import("@repo/database").Prisma.PersonUpdateManyArgs
                      ) => {
                        const result = await delegate.updateMany(args);
                        await afterPersonUpdateMany(args, transaction);
                        return result;
                      };
                    }
                    if (method !== "upsert") {
                      return Reflect.get(delegate, method, delegateReceiver);
                    }
                    return async (
                      args: import("@repo/database").Prisma.PersonUpsertArgs
                    ) => {
                      await beforePersonUpsert(args);
                      return delegate.upsert(args);
                    };
                  },
                });
              },
            })
          ),
        options
      ),
  };
});

import { systemDatabase as database, type Person } from "@repo/database";
import { getRegisteredSyncEventName } from "../events";
import { initialXeroSync } from "./initial-xero-sync";
import { reconcileXeroApprovalState } from "./reconcile-xero-approval-state";
import { acquireSyncRun } from "./sync-run-lifecycle";
import { syncXeroLeaveBalances } from "./sync-xero-leave-balances";
import { syncXeroLeaveRecords } from "./sync-xero-leave-records";
import { syncXeroPeople } from "./sync-xero-people";

// Mock fetchEmployeesForRegion and toPlainLanguageMessage from @repo/xero
const mockFetchEmployeesForRegion = vi.fn();
vi.mock("@repo/xero", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/xero")>();
  return {
    ...original,
    fetchEmployeesForRegion: (...args: unknown[]) =>
      mockFetchEmployeesForRegion(...args),
  };
});
describe("local persistence integration", () => {
  const fixture = allocateLiveTestFixture(
    "packages/jobs/src/handlers/sync-xero-people.integration.test.ts"
  );
  const tenantA = {
    authorisationId: fixture.id("authorisation", 0),
    clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 0),
    organisationId: fixture.tenants[0]?.organisationId as string,
  } as const;
  const tenantB = {
    authorisationId: fixture.id("authorisation", 1),
    clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 1),
    organisationId: fixture.tenants[1]?.organisationId as string,
  } as const;
  const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId] as const;
  const testAuthorisationIds = [
    tenantA.authorisationId,
    tenantB.authorisationId,
  ];
  async function setupTenant(tenant: typeof tenantA) {
    await database.organisation.create({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        country_code: "AU",
        id: tenant.organisationId,
        name: `Test Org ${tenant.clerkOrgId}`,
      },
    });
    const access = encryptXeroToken("synthetic-access");
    const refresh = encryptXeroToken("synthetic-refresh");
    const now = new Date();
    const grant = {
      access_token_auth_tag: access.authTag,
      access_token_encrypted: access.encrypted,
      access_token_expires_at: new Date(now.getTime() + 3_600_000),
      access_token_iv: access.iv,
      granted_scopes: [
        "payroll.employees.read",
        "payroll.employees",
        "payroll.settings.read",
        "payroll.settings",
      ],
      last_refreshed_at: now,
      provider_app_id: process.env.XERO_CLIENT_ID ?? "test-xero-client-id",
      refresh_token_auth_tag: refresh.authTag,
      refresh_token_encrypted: refresh.encrypted,
      refresh_token_iv: refresh.iv,
      status: "active" as const,
      token_encrypted_at: now,
      token_key_version: access.keyVersion,
      xero_user_id: tenant.authorisationId,
    };
    await database.xeroAuthorisation.upsert({
      create: { id: tenant.authorisationId, ...grant },
      update: grant,
      where: { id: tenant.authorisationId },
    });
    const connection = {
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      payroll_region: "AU" as const,
      remote_connection_id: `remote-${tenant.connectionId}`,
      status: "active" as const,
      tenant_name: "Xero Tenant",
      xero_authorisation_id: tenant.authorisationId,
      xero_tenant_id: `xero-${tenant.connectionId}`,
    };
    await database.xeroConnection.upsert({
      create: { id: tenant.connectionId, ...connection },
      update: connection,
      where: { id: tenant.connectionId },
    });
  }
  async function cleanTestData() {
    const scope = { clerk_org_id: { in: [...testClerkOrgIds] } };
    await database.failedRecord.deleteMany({ where: scope });
    await database.syncRun.deleteMany({ where: scope });
    await database.xeroPersonMatch.deleteMany({ where: scope });
    await database.availabilityRecord.deleteMany({ where: scope });
    await database.person.deleteMany({ where: scope });
    await database.xeroSyncCursor.deleteMany({ where: scope });
    await database.xeroConnection.deleteMany({ where: scope });
    await database.xeroAuthorisation.deleteMany({
      where: { xero_user_id: { in: testAuthorisationIds } },
    });
    await database.organisation.deleteMany({ where: scope });
  }
  beforeEach(async () => {
    vi.clearAllMocks();
    beforePersonUpsert.mockReset();
    afterPersonUpdateMany.mockReset();
    await cleanTestData();
  });
  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });
  describe("sync-xero-people handler", () => {
    it.each([
      ["people", syncXeroPeople],
      ["leave balances", syncXeroLeaveBalances],
      ["leave records", syncXeroLeaveRecords],
      ["approval state", reconcileXeroApprovalState],
      ["initial import", initialXeroSync],
    ])(
      "%s ignores a forged account/company pair before creating any run or provider request",
      async (_name, sync) => {
        await setupTenant(tenantA);
        await setupTenant(tenantB);
        const before = await database.xeroConnection.findMany({
          orderBy: { id: "asc" },
          where: { clerk_org_id: { in: [...testClerkOrgIds] } },
        });
        const providerRequests = vi.spyOn(globalThis, "fetch");
        const result = await sync({
          ...tenantB,
          clerkOrgId: tenantA.clerkOrgId,
        });
        expect(result).toMatchObject({
          ok: true,
          value: { status: "ignored" },
        });
        expect(mockFetchEmployeesForRegion).not.toHaveBeenCalled();
        expect(providerRequests).not.toHaveBeenCalled();
        providerRequests.mockRestore();
        expect(
          await database.syncRun.count({
            where: { clerk_org_id: { in: [...testClerkOrgIds] } },
          })
        ).toBe(0);
        expect(
          await database.person.count({
            where: { clerk_org_id: { in: [...testClerkOrgIds] } },
          })
        ).toBe(0);
        expect(
          await database.xeroConnection.findMany({
            orderBy: { id: "asc" },
            where: { clerk_org_id: { in: [...testClerkOrgIds] } },
          })
        ).toEqual(before);
      }
    );
    it("ignores a released connection before creating a run", async () => {
      await setupTenant(tenantA);
      await database.xeroConnection.update({
        data: { released_at: new Date() },
        where: { id: tenantA.connectionId },
      });
      const result = await syncXeroPeople(tenantA);
      expect(result).toMatchObject({
        ok: true,
        value: { runId: null, status: "ignored" },
      });
      expect(mockFetchEmployeesForRegion).not.toHaveBeenCalled();
      expect(
        await database.syncRun.count({
          where: { clerk_org_id: tenantA.clerkOrgId },
        })
      ).toBe(0);
    });
    it("a failed company sync preserves its sibling's records and progress, and the sibling completes", async () => {
      await setupTenant(tenantA);
      const sibling = { ...tenantB, clerkOrgId: tenantA.clerkOrgId };
      await setupTenant(sibling);
      const watermark = new Date("2026-01-01T00:00:00Z");
      await database.xeroSyncCursor.create({
        data: {
          clerk_org_id: sibling.clerkOrgId,
          entity_type: "people",
          modified_since: watermark,
          organisation_id: sibling.organisationId,
          xero_connection_id: sibling.connectionId,
        },
      });
      await database.xeroConnection.update({
        data: {
          last_full_people_sync_at: watermark,
          last_people_sync_at: watermark,
        },
        where: { id: sibling.connectionId },
      });
      const person = await database.person.create({
        data: {
          clerk_org_id: sibling.clerkOrgId,
          email: "sibling@example.test",
          employment_type: "employee",
          first_name: "Sibling",
          last_name: "Employee",
          organisation_id: sibling.organisationId,
          source_person_key: fixture.id("sibling-employee", 0),
          source_system: "XERO",
          xero_employee_id: fixture.id("sibling-employee", 0),
        },
      });
      const connectionBefore = await database.xeroConnection.findUniqueOrThrow({
        where: { id: sibling.connectionId },
      });
      const record = await database.availabilityRecord.create({
        data: {
          approval_status: "approved",
          clerk_org_id: sibling.clerkOrgId,
          contactability: "unavailable",
          derived_uid_key: fixture.id("sibling-leave-uid", 0),
          ends_at: new Date("2026-10-02T00:00:00Z"),
          organisation_id: sibling.organisationId,
          person_id: person.id,
          privacy_mode: "named",
          record_type: "annual_leave",
          source_remote_id: fixture.id("sibling-leave", 0),
          source_type: "xero_leave",
          starts_at: new Date("2026-10-01T00:00:00Z"),
        },
      });
      mockFetchEmployeesForRegion.mockResolvedValueOnce({
        error: {
          code: "validation_error",
          message: "Malformed provider response",
        },
        ok: false,
      });
      expect(await syncXeroPeople(tenantA)).toMatchObject({
        ok: true,
        value: { status: "failed" },
      });
      expect(
        await database.person.findUnique({ where: { id: person.id } })
      ).toEqual(person);
      expect(
        await database.availabilityRecord.findUnique({
          where: { id: record.id },
        })
      ).toEqual(record);
      expect(
        await database.xeroConnection.findUnique({
          where: { id: sibling.connectionId },
        })
      ).toEqual(connectionBefore);
      expect(
        await database.xeroSyncCursor.findFirst({
          where: { xero_connection_id: sibling.connectionId },
        })
      ).toMatchObject({ modified_since: watermark });
      mockFetchEmployeesForRegion.mockResolvedValueOnce({
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
      expect(
        await syncXeroPeople({ ...sibling, mode: "incremental" })
      ).toMatchObject({ ok: true, value: { status: "succeeded" } });
      expect(
        await database.person.findUnique({ where: { id: person.id } })
      ).toEqual(person);
      const cursor = await database.xeroSyncCursor.findFirstOrThrow({
        where: { xero_connection_id: sibling.connectionId },
      });
      expect(cursor.modified_since?.getTime()).toBeGreaterThan(
        watermark.getTime()
      );
      expect(
        await database.availabilityRecord.findUnique({
          where: { id: record.id },
        })
      ).toEqual(record);
    });
    it("admits one concurrent same-connection run and preserves duplicate delivery", async () => {
      await setupTenant(tenantA);
      const context = {
        ...tenantA,
        triggerType: "manual" as const,
      };
      const outcomes = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          acquireSyncRun(
            {
              ...context,
              runId: fixture.id("concurrent-admission-run", index),
            },
            "people",
            new Date()
          )
        )
      );
      expect(
        outcomes.filter((outcome) => outcome.kind === "active")
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome.kind === "cancelled_competing")
      ).toHaveLength(11);
      const active = outcomes.find((outcome) => outcome.kind === "active");
      expect(active).toBeDefined();
      const runId = active?.run.id as string;
      expect(
        await acquireSyncRun({ ...context, runId }, "people", new Date())
      ).toEqual({
        kind: "active",
        run: { id: runId },
      });
      await database.syncRun.updateMany({
        data: { completed_at: new Date(), status: "succeeded" },
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: runId,
          organisation_id: tenantA.organisationId,
        },
      });
      expect(
        await acquireSyncRun({ ...context, runId }, "people", new Date())
      ).toMatchObject({
        kind: "terminal",
        run: { id: runId, status: "succeeded" },
      });
    });
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
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
      const tenantRow = await database.xeroConnection.findFirst({
        where: { id: tenantA.connectionId },
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
      });
      // Run for Tenant B with same Employee ID
      await syncXeroPeople({
        clerkOrgId: tenantB.clerkOrgId,
        connectionId: tenantB.connectionId,
        organisationId: tenantB.organisationId,
        triggerType: "manual" as const,
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
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
    it("maps active, inactive, and terminated employees and preserves ambiguous manual same-email people", async () => {
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
      const secondManualPerson = await database.person.create({
        data: {
          clerk_org_id: tenantA.clerkOrgId,
          email: "shared@example.com",
          employment_type: "employee",
          first_name: "Another",
          last_name: "Manual",
          organisation_id: tenantA.organisationId,
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
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
      // Ambiguous matches require review; neither manual row is automatically upgraded.
      const manualPeople = await database.person.findMany({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: { in: [manualPerson.id, secondManualPerson.id] },
          organisation_id: tenantA.organisationId,
        },
      });
      expect(manualPeople).toHaveLength(2);
      expect(manualPeople).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            archived_at: null,
            first_name: "Manual",
            id: manualPerson.id,
            is_active: true,
            source_system: "MANUAL",
          }),
          expect.objectContaining({
            archived_at: null,
            first_name: "Another",
            id: secondManualPerson.id,
            is_active: true,
            source_system: "MANUAL",
          }),
        ])
      );
      expect(
        await database.xeroPersonMatch.count({
          where: {
            clerk_org_id: tenantA.clerkOrgId,
            organisation_id: tenantA.organisationId,
            status: "pending",
          },
        })
      ).toBe(2);
    });
    it("syncs NZ and UK regional employees through their respective adapters", async () => {
      await setupTenant(tenantA);
      // Update tenant to NZ
      await database.xeroConnection.update({
        data: { payroll_region: "NZ" },
        where: { id: tenantA.connectionId },
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
              rawPayload: {
                employeeID: "11111111-1111-4111-8111-111111111111",
              },
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
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
          xeroConnection: expect.objectContaining({ payroll_region: "NZ" }),
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
      await database.xeroConnection.update({
        data: { payroll_region: "UK" },
        where: { id: tenantA.connectionId },
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
        connectionId: tenantA.connectionId,
        organisationId: tenantA.organisationId,
        triggerType: "manual" as const,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("failed");
        expect(result.value.fetched).toBe(0);
        expect(result.value.upserted).toBe(0);
      }
      if (!result.ok) {
        throw new Error("Expected a terminal failed run result.");
      }
      const run = await database.syncRun.findFirst({
        where: { clerk_org_id: tenantA.clerkOrgId, id: result.value.runId },
      });
      expect(run?.status).toBe("failed");
      expect(run?.error_summary).toBeDefined();
    });
    describe("complete full snapshot absence reconciliation", () => {
      function atIndex<T>(items: T[], index: number): T {
        const item = items[index];
        if (!item) {
          throw new Error(`Missing fixture item ${index}`);
        }
        return item;
      }
      async function createXeroPeople(tenant: typeof tenantA, count: number) {
        const people: Person[] = [];
        for (let index = 0; index < count; index += 1) {
          const employeeId = `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`;
          people.push(
            await database.person.create({
              data: {
                clerk_org_id: tenant.clerkOrgId,
                email: `employee${index}@example.test`,
                employment_type: "employee",
                first_name: "Employee",
                is_active: true,
                last_name: String(index),
                organisation_id: tenant.organisationId,
                source_person_key: employeeId,
                source_system: "XERO",
                xero_employee_id: employeeId,
              },
            })
          );
        }
        return people;
      }
      function snapshot(people: Awaited<ReturnType<typeof createXeroPeople>>) {
        return {
          complete: true,
          employees: people.map((person) => ({
            email: person.email,
            employeeId: person.source_person_key,
            employmentType: "EMPLOYEE",
            firstName: person.first_name,
            jobTitle: null,
            lastName: person.last_name,
            rawPayload: {},
            startDate: null,
            status: "ACTIVE",
          })),
          failures: [],
          rawItemCount: people.length,
          rawResponse: {},
          seenEmployeeIds: people.map((person) => person.source_person_key),
        };
      }
      async function personState(id: string) {
        return await database.person.findUniqueOrThrow({
          select: { archived_at: true, is_active: true },
          where: { id },
        });
      }
      async function seedCursor() {
        const modifiedSince = new Date("2026-01-01T00:00:00Z");
        await database.xeroSyncCursor.create({
          data: {
            clerk_org_id: tenantA.clerkOrgId,
            entity_type: "people",
            modified_since: modifiedSince,
            organisation_id: tenantA.organisationId,
            xero_connection_id: tenantA.connectionId,
          },
        });
        return modifiedSince;
      }
      async function currentCursor() {
        return await database.xeroSyncCursor.findFirstOrThrow({
          where: {
            clerk_org_id: tenantA.clerkOrgId,
            entity_type: "people",
            organisation_id: tenantA.organisationId,
            xero_connection_id: tenantA.connectionId,
          },
        });
      }
      it("archives the last Xero person on a complete empty full read while preserving manual and foreign people", async () => {
        await setupTenant(tenantA);
        await setupTenant(tenantB);
        const missing = atIndex(await createXeroPeople(tenantA, 1), 0);
        const foreign = atIndex(await createXeroPeople(tenantB, 1), 0);
        const siblingTenant = {
          ...tenantA,
          organisationId: fixture.id("organisation", 2),
        };
        await database.organisation.create({
          data: {
            clerk_org_id: tenantA.clerkOrgId,
            country_code: "AU",
            id: siblingTenant.organisationId,
            name: "Other payroll under same Clerk organisation",
          },
        });
        const sibling = atIndex(await createXeroPeople(siblingTenant, 1), 0);
        const manual = await database.person.create({
          data: {
            clerk_org_id: tenantA.clerkOrgId,
            email: "manual@example.test",
            employment_type: "employee",
            first_name: "Manual",
            last_name: "Person",
            organisation_id: tenantA.organisationId,
            source_system: "MANUAL",
          },
        });
        const before = await seedCursor();
        const startedBefore = new Date();
        mockFetchEmployeesForRegion.mockResolvedValueOnce({
          ok: true,
          value: snapshot([]),
        });
        const result = await syncXeroPeople({ ...tenantA, mode: "full" });
        expect(result).toMatchObject({
          ok: true,
          value: { failed: 0, fetched: 0, status: "succeeded" },
        });
        expect(await personState(missing.id)).toEqual({
          archived_at: expect.any(Date),
          is_active: false,
        });
        for (const person of [manual, foreign, sibling]) {
          expect(await personState(person.id)).toEqual({
            archived_at: null,
            is_active: true,
          });
        }
        const cursor = await currentCursor();
        expect(cursor.modified_since?.getTime()).toBeGreaterThan(
          before.getTime()
        );
        expect(cursor.modified_since?.getTime()).toBeGreaterThanOrEqual(
          startedBefore.getTime()
        );
        const connection = await database.xeroConnection.findUniqueOrThrow({
          where: { id: tenantA.connectionId },
        });
        expect(connection.last_full_people_sync_at).toEqual(
          cursor.modified_since
        );
        expect(connection.people_stale_since).toBeNull();
      });
      it.each([
        [10, 1],
        [5, 1],
        [2, 1],
        [35, 6],
      ])(
        "immediately archives %i-person roster with %i absent after a complete full read",
        async (total, absent) => {
          await setupTenant(tenantA);
          const people = await createXeroPeople(tenantA, total);
          const returned = people.slice(0, total - absent);
          mockFetchEmployeesForRegion.mockResolvedValueOnce({
            ok: true,
            value: snapshot(returned),
          });
          const result = await syncXeroPeople({ ...tenantA, mode: "full" });
          expect(result).toMatchObject({
            ok: true,
            value: { status: "succeeded", upserted: returned.length },
          });
          for (const person of people.slice(total - absent)) {
            expect(await personState(person.id)).toEqual({
              archived_at: expect.any(Date),
              is_active: false,
            });
          }
          for (const person of returned) {
            expect(await personState(person.id)).toEqual({
              archived_at: null,
              is_active: true,
            });
          }
        }
      );
      it("rolls back archival and cursor advancement when final persistence fails", async () => {
        await setupTenant(tenantA);
        const missing = atIndex(await createXeroPeople(tenantA, 1), 0);
        const before = await seedCursor();
        afterPersonUpdateMany.mockImplementationOnce(async (_args, tx) => {
          // Real PostgreSQL failure after the archive update and cursor CAS.
          await tx.$executeRaw`SELECT 1 / 0`;
        });
        mockFetchEmployeesForRegion.mockResolvedValueOnce({
          ok: true,
          value: snapshot([]),
        });
        const result = await syncXeroPeople({ ...tenantA, mode: "full" });
        expect(result).toMatchObject({
          error: { code: "unknown_error" },
          ok: false,
        });
        expect(await personState(missing.id)).toEqual({
          archived_at: null,
          is_active: true,
        });
        expect((await currentCursor()).modified_since).toEqual(before);
        const run = await database.syncRun.findFirstOrThrow({
          where: {
            clerk_org_id: tenantA.clerkOrgId,
            organisation_id: tenantA.organisationId,
          },
        });
        expect(run.status).toBe("failed");
      });
      it("does not archive a complete full response whose captured cursor has been fenced", async () => {
        await setupTenant(tenantA);
        const missing = atIndex(await createXeroPeople(tenantA, 1), 0);
        await seedCursor();
        const newerWatermark = new Date("2026-02-01T00:00:00Z");
        mockFetchEmployeesForRegion.mockImplementationOnce(async () => {
          await database.xeroSyncCursor.updateMany({
            data: { modified_since: newerWatermark },
            where: {
              clerk_org_id: tenantA.clerkOrgId,
              entity_type: "people",
              organisation_id: tenantA.organisationId,
              xero_connection_id: tenantA.connectionId,
            },
          });
          return { ok: true, value: snapshot([]) };
        });
        const result = await syncXeroPeople({ ...tenantA, mode: "full" });
        expect(result).toMatchObject({
          ok: true,
          value: { status: "cancelled" },
        });
        expect(await personState(missing.id)).toEqual({
          archived_at: null,
          is_active: true,
        });
        expect((await currentCursor()).modified_since).toEqual(newerWatermark);
        const connection = await database.xeroConnection.findUniqueOrThrow({
          where: { id: tenantA.connectionId },
        });
        expect(connection.last_full_people_sync_at).toBeNull();
      });
      it.each(["cancelled", "failed"] as const)(
        "preserves absent people and progress when the run becomes %s without a cancellation request",
        async (status) => {
          await setupTenant(tenantA);
          const missing = atIndex(await createXeroPeople(tenantA, 1), 0);
          const before = await seedCursor();
          mockFetchEmployeesForRegion.mockImplementationOnce(async () => {
            await database.syncRun.updateMany({
              data: { status },
              where: {
                clerk_org_id: tenantA.clerkOrgId,
                organisation_id: tenantA.organisationId,
                status: "running",
              },
            });
            return { ok: true, value: snapshot([]) };
          });
          const result = await syncXeroPeople({ ...tenantA, mode: "full" });
          expect(await personState(missing.id)).toEqual({
            archived_at: null,
            is_active: true,
          });
          expect((await currentCursor()).modified_since).toEqual(before);
          const connection = await database.xeroConnection.findUniqueOrThrow({
            where: { id: tenantA.connectionId },
          });
          expect(connection.last_full_people_sync_at).toBeNull();
          expect(connection.last_people_sync_at).toBeNull();
          const run = await database.syncRun.findFirstOrThrow({
            where: {
              clerk_org_id: tenantA.clerkOrgId,
              organisation_id: tenantA.organisationId,
            },
          });
          expect(run.status).toBe(status);
          expect(run.cancel_requested_at).toBeNull();
          expect(result).toMatchObject({
            ok: true,
            value: { status: "cancelled" },
          });
        }
      );
      it.each([0, 1])(
        "does not infer absence from a complete incremental response containing %i employees",
        async (returnedCount) => {
          await setupTenant(tenantA);
          const people = await createXeroPeople(tenantA, 2);
          const before = await seedCursor();
          mockFetchEmployeesForRegion.mockResolvedValueOnce({
            ok: true,
            value: snapshot(people.slice(0, returnedCount)),
          });
          const result = await syncXeroPeople({
            ...tenantA,
            mode: "incremental",
          });
          expect(result).toMatchObject({
            ok: true,
            value: { status: "succeeded" },
          });
          for (const person of people) {
            expect(await personState(person.id)).toEqual({
              archived_at: null,
              is_active: true,
            });
          }
          expect(
            (await currentCursor()).modified_since?.getTime()
          ).toBeGreaterThan(before.getTime());
          const connection = await database.xeroConnection.findUniqueOrThrow({
            where: { id: tenantA.connectionId },
          });
          expect(connection.last_full_people_sync_at).toBeNull();
        }
      );
      it.each([
        "truncated",
        "mapping",
        "validation",
        "provider",
        "persistence",
        "cancelled",
      ] as const)(
        "preserves absent people and the prior watermark after a %s full read",
        async (failure) => {
          await setupTenant(tenantA);
          const people = await createXeroPeople(tenantA, 2);
          const before = await seedCursor();
          const value = snapshot(people.slice(0, 1));
          if (failure === "truncated") {
            value.complete = false;
          }
          if (failure === "validation") {
            atIndex(value.employees, 0).firstName = "";
          }
          if (failure === "persistence") {
            beforePersonUpsert.mockRejectedValueOnce(
              new Error("synthetic persistence failure")
            );
            // Use a new employee so persistence reaches the intercepted upsert.
            atIndex(value.employees, 0).employeeId = fixture.id("employee", 4);
            value.seenEmployeeIds = [fixture.id("employee", 4)];
          }
          if (failure === "provider") {
            mockFetchEmployeesForRegion.mockResolvedValueOnce({
              error: {
                code: "validation_error",
                message: "Malformed provider response",
              },
              ok: false,
            });
          } else if (failure === "cancelled") {
            mockFetchEmployeesForRegion.mockImplementationOnce(async () => {
              await database.syncRun.updateMany({
                data: { cancel_requested_at: new Date() },
                where: {
                  clerk_org_id: tenantA.clerkOrgId,
                  organisation_id: tenantA.organisationId,
                  status: "running",
                },
              });
              return { ok: true, value };
            });
          } else {
            mockFetchEmployeesForRegion.mockResolvedValueOnce({
              ok: true,
              value:
                failure === "mapping"
                  ? {
                      ...value,
                      failures: [
                        {
                          rawEmployeeId: null,
                          rawPayload: {},
                          reason: "Missing EmployeeID",
                        },
                      ],
                      rawItemCount: 2,
                    }
                  : value,
            });
          }
          const result = await syncXeroPeople({ ...tenantA, mode: "full" });
          const expectedStatus = {
            cancelled: "cancelled",
            mapping: "partial_success",
            persistence: "partial_success",
            provider: "failed",
            truncated: "partial_success",
            validation: "partial_success",
          } as const;
          expect(result).toMatchObject({
            ok: true,
            value: { status: expectedStatus[failure] },
          });
          for (const person of people) {
            expect(await personState(person.id)).toEqual({
              archived_at: null,
              is_active: true,
            });
          }
          expect((await currentCursor()).modified_since).toEqual(before);
          const connection = await database.xeroConnection.findUniqueOrThrow({
            where: { id: tenantA.connectionId },
          });
          expect(connection.last_full_people_sync_at).toBeNull();
        }
      );
    });
  });
  it("derives connection state from the canonical grant without treating an operational error as revocation", async () => {
    const { getXeroConnectionState } = await import(
      "@repo/database/queries/xero-connection-state"
    );
    await setupTenant(tenantA);
    const scope = {
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
    };
    expect(await getXeroConnectionState(scope)).toEqual({
      ok: true,
      value: { state: "connected" },
    });
    await database.xeroAuthorisation.update({
      data: {
        last_refresh_error_code: "refresh_token_invalid",
        status: "reconnect_required",
      },
      where: { id: tenantA.authorisationId },
    });
    expect(await getXeroConnectionState(scope)).toEqual({
      ok: true,
      value: { state: "reauthorisation_required" },
    });
    await database.xeroAuthorisation.update({
      data: { last_refresh_error_code: null, status: "active" },
      where: { id: tenantA.authorisationId },
    });
    await database.xeroConnection.update({
      data: { last_error_code: "client_credentials_invalid" },
      where: { id: tenantA.connectionId },
    });
    expect(await getXeroConnectionState(scope)).toEqual({
      ok: true,
      value: { state: "connected" },
    });
    await database.xeroConnection.update({
      data: {
        disconnected_at: new Date(),
        remote_connection_id: null,
        status: "disconnected",
        xero_authorisation_id: null,
      },
      where: { id: tenantA.connectionId },
    });
    expect(await getXeroConnectionState(scope)).toEqual({
      ok: true,
      value: { state: "not_connected" },
    });
  });
  it("cancels a fetched batch when its connection disconnects and persists no canonical batch", async () => {
    await setupTenant(tenantA);
    mockFetchEmployeesForRegion.mockImplementationOnce(async () => {
      await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-binding:${tenantA.connectionId}`}, 0))::text AS acquired`;
        await tx.xeroConnection.updateMany({
          data: {
            disconnected_at: new Date(),
            remote_connection_id: null,
            status: "disconnected",
            xero_authorisation_id: null,
          },
          where: {
            clerk_org_id: tenantA.clerkOrgId,
            id: tenantA.connectionId,
            organisation_id: tenantA.organisationId,
          },
        });
      });
      return {
        ok: true,
        value: {
          complete: true,
          employees: [
            {
              email: "fake@example.test",
              employeeId: fixture.id("employee", 0),
              employmentType: "EMPLOYEE",
              firstName: "Fake",
              jobTitle: null,
              lastName: "Employee",
              rawPayload: {},
              startDate: null,
              status: "ACTIVE",
            },
          ],
          failures: [],
          rawItemCount: 1,
          rawResponse: {},
          seenEmployeeIds: [fixture.id("employee", 0)],
        },
      };
    });
    const result = await syncXeroPeople({
      clerkOrgId: tenantA.clerkOrgId,
      connectionId: tenantA.connectionId,
      organisationId: tenantA.organisationId,
    });
    expect(result).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(
      await database.person.count({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).toBe(0);
    expect(
      await database.xeroConnection.findFirst({
        select: { last_people_sync_at: true },
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).toEqual({ last_people_sync_at: null });
    expect(
      await database.syncRun.findFirst({
        select: { error_summary: true, status: true },
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).toEqual({ error_summary: "connection_changed", status: "cancelled" });
  });
  it("isolates a real per-record unique violation and still commits the following valid employee", async () => {
    await setupTenant(tenantA);
    const blockedId = fixture.id("employee", 0);
    const validId = fixture.id("employee", 1);
    beforePersonUpsert.mockImplementationOnce(async (args) => {
      expect(args.create.xero_employee_id).toBe(blockedId);
      await database.person.create({
        data: {
          clerk_org_id: tenantA.clerkOrgId,
          email: "manual@example.test",
          employment_type: "employee",
          first_name: "Existing",
          id: fixture.id("person", 0),
          last_name: "Manual",
          organisation_id: tenantA.organisationId,
          source_person_key: null,
          source_system: "MANUAL",
          xero_employee_id: blockedId,
        },
      });
    });
    mockFetchEmployeesForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [blockedId, validId].map((employeeId) => ({
          email: `${employeeId}@example.test`,
          employeeId,
          employmentType: "EMPLOYEE",
          firstName: "Fake",
          jobTitle: null,
          lastName: "Employee",
          rawPayload: {},
          startDate: null,
          status: "ACTIVE",
        })),
        failures: [],
        rawItemCount: 2,
        rawResponse: {},
        seenEmployeeIds: [blockedId, validId],
      },
    });
    const result = await syncXeroPeople({
      clerkOrgId: tenantA.clerkOrgId,
      connectionId: tenantA.connectionId,
      organisationId: tenantA.organisationId,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { failed: 1, status: "partial_success", upserted: 1 },
    });
    expect(
      await database.person.findFirst({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
          source_person_key: validId,
          source_system: "XERO",
        },
      })
    ).not.toBeNull();
    expect(
      await database.failedRecord.count({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          error_code: "db_error",
          organisation_id: tenantA.organisationId,
          source_id: blockedId,
        },
      })
    ).toBe(1);
  });
  it("cancels a fetched batch when its canonical authorisation becomes unusable", async () => {
    await setupTenant(tenantA);
    mockFetchEmployeesForRegion.mockImplementationOnce(async () => {
      await database.xeroAuthorisation.update({
        data: {
          last_refresh_error_code: "refresh_token_invalid",
          status: "reconnect_required",
        },
        where: { id: tenantA.authorisationId },
      });
      return {
        ok: true,
        value: {
          complete: true,
          employees: [],
          failures: [],
          rawItemCount: 0,
          rawResponse: {},
          seenEmployeeIds: [],
        },
      };
    });
    const result = await syncXeroPeople({
      clerkOrgId: tenantA.clerkOrgId,
      connectionId: tenantA.connectionId,
      organisationId: tenantA.organisationId,
    });
    expect(result).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(
      await database.person.count({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).toBe(0);
    expect(
      await database.xeroConnection.findFirst({
        select: { last_people_sync_at: true },
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).toEqual({ last_people_sync_at: null });
  });
});
