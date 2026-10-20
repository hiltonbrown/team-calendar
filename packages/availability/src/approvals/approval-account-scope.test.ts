import type { Prisma } from "@repo/database/generated/client";
import { beforeEach, expect, test, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const state = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  managed: [] as string[],
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),
  resolveAccountCompanies: async () => companies,
  scopedTo: (requestInput: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: requestInput.clerkOrgId,
    organisation_id: requestInput.organisationId,
  }),
}));
vi.mock("@repo/feeds", () => ({ materialiseAvailabilityPublication: vi.fn() }));
vi.mock("@repo/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../plans/submit-service", () => ({ createLeaveOnApproval: vi.fn() }));
vi.mock("../plans/write-operation", () => ({
  completeXeroWriteSideEffects: vi.fn(),
  prepareXeroWrite: vi.fn(),
  recordXeroWriteOutcome: vi.fn(),
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: async () => state.managed,
}));
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: async (requestInput2: { organisationId: string }) => ({
    ok: true,
    value: {
      requireDeclineReason: requestInput2.organisationId === companyA,
      showDeclinedOnApprovals: requestInput2.organisationId === companyA,
    },
  }),
}));
vi.mock("../duration/working-days", () => ({
  computeWorkingDays: async () => ({ ok: true, value: 3 }),
  computeWorkingDaysFromReferenceData: () => ({ ok: true, value: 3 }),
  loadHolidaysForYears: async () => new Map(),
  workingDayYearsForInput: () => ({ ok: true, value: [2026] }),
}));
vi.mock("../sync/sync-events", () => ({ dispatchSyncEvent: vi.fn() }));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: vi.fn(),
}));
vi.mock("../xero-write-claim", () => ({
  acquireXeroWriteClaim: vi.fn(),
  noUnresolvedSubmitOperationWhere: () => ({}),
  releaseXeroWriteClaim: vi.fn(),
  unclaimedOrExpiredXeroWriteWhere: () => ({}),
  XERO_WRITE_CLAIM_LEASE_MS: 1000,
}));

import { TenantMismatchError, withTenantDb } from "@repo/database";
import { getApprovalSummaryCounts, listForApprover } from "./approval-service";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const companies = [
  { id: companyA, name: "Company A" },
  { id: companyB, name: "Company B" },
];
function record(
  company: (typeof companies)[number],
  status: string,
  index: number
) {
  return {
    all_day: true,
    approval_note: null,
    approval_status: status,
    approved_at: null,
    archived_at: null,
    clerk_org_id: "account-A",
    created_at: new Date("2026-10-12"),
    created_by_user_id: "user-1",
    ends_at: new Date("2050-10-15"),
    failed_action: null,
    id: `${index}5555555-5555-4555-8555-555555555555`,
    notes_internal: null,
    organisation: company,
    organisation_id: company.id,
    outbound_operations: [],
    person: {
      clerk_user_id: "user-1",
      email: "alex@example.com",
      first_name: "Alex",
      id: company.id === companyB ? reportId : actorId,
      last_name: "Person",
      location_id: null,
      manager: null,
      manager_person_id: null,
      team: null,
    },
    person_id: company.id === companyB ? reportId : actorId,
    record_type: "annual_leave",
    source_remote_id: null,
    source_type: "team_calendar_leave",
    starts_at: new Date("2050-10-12"),
    submitted_at: new Date("2026-10-12"),
    xero_write_error: null,
  };
}
const [firstCompany, secondCompany] = companies;
const rows = [
  record(firstCompany, "submitted", 1),
  record(secondCompany, "submitted", 2),
  record(firstCompany, "declined", 3),
  record(secondCompany, "declined", 4),
];
interface Where {
  AND?: Where[];
  approval_status?: string | { in: string[] };
  clerk_org_id?: string;
  OR?: Where[];
  organisation_id?: string | { in: string[] };
  person_id?: { in: string[] };
}
function matches(row: (typeof rows)[number], where: Where): boolean {
  const company = where.organisation_id;
  const status = where.approval_status;
  return (
    (!where.clerk_org_id || where.clerk_org_id === row.clerk_org_id) &&
    (!company ||
      (typeof company === "string"
        ? company === row.organisation_id
        : company.in.includes(row.organisation_id))) &&
    (!status ||
      (typeof status === "string"
        ? status === row.approval_status
        : status.in.includes(row.approval_status))) &&
    (!where.person_id || where.person_id.in.includes(row.person_id)) &&
    (!where.OR || where.OR.some((branch) => matches(row, branch))) &&
    (!where.AND || where.AND.every((branch) => matches(row, branch)))
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.managed = [reportId];
  state.findMany.mockImplementation(async ({ where }: { where: Where }) =>
    rows.filter((row) => matches(row, where))
  );
  state.count.mockImplementation(
    async ({ where }: { where: Where }) =>
      rows.filter((row) => matches(row, where)).length
  );
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Safe projection delegates exercise the real branded transaction boundary.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(async () => []),
        availabilityRecord: { count: state.count, findMany: state.findMany },
        leaveBalance: { findMany: async () => [] },
        location: { findMany: async () => [] },
        organisation: {
          findFirst: async () => ({ country_code: "AU", timezone: "UTC" }),
        },
      } as unknown as Prisma.TransactionClient;
      return await run(db);
    }
  );
});
const input = {
  actingPersonId: actorId,
  actingUserId: "user-1",
  clerkOrgId: "account-A",
  role: "admin" as const,
};
test.each(["owner", "admin"] as const)(
  "%s sees one labelled queue with each company's declined policy",
  async (role) => {
    const result = await withTestTenantResult(
      tenantTestAccount({ ...input, role }),
      (db) => listForApprover({ ...input, role }, db)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected combined queue");
    }
    expect(
      result.value.items.map((item) => [
        item.organisationName,
        item.approvalStatus,
      ])
    ).toEqual([
      ["Company A", "submitted"],
      ["Company B", "submitted"],
      ["Company A", "declined"],
    ]);
    expect(
      result.value.items.find((item) => item.organisationId === companyB)
        ?.requireDeclineReason
    ).toBe(false);
    expect(state.transaction).toHaveBeenCalledTimes(1);
  }
);
test("A-employed manager sees B reports and summary counts in the same caller scope", async () => {
  await withTenantDb("account-A", async (db) => {
    const result = await listForApprover({ ...input, role: "manager" }, db);
    expect(
      result.ok && result.value.items.map((item) => item.organisationId)
    ).toEqual([companyB]);
    const summary = await getApprovalSummaryCounts(
      { ...input, role: "manager" },
      db
    );
    expect(summary.ok && summary.value.pending).toBe(1);
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
});
test("admin summary includes pending leave in both companies", async () => {
  const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
    getApprovalSummaryCounts(input, db)
  );
  expect(result.ok && result.value.pending).toBe(2);
});
test("foreign caller is rejected before approval records are read", async () => {
  await expect(
    withTenantDb("account-B", (db) => listForApprover(input, db))
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.findMany).not.toHaveBeenCalled();
});
