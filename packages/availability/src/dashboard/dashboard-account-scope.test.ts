import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  approvals: vi.fn(),
  calendar: vi.fn(),
  counts: vi.fn(),
  failProfile: false,
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  resolveAccountCompanies: async () => companies,
}));
vi.mock("../calendar/calendar-service", async () => {
  const actual = await vi.importActual<
    typeof import("../calendar/calendar-service")
  >("../calendar/calendar-service");
  return { ...actual, getCalendarRange: state.calendar };
});
vi.mock("../people/people-service", () => ({
  getPersonProfile: async () => {
    if (state.failProfile) {
      throw new Error("Injected SQL failure");
    }
    return await {
      ok: true,
      value: {
        balances: { balancesLastFetchedAt: null, rows: [], xeroLinked: false },
        header: { firstName: "Alex", lastName: "Person", location: null },
      },
    };
  },
}));
vi.mock("../plans/plan-service", () => ({
  listMyRecords: async () => ({ ok: true, value: [] }),
}));
vi.mock("../approvals/approval-service", () => ({
  listForApprover: state.approvals,
}));
vi.mock("../duration/working-days", () => ({
  computeWorkingDaysFromReferenceData: vi.fn(),
  loadWorkingDaysReferenceData: async () => ({}),
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: async () => ({
    ok: true,
    value: { state: "not_connected" },
  }),
}));
vi.mock("../settings/account-approval-settings-service", () => ({
  getAccountApprovalSettings: async () => ({
    ok: true,
    value: { managerVisibilityScope: "all_team_leave" },
  }),
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: async () => [personId, reportId],
}));
vi.mock("../team-coverage/load-manager-coverage", () => ({
  loadManagerCoverage: async () => ({
    ok: true,
    value: { days: [], teams: [] },
  }),
}));
vi.mock("../holidays/resolve-public-holidays", () => ({
  resolvePublicHolidays: async () => ({ ok: true, value: [] }),
}));
vi.mock("@repo/notifications", () => ({
  listForUser: async () => ({ ok: true, value: { notifications: [] } }),
}));

import {
  assertTenantDb,
  TENANT_READ_TRANSACTION_OPTIONS,
  TenantMismatchError,
  withTenantDb,
} from "@repo/database";
import {
  getAdminView,
  getEmployeeView,
  getManagerView,
  resolveDashboardRole,
} from "./dashboard-service";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const companies = [
  { country_code: "AU", id: companyA, name: "Company A", timezone: "UTC" },
  { country_code: "AU", id: companyB, name: "Company B", timezone: "UTC" },
];
const input = {
  actingRole: "admin" as const,
  clerkOrgId: "account-A",
  organisationId: companyA,
  personId,
  userId: "user-1",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.failProfile = false;
  state.transaction.mockImplementation(
    async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      // Delegate fake uses the real scope issuance, ownership and transaction boundary.
      const tx = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        organisation: { findFirst: async () => ({ name: "Company A" }) },
        person: {
          count: state.counts,
          findFirst: async () => ({ id: personId }),
        },
      } as unknown as Prisma.TransactionClient;
      return await run(tx);
    }
  );
  state.counts.mockImplementation((query) => {
    if (query.where.manager_person_id) {
      return Promise.resolve(1);
    }
    return Promise.resolve(query.where.organisation_id ? 1 : 2);
  });
  state.calendar.mockImplementation(async (query, db) => {
    assertTenantDb(db, query.clerkOrgId);
    const selected = query.companyIds ?? [companyA, companyB];
    return await {
      ok: true,
      value: {
        days: [],
        people: selected.map((id: string) => ({
          companyId: id,
          companyName: id === companyA ? "Company A" : "Company B",
          firstName: id === companyA ? "Alex" : "Blair",
          id,
          jobTitle: null,
          lastName: "Person",
          locationName: null,
          teamId: null,
        })),
        range: { start: new Date("2026-10-12T00:00:00Z"), timezone: "UTC" },
        totalPeopleInScope: selected.length,
      },
    };
  });
  state.approvals.mockImplementation(async (query, db) => {
    assertTenantDb(db, query.clerkOrgId);
    return await {
      ok: true,
      value: {
        items: companies.map((company) => ({
          approvalStatus: "submitted",
          createdAt: new Date("2026-10-12"),
          id: company.id,
          organisationId: company.id,
          person: { firstName: "Blair", lastName: "Person" },
          recordType: "annual_leave",
          sourceType: "team_calendar_leave",
          submittedAt: null,
        })),
        nextCursor: null,
      },
    };
  });
});
test("manager weeks and approvals include both companies and cross-company reports", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({ ...input, actingRole: "manager" }),
    (db) => getManagerView({ ...input, actingRole: "manager" }, undefined, db),
    TENANT_READ_TRANSACTION_OPTIONS
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected manager dashboard");
  }
  expect(result.value.header.directReportCount).toBe(1);
  expect(result.value.header.scopeLabel).toBe(
    "1 team members (direct + indirect)"
  );
  expect(
    result.value.approvalQueue.status === "ready" &&
      result.value.approvalQueue.data.count
  ).toBe(2);
  expect(state.approvals).toHaveBeenCalledTimes(1);
  expect(
    state.calendar.mock.calls.every(
      ([query]) => !query.organisationId && query.scope.type === "all_teams"
    )
  ).toBe(true);
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.transaction.mock.calls[0]?.[1]).toEqual(
    TENANT_READ_TRANSACTION_OPTIONS
  );
});
test("company filter narrows the admin timeline, people count and approval widget", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({ ...input, companyIds: [companyB] }),
    (db) => getAdminView({ ...input, companyIds: [companyB] }, undefined, db)
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected admin dashboard");
  }
  expect(result.value.header.totalActivePeopleCount).toBe(1);
  expect(state.calendar.mock.calls[0]?.[0].companyIds).toEqual([companyB]);
  expect(
    result.value.approvalQueue.status === "ready" &&
      result.value.approvalQueue.data.count
  ).toBe(1);
  expect(state.approvals.mock.calls[0]?.[0].organisationId).toBeUndefined();
});
test("employee timeline defaults to all companies and reuses the caller scope", async () => {
  await withTenantDb("account-A", async (db) => {
    expect(
      (
        await getEmployeeView(
          { ...input, actingRole: "employee" },
          undefined,
          db
        )
      ).ok
    ).toBe(true);
    expect(
      (await resolveDashboardRole({ ...input, orgRole: null }, db)).ok
    ).toBe(true);
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.calendar.mock.calls[0]?.[0].scope).toEqual({
    type: "all_teams",
  });
});
test("foreign caller fails before any dashboard data is prepared", async () => {
  await expect(
    withTenantDb("account-B", (db) => getAdminView(input, undefined, db))
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.calendar).not.toHaveBeenCalled();
  expect(state.counts).not.toHaveBeenCalled();
});
test("SQL failure propagates through a caller scope instead of returning a partial dashboard", async () => {
  state.failProfile = true;
  await expect(
    withTenantDb("account-A", (db) => getAdminView(input, undefined, db))
  ).rejects.toThrow("Injected SQL failure");
  expect(state.counts).not.toHaveBeenCalled();
  expect(state.approvals).not.toHaveBeenCalled();
});
