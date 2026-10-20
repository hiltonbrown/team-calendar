import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  privacy: "named" as "named" | "masked" | "private",
  queries: vi.fn(),
  report: false,
  transaction: vi.fn(),
  visibility: "direct_reports_only",
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => {
  const core = await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  );
  return {
    ...core,
    getAccountSettings: async (
      account: string,
      db: Parameters<typeof core.assertTenantDb>[0]
    ) => {
      core.assertTenantDb(db, account);
      return await { manager_visibility_scope: state.visibility };
    },
    resolveAccountCompanies: async (
      account: string,
      db: Parameters<typeof core.assertTenantDb>[0]
    ) => {
      core.assertTenantDb(db, account);
      return await companies;
    },
    scopedTo: (requestInput: {
      clerkOrgId: string;
      organisationId: string;
    }) => ({
      clerk_org_id: requestInput.clerkOrgId,
      organisation_id: requestInput.organisationId,
    }),
  };
});
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: async () => ({
    ok: true,
    value: { showPendingOnCalendar: true },
  }),
}));
vi.mock("../settings/account-approval-settings-service", () => ({
  getAccountApprovalSettings: async () => ({
    ok: true,
    value: { managerVisibilityScope: state.visibility },
  }),
}));
vi.mock("../holidays/resolve-public-holidays", () => ({
  resolvePublicHolidays: async () => ({ ok: true, value: [] }),
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: async () => ({
    ok: true,
    value: { state: "not_connected" },
  }),
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
}));

import { TenantMismatchError, withTenantDb } from "@repo/database";
import { type CalendarRole, getCalendarRange } from "./calendar-service";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const companies = [
  { country_code: "AU", id: companyA, name: "Company A", timezone: "UTC" },
  { country_code: "AU", id: companyB, name: "Company B", timezone: "UTC" },
];
function person(
  id: string,
  organisation_id: string,
  first_name: string,
  manager_person_id: string | null
) {
  return {
    archived_at: null,
    avatar_url: null,
    clerk_org_id: "account-A",
    clerk_user_id: id === actorId ? "user-1" : null,
    email: null,
    employment_type: "full_time",
    first_name,
    id,
    is_active: true,
    job_title: null,
    last_name: "Person",
    location: null,
    location_id: null,
    manager_person_id,
    organisation_id,
    person_type: "employee",
    team: null,
    team_id: null,
  };
}
const input = {
  actingPersonId: actorId,
  actingUserId: "user-1",
  anchorDate: new Date("2026-10-15T12:00:00Z"),
  clerkOrgId: "account-A",
  filters: {},
  scope: { type: "all_teams" },
  view: "day",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.privacy = "named";
  state.visibility = "direct_reports_only";
  state.report = false;
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const people = [
        person(actorId, companyA, "Actor", null),
        person(reportId, companyB, "Report", state.report ? actorId : null),
      ];
      const matching = (where: {
        clerk_org_id: string;
        organisation_id: string | { in: string[] };
      }) => {
        state.queries(where);
        const ids =
          typeof where.organisation_id === "string"
            ? [where.organisation_id]
            : where.organisation_id.in;
        return people.filter(
          (row) =>
            row.clerk_org_id === where.clerk_org_id &&
            ids.includes(row.organisation_id)
        );
      };
      const client = {
        $queryRaw: async () => [],
        availabilityRecord: {
          findMany: async ({
            where,
          }: {
            where: Parameters<typeof matching>[0];
          }) =>
            matching(where)
              .filter((row) => row.id === reportId)
              .map((row) => ({
                all_day: true,
                approval_note: null,
                approval_status: "approved",
                archived_at: null,
                contactability: "uncontactable",
                ends_at: new Date("2026-10-15T23:59:59Z"),
                id: "55555555-5555-4555-8555-555555555555",
                notes_internal: "Sensitive note",
                person: row,
                person_id: row.id,
                privacy_mode: state.privacy,
                record_type: "annual_leave",
                source_type: "manual",
                starts_at: new Date("2026-10-15T00:00:00Z"),
                submitted_at: null,
                title: "Sensitive title",
                xero_write_error: null,
              })),
        },
        person: {
          findMany: async ({
            where,
          }: {
            where: Parameters<typeof matching>[0];
          }) => matching(where),
        },
      };
      // Substitute the pool with scoped company/person/record reads; use the real ownership core.
      return await fn(client as unknown as Prisma.TransactionClient);
    }
  );
});
test.each(["owner", "admin", "manager", "viewer"] as const)(
  "%s sees approved leave in the other owned company",
  async (role: CalendarRole) => {
    const result = await withTestTenantResult(
      tenantTestAccount({ ...input, role }),
      (db) => getCalendarRange({ ...input, role }, db)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.days.flatMap((day) => day.events)).toContainEqual(
      expect.objectContaining({
        companyId: companyB,
        companyName: "Company B",
        personId: reportId,
      })
    );
    expect(state.transaction).toHaveBeenCalledOnce();
  }
);
test.each([
  ["private", "Unavailable"],
  ["masked", "Team member"],
] as const)(
  "%s privacy remains masked across companies for peers",
  async (privacy, displayName) => {
    state.privacy = privacy;
    const result = await withTestTenantResult(
      tenantTestAccount({ ...input, role: "viewer" }),
      (db) => getCalendarRange({ ...input, role: "viewer" }, db)
    );
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.days.flatMap((day) => day.events)).toContainEqual(
      expect.objectContaining({
        displayName,
        isEditableByActor: false,
        notesInternal: null,
        personId: reportId,
      })
    );
  }
);
test("a manager sees their report across companies with manager privacy", async () => {
  state.report = true;
  state.privacy = "private";
  const result = await withTestTenantResult(
    tenantTestAccount({ ...input, role: "manager" }),
    (db) => getCalendarRange({ ...input, role: "manager" }, db)
  );
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  expect(result.value.days.flatMap((day) => day.events)).toContainEqual(
    expect.objectContaining({
      displayName: "Report Person",
      notesInternal: "Sensitive note",
      personId: reportId,
    })
  );
});
test("range preparation reuses its caller's database client", async () => {
  await withTenantDb(input.clerkOrgId, async (db) => {
    await getCalendarRange({ ...input, role: "owner" }, db);
  });
  expect(state.transaction).toHaveBeenCalledOnce();
});
test("foreign account client is rejected before calendar reads", async () => {
  await expect(
    withTenantDb("account-B", (db) =>
      getCalendarRange({ ...input, role: "owner" }, db)
    )
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.queries).not.toHaveBeenCalled();
});

test("a foreign company filter is rejected instead of expanding the owned set", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({
      ...input,
      companyIds: ["99999999-9999-4999-8999-999999999999"],
      role: "viewer",
    }),
    (db) =>
      getCalendarRange(
        {
          ...input,
          companyIds: ["99999999-9999-4999-8999-999999999999"],
          role: "viewer",
        },
        db
      )
  );
  expect(result).toMatchObject({
    error: { code: "validation_error" },
    ok: false,
  });
  expect(state.queries).not.toHaveBeenCalled();
});
