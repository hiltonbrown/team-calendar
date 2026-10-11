import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { encryptXeroToken } from "@repo/xero/src/crypto/tokens";
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
describe("local persistence integration", async () => {
  await import("./setup-env");
  const { getRegisteredSyncEventName } = await import("../events");
  const fixture = allocateLiveTestFixture(
    "packages/jobs/src/handlers/sync-xero-leave-balances.integration.test.ts"
  );
  const { systemDatabase: database } = await import("@repo/database");
  const { syncXeroLeaveBalances } = await import("./sync-xero-leave-balances");
  const tenantA = {
    authorisationId: fixture.id("authorisation", 0),
    clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 0),
    organisationId: fixture.tenants[0]?.organisationId as string,
    personId: fixture.id("person", 0),
    xeroEmployeeId: fixture.id("employee", 0),
  } as const;
  const tenantB = {
    authorisationId: fixture.id("authorisation", 1),
    clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 1),
    organisationId: fixture.tenants[1]?.organisationId as string,
    personId: fixture.id("person", 1),
    xeroEmployeeId: tenantA.xeroEmployeeId,
  } as const;
  const tenantNz = {
    authorisationId: fixture.id("authorisation", 2),
    clerkOrgId: fixture.tenants[2]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 2),
    countryCode: "NZ",
    organisationId: fixture.tenants[2]?.organisationId as string,
    payrollRegion: "NZ" as const,
    personId: fixture.id("person", 2),
    xeroEmployeeId: fixture.id("employee", 2),
  } as const;
  const tenantUk = {
    authorisationId: fixture.id("authorisation", 3),
    clerkOrgId: fixture.tenants[3]?.clerkOrgId as string,
    connectionId: fixture.id("connection", 3),
    countryCode: "GB",
    organisationId: fixture.tenants[3]?.organisationId as string,
    payrollRegion: "UK" as const,
    personId: fixture.id("person", 3),
    xeroEmployeeId: fixture.id("employee", 3),
  } as const;
  const testAuthorisationIds = [
    tenantA.authorisationId,
    tenantB.authorisationId,
    tenantNz.authorisationId,
    tenantUk.authorisationId,
  ];
  const testClerkOrgIds = [
    tenantA.clerkOrgId,
    tenantB.clerkOrgId,
    tenantNz.clerkOrgId,
    tenantUk.clerkOrgId,
  ] as const;
  describe("sync-xero-leave-balances handler", () => {
    it("is registered for dispatch", () => {
      expect(getRegisteredSyncEventName("leave_balances")).toBe(
        "sync-xero-leave-balances"
      );
    });
  });
  describe("sync-xero-leave-balances database flow", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      await cleanTestData();
    });
    afterAll(async () => {
      await cleanTestData();
      await database.$disconnect();
    });
    it("persists all 81 initial roster balances in three pages before completion", async () => {
      await setupTenant(tenantA);
      const requestedAt = new Date("2026-10-07T12:00:00Z");
      await database.xeroConnection.update({
        data: { initial_sync_requested_at: requestedAt },
        where: { id: tenantA.connectionId },
      });
      const people = Array.from({ length: 81 }, (_, i) => ({
        ...tenantA,
        personId: fixture.id("initial-person", i),
        xeroEmployeeId: fixture.id("initial-employee", i),
      }));
      await database.person.createMany({
        data: people.map((person) => ({
          clerk_org_id: person.clerkOrgId,
          email: `${person.personId}@example.com`,
          employment_type: "employee",
          first_name: "Owned",
          id: person.personId,
          last_name: "Employee",
          organisation_id: person.organisationId,
          source_person_key: person.xeroEmployeeId,
          source_system: "XERO",
          xero_employee_id: person.xeroEmployeeId,
        })),
      });
      const byId = new Map(
        people.map((person) => [person.xeroEmployeeId, person])
      );
      mockFetchLeaveBalancesForRegion.mockImplementation(
        async (_region: string, request: { employeeIds: string[] }) => ({
          ok: true,
          value: {
            failures: [],
            leaveBalances: request.employeeIds.map((id) =>
              xeroBalance(byId.get(id) ?? tenantA, 76)
            ),
            rawResponses: [],
          },
        })
      );
      const pages: number[] = [];
      let hasMore = true;
      while (hasMore) {
        const result = await syncXeroLeaveBalances({
          ...syncInput(tenantA),
          requestedAt: requestedAt.toISOString(),
        });
        expect(result.ok).toBe(true);
        if (!result.ok) {
          throw new Error("Initial balance page failed");
        }
        expect(result.value.status).toBe("succeeded");
        pages.push(result.value.upserted);
        hasMore = result.value.hasMore === true;
      }
      expect(pages).toEqual([40, 40, 1]);
      expect(
        await database.leaveBalance.count({
          where: {
            clerk_org_id: tenantA.clerkOrgId,
            organisation_id: tenantA.organisationId,
          },
        })
      ).toBe(81);
      const { completeXeroInitialSync } = await import(
        "@repo/database/queries/xero-sync-cursors"
      );
      expect(
        await completeXeroInitialSync({
          ...syncInput(tenantA),
          requestedAt: requestedAt.toISOString(),
        })
      ).toBeInstanceOf(Date);
    });
    it("fences old external file and old initial request before database persistence", async () => {
      await setupTenant(tenantA);
      const { withXeroBinding } = await import("./xero-sync-access");
      await expect(
        withXeroBinding(
          { ...syncInput(tenantA), expectedXeroTenantId: "foreign-file" },
          async (tx) =>
            tx.xeroConnection.updateMany({
              data: { balance_sweep_failed: true },
              where: { id: tenantA.connectionId },
            })
        )
      ).rejects.toThrow("connection_changed");
      await database.xeroConnection.update({
        data: { initial_sync_requested_at: new Date("2026-10-07T12:01:00Z") },
        where: { id: tenantA.connectionId },
      });
      await expect(
        withXeroBinding(
          { ...syncInput(tenantA), requestedAt: "2026-10-07T12:00:00.000Z" },
          async () => undefined
        )
      ).rejects.toThrow("connection_changed");
      expect(
        (
          await database.xeroConnection.findUnique({
            where: { id: tenantA.connectionId },
          })
        )?.balance_sweep_failed
      ).toBe(false);
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
        currency_code: null,
        leave_type_xero_id: "annual",
        person_id: tenantA.personId,
        source_payload_json: { LeaveTypeID: "annual" },
        xero_connection_id: tenantA.connectionId,
      });
      expect(Number(balances[0]?.balance)).toBe(76);
    });
    it("syncs a currency balance with a validated currency code and raw payload round trip", async () => {
      await setupTenant(tenantA);
      await setupPerson(tenantA);
      mockFetchLeaveBalancesForRegion.mockResolvedValue({
        ok: true,
        value: {
          failures: [],
          leaveBalances: [xeroCurrencyBalance(tenantA, 1234.56)],
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
        balance_unit: "currency",
        currency_code: "NZD",
        leave_type_xero_id: "holiday-pay",
        person_id: tenantA.personId,
        source_payload_json: { CurrencyCode: "NZD", TypeOfUnits: "Dollars" },
        xero_connection_id: tenantA.connectionId,
      });
      expect(Number(balances[0]?.balance)).toBe(1234.56);
    });
    it("fails closed on a currency balance without a supported currency code", async () => {
      await setupTenant(tenantA);
      await setupPerson(tenantA);
      mockFetchLeaveBalancesForRegion.mockResolvedValue({
        ok: true,
        value: {
          failures: [],
          leaveBalances: [
            {
              ...xeroCurrencyBalance(tenantA, 1234.56),
              currencyCode: null,
            },
          ],
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
      const balances = await database.leaveBalance.findMany({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      });
      expect(balances).toHaveLength(0);
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
    it("retains a failed first page through a clean final page and clears health only after a clean new sweep", async () => {
      await setupTenant(tenantA);
      const people = Array.from({ length: 41 }, (_, i) => ({
        clerk_org_id: tenantA.clerkOrgId,
        email: `failed-sweep-${i}@example.com`,
        employment_type: "employee" as const,
        first_name: "Employee",
        id: `71000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        last_name: String(i),
        organisation_id: tenantA.organisationId,
        source_person_key: `failed-sweep-${i}`,
        source_system: "XERO" as const,
        xero_employee_id: `71000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      }));
      await database.person.createMany({ data: people });
      let page = 0;
      mockFetchLeaveBalancesForRegion.mockImplementation(
        (_region, request: { employeeIds: string[] }) => {
          const hasFailure = page === 0;
          page += 1;
          const successfulIds = hasFailure
            ? request.employeeIds.slice(1)
            : request.employeeIds;
          return Promise.resolve({
            ok: true,
            value: {
              failures: hasFailure
                ? [
                    {
                      employeeId: request.employeeIds[0],
                      error: {
                        code: "employee_not_active",
                        message: "Employee unavailable",
                      },
                    },
                  ]
                : [],
              leaveBalances: successfulIds.map((employeeId) => ({
                ...xeroBalance(tenantA, 38),
                employeeId,
              })),
              rawResponses: [],
            },
          });
        }
      );
      const input = {
        ...syncInput(tenantA),
        triggerType: "scheduled" as const,
      };
      const first = await syncXeroLeaveBalances(input);
      expect(first.ok && first.value.status).toBe("partial_success");
      const final = await syncXeroLeaveBalances(input);
      expect(final.ok && final.value.status).toBe("partial_success");
      const where = {
        clerk_org_id: tenantA.clerkOrgId,
        id: tenantA.connectionId,
        organisation_id: tenantA.organisationId,
      };
      const failedSweep = await database.xeroConnection.findFirst({ where });
      expect(failedSweep).toMatchObject({
        balance_next_person_id: null,
        balance_sweep_failed: true,
      });
      expect(failedSweep?.leave_balances_stale_since).toBeInstanceOf(Date);
      await syncXeroLeaveBalances(input);
      await syncXeroLeaveBalances(input);
      expect(await database.xeroConnection.findFirst({ where })).toMatchObject({
        balance_next_person_id: null,
        balance_sweep_failed: false,
        leave_balances_stale_since: null,
      });
    });
    it("pages scheduled balance sync across runs with cursor and stale_since lifecycle", async () => {
      await setupTenant(tenantA);
      // Create 45 active people
      const peopleData = Array.from({ length: 45 }, (_, i) => ({
        clerk_org_id: tenantA.clerkOrgId,
        email: `emp${i + 1}@example.com`,
        employment_type: "employee" as const,
        first_name: "Employee",
        id: `70000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`,
        last_name: String(i + 1),
        organisation_id: tenantA.organisationId,
        source_person_key: `emp_key_${i + 1}`,
        source_system: "XERO" as const,
        xero_employee_id: `70000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`,
      }));
      await database.person.createMany({ data: peopleData });
      mockFetchLeaveBalancesForRegion.mockImplementation(
        (_region, fetchInput) => {
          const balances = (fetchInput.employeeIds as string[]).map(
            (empId) => ({
              balance: 38,
              currencyCode: null,
              employeeId: empId,
              leaveTypeId: "annual",
              leaveTypeName: "Annual Leave",
              rawPayload: { LeaveTypeID: "annual" },
              unitType: "hours" as const,
            })
          );
          return Promise.resolve({
            ok: true,
            value: {
              failures: [],
              leaveBalances: balances,
              rawResponses: [],
            },
          });
        }
      );
      // Run 1: First page (40 of 45 people)
      const run1 = await syncXeroLeaveBalances({
        ...syncInput(tenantA),
        triggerType: "scheduled",
      });
      expect(run1.ok).toBe(true);
      if (run1.ok) {
        expect(run1.value.upserted).toBe(40);
        expect(run1.value.status).toBe("succeeded");
      }
      // Check cursor after Run 1
      const cursor1 = await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
          organisation_id: tenantA.organisationId,
        },
      });
      expect(cursor1?.balance_next_person_id).toBe(peopleData[39]?.id);
      // Check tenant state after Run 1: stale_since set, last_leave_balances_sync_at set
      const tenantAfterRun1 = await database.xeroConnection.findFirst({
        where: { id: tenantA.connectionId },
      });
      expect(tenantAfterRun1?.leave_balances_stale_since).not.toBeNull();
      expect(tenantAfterRun1?.last_leave_balances_sync_at).not.toBeNull();
      // Run 2: Final page (remaining 5 people)
      const run2 = await syncXeroLeaveBalances({
        ...syncInput(tenantA),
        triggerType: "scheduled",
      });
      expect(run2.ok).toBe(true);
      if (run2.ok) {
        expect(run2.value.upserted).toBe(5);
        expect(run2.value.status).toBe("succeeded");
      }
      // Check cursor after Run 2: cleared to null
      const cursor2 = await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
          organisation_id: tenantA.organisationId,
        },
      });
      expect(cursor2?.balance_next_person_id).toBeNull();
      // Check tenant state after Run 2: stale_since cleared to null
      const tenantAfterRun2 = await database.xeroConnection.findFirst({
        where: { id: tenantA.connectionId },
      });
      expect(tenantAfterRun2?.leave_balances_stale_since).toBeNull();
      // Total 45 balances in DB
      const totalBalances = await database.leaveBalance.count({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      });
      expect(totalBalances).toBe(45);
      expect(
        await database.xeroSyncCursor.count({
          where: {
            clerk_org_id: tenantA.clerkOrgId,
            organisation_id: tenantA.organisationId,
            xero_connection_id: tenantA.connectionId,
          },
        })
      ).toBe(0);
    });
    it("persists individual outcomes before conditional cursor update and does not advance on blanket failure", async () => {
      await setupTenant(tenantA);
      await setupPerson(tenantA);
      // 1. Blanket failure
      mockFetchLeaveBalancesForRegion.mockResolvedValueOnce({
        error: {
          code: "rate_limit_error",
          httpStatus: 429,
          message: "Rate limited",
        },
        ok: false,
      });
      const failedRun = await syncXeroLeaveBalances({
        ...syncInput(tenantA),
        triggerType: "scheduled",
      });
      expect(failedRun).toMatchObject({
        error: { code: "unknown_error" },
        ok: false,
      });
      const { rejectRetryableSyncResult } = await import("./xero-sync-access");
      await expect(
        rejectRetryableSyncResult(Promise.resolve(failedRun))
      ).rejects.toThrow("retry_later");
      expect(
        await database.syncRun.findFirst({
          orderBy: { created_at: "desc" },
          select: { error_summary: true, status: true },
          where: {
            clerk_org_id: tenantA.clerkOrgId,
            organisation_id: tenantA.organisationId,
            run_type: "leave_balances",
          },
        })
      ).toEqual({ error_summary: "retry_later", status: "failed" });
      const cursorAfterFailure = await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
        },
      });
      expect(cursorAfterFailure?.balance_next_person_id).toBeNull();
      // 2. Success with employee failure: outcome is recorded, cursor is advanced
      mockFetchLeaveBalancesForRegion.mockResolvedValueOnce({
        ok: true,
        value: {
          failures: [
            {
              employeeId: tenantA.xeroEmployeeId,
              error: {
                code: "employee_not_active",
                httpStatus: 400,
                message: "Employee not active",
              },
            },
          ],
          leaveBalances: [],
          rawResponses: [],
        },
      });
      const partialRun = await syncXeroLeaveBalances({
        ...syncInput(tenantA),
        triggerType: "scheduled",
      });
      expect(partialRun.ok).toBe(true);
      if (partialRun.ok) {
        expect(partialRun.value.status).toBe("partial_success");
        expect(partialRun.value.failed).toBe(1);
      }
      // Failed record was persisted in DB
      const failedRecord = await database.failedRecord.findFirst({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      });
      expect(failedRecord).not.toBeNull();
      expect(failedRecord?.error_code).toBe("employee_not_active");
      // Single page completed so cursor was cleared to null (final page)
      const cursorAfterPartial = await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
        },
      });
      expect(cursorAfterPartial?.balance_next_person_id).toBeNull();
    });
    it("targeted person refresh bypasses cursor and does not change tenant cycle timestamps", async () => {
      await setupTenant(tenantA);
      await setupPerson(tenantA);
      mockFetchLeaveBalancesForRegion.mockResolvedValue({
        ok: true,
        value: {
          failures: [],
          leaveBalances: [xeroBalance(tenantA, 100)],
          rawResponses: [],
        },
      });
      const targetedResult = await syncXeroLeaveBalances({
        ...syncInput(tenantA),
        personId: tenantA.personId,
        triggerType: "manual",
      });
      expect(targetedResult.ok).toBe(true);
      // Verify balance is saved
      const balance = await database.leaveBalance.findFirst({
        where: {
          person_id: tenantA.personId,
        },
      });
      expect(Number(balance?.balance)).toBe(100);
      // Verify no cursor was created
      const cursor = await database.xeroConnection.findFirst({
        where: {
          id: tenantA.connectionId,
        },
      });
      expect(cursor?.balance_next_person_id).toBeNull();
      // Verify tenant cycle timestamps were not changed
      const tenant = await database.xeroConnection.findFirst({
        where: { id: tenantA.connectionId },
      });
      expect(tenant?.last_leave_balances_sync_at).toBeNull();
      expect(tenant?.leave_balances_stale_since).toBeNull();
    });
    it("maintains strict cross-tenant cursor isolation", async () => {
      await setupTenant(tenantA);
      await setupTenant(tenantB);
      await setupPerson(tenantA);
      await setupPerson(tenantB);
      mockFetchLeaveBalancesForRegion.mockImplementation(
        (_region, fetchInput) => {
          const balances = (fetchInput.employeeIds as string[]).map(
            (empId) => ({
              balance: 50,
              currencyCode: null,
              employeeId: empId,
              leaveTypeId: "annual",
              leaveTypeName: "Annual Leave",
              rawPayload: { LeaveTypeID: "annual" },
              unitType: "hours" as const,
            })
          );
          return Promise.resolve({
            ok: true,
            value: {
              failures: [],
              leaveBalances: balances,
              rawResponses: [],
            },
          });
        }
      );
      // Sync Tenant A
      await syncXeroLeaveBalances({
        ...syncInput(tenantA),
        triggerType: "scheduled",
      });
      // Check Tenant A has cursor row
      const cursorA = await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          id: tenantA.connectionId,
        },
      });
      expect(cursorA?.last_leave_balances_sync_at).not.toBeNull();
      expect(cursorA?.balance_next_person_id).toBeNull();
      // Tenant B cursor does not exist
      const cursorB = await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: tenantB.clerkOrgId,
          id: tenantB.connectionId,
        },
      });
      expect(cursorB?.balance_next_person_id).toBeNull();
      expect(cursorB?.last_leave_balances_sync_at).toBeNull();
    });
    it("syncs NZ leave balances with NZD currency and hour records", async () => {
      await setupTenant(tenantNz);
      await setupPerson(tenantNz);
      mockFetchLeaveBalancesForRegion.mockResolvedValue({
        ok: true,
        value: {
          failures: [],
          leaveBalances: [
            xeroBalance(tenantNz, 40),
            xeroCurrencyBalance(tenantNz, 2500.75),
          ],
          rawResponses: [],
        },
      });
      const result = await syncXeroLeaveBalances(syncInput(tenantNz));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          failed: 0,
          fetched: 2,
          status: "succeeded",
          upserted: 2,
        });
      }
      const balances = await database.leaveBalance.findMany({
        orderBy: { leave_type_xero_id: "asc" },
        where: {
          clerk_org_id: tenantNz.clerkOrgId,
          organisation_id: tenantNz.organisationId,
        },
      });
      expect(balances).toHaveLength(2);
      expect(balances[0]).toMatchObject({
        balance_unit: "hours",
        currency_code: null,
        leave_type_xero_id: "annual",
        person_id: tenantNz.personId,
      });
      expect(Number(balances[0]?.balance)).toBe(40);
      expect(balances[1]).toMatchObject({
        balance_unit: "currency",
        currency_code: "NZD",
        leave_type_xero_id: "holiday-pay",
        person_id: tenantNz.personId,
      });
      expect(Number(balances[1]?.balance)).toBe(2500.75);
    });
    it("syncs UK leave balances with hours and days units and null currency", async () => {
      await setupTenant(tenantUk);
      await setupPerson(tenantUk);
      mockFetchLeaveBalancesForRegion.mockResolvedValue({
        ok: true,
        value: {
          failures: [],
          leaveBalances: [
            {
              balance: 37.5,
              currencyCode: null,
              employeeId: tenantUk.xeroEmployeeId,
              leaveTypeId: "holiday",
              leaveTypeName: "Holiday",
              rawPayload: { UnitType: "Hours" },
              unitType: "hours" as const,
            },
            {
              balance: 10,
              currencyCode: null,
              employeeId: tenantUk.xeroEmployeeId,
              leaveTypeId: "maternity",
              leaveTypeName: "Maternity",
              rawPayload: { UnitType: "Days" },
              unitType: "days" as const,
            },
          ],
          rawResponses: [],
        },
      });
      const result = await syncXeroLeaveBalances(syncInput(tenantUk));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          failed: 0,
          fetched: 2,
          status: "succeeded",
          upserted: 2,
        });
      }
      const balances = await database.leaveBalance.findMany({
        orderBy: { leave_type_xero_id: "asc" },
        where: {
          clerk_org_id: tenantUk.clerkOrgId,
          organisation_id: tenantUk.organisationId,
        },
      });
      expect(balances).toHaveLength(2);
      expect(balances[0]).toMatchObject({
        balance_unit: "hours",
        currency_code: null,
        leave_type_xero_id: "holiday",
        person_id: tenantUk.personId,
      });
      expect(Number(balances[0]?.balance)).toBe(37.5);
      expect(balances[1]).toMatchObject({
        balance_unit: "days",
        currency_code: null,
        leave_type_xero_id: "maternity",
        person_id: tenantUk.personId,
      });
      expect(Number(balances[1]?.balance)).toBe(10);
    });
    it("preserves cursor and does not advance on blanket 403 permission error for regional tenant", async () => {
      await setupTenant(tenantUk);
      await setupPerson(tenantUk);
      mockFetchLeaveBalancesForRegion.mockResolvedValueOnce({
        error: {
          code: "permission_error",
          httpStatus: 403,
          message: "Forbidden",
        },
        ok: false,
      });
      const result = await syncXeroLeaveBalances({
        ...syncInput(tenantUk),
        triggerType: "scheduled",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("failed");
      }
      const cursor = await database.xeroConnection.findFirst({
        where: {
          clerk_org_id: tenantUk.clerkOrgId,
          id: tenantUk.connectionId,
        },
      });
      expect(cursor?.balance_next_person_id).toBeNull();
    });
  });
  async function setupTenant(
    tenant: typeof tenantA | typeof tenantB | typeof tenantNz | typeof tenantUk
  ) {
    const countryCode = "countryCode" in tenant ? tenant.countryCode : "AU";
    const payrollRegion =
      "payrollRegion" in tenant ? tenant.payrollRegion : "AU";
    await database.organisation.create({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        country_code: countryCode,
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
      payroll_region: payrollRegion,
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
  async function setupPerson(
    tenant: typeof tenantA | typeof tenantB | typeof tenantNz | typeof tenantUk
  ) {
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
    await database.xeroSyncCursor.deleteMany({ where: scope });
    await database.person.deleteMany({ where: scope });
    await database.xeroConnection.deleteMany({ where: scope });
    await database.xeroAuthorisation.deleteMany({
      where: { xero_user_id: { in: testAuthorisationIds } },
    });
    await database.organisation.deleteMany({ where: scope });
  }
  function syncInput(
    tenant: typeof tenantA | typeof tenantB | typeof tenantNz | typeof tenantUk
  ) {
    return {
      clerkOrgId: tenant.clerkOrgId,
      connectionId: tenant.connectionId,
      organisationId: tenant.organisationId,
      triggerType: "manual" as const,
    };
  }
  function xeroBalance(
    tenant: typeof tenantA | typeof tenantB | typeof tenantNz | typeof tenantUk,
    balance: number
  ) {
    return {
      balance,
      currencyCode: null,
      employeeId: tenant.xeroEmployeeId,
      leaveTypeId: "annual",
      leaveTypeName: "Annual Leave",
      rawPayload: { LeaveTypeID: "annual" },
      unitType: "hours" as const,
    };
  }
  function xeroCurrencyBalance(
    tenant: typeof tenantA | typeof tenantB | typeof tenantNz | typeof tenantUk,
    balance: number
  ) {
    return {
      balance,
      currencyCode: "NZD",
      employeeId: tenant.xeroEmployeeId,
      leaveTypeId: "holiday-pay",
      leaveTypeName: "Holiday Pay",
      rawPayload: { CurrencyCode: "NZD", TypeOfUnits: "Dollars" },
      unitType: "currency" as const,
    };
  }
});
