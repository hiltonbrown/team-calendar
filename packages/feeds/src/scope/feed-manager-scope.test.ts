import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: vi.fn(),
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
      return await [{ id: "company-A" }, { id: "company-B" }];
    },
  };
});

import { withTenantDb } from "@repo/database";
import { resolvePeopleForFeed } from "./feed-scope";

const rows = [
  {
    clerk_org_id: "account-A",
    clerk_user_id: "manager-user",
    first_name: "Manager",
    id: "manager-A",
    manager_person_id: null,
    organisation_id: "company-A",
  },
  {
    clerk_org_id: "account-A",
    clerk_user_id: null,
    first_name: "Report",
    id: "report-B",
    manager_person_id: "manager-A",
    organisation_id: "company-B",
  },
  {
    clerk_org_id: "account-A",
    clerk_user_id: null,
    first_name: "Indirect",
    id: "indirect-B",
    manager_person_id: "report-B",
    organisation_id: "company-B",
  },
  {
    clerk_org_id: "account-foreign",
    clerk_user_id: null,
    first_name: "Foreign",
    id: "foreign",
    manager_person_id: "manager-A",
    organisation_id: "company-foreign",
  },
].map((person) => ({
  ...person,
  archived_at: null,
  display_name: null,
  is_active: true,
  last_name: "Person",
  location: null,
  location_id: null,
  team_id: null,
}));
const input = {
  clerkOrgId: "account-A",
  createdByUserId: "manager-user",
  organisationId: null,
  scopes: [{ scopeType: "manager_team" as const }],
};
beforeEach(() => {
  vi.clearAllMocks();
  state.visibility = "direct_reports_only";
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const client = {
        $queryRaw: async () => [],
        person: {
          findMany: async ({
            where,
          }: {
            where: {
              clerk_org_id: string;
              organisation_id: string | { in: string[] };
            };
          }) => {
            state.queries(where);
            const companyIds =
              typeof where.organisation_id === "string"
                ? [where.organisation_id]
                : where.organisation_id.in;
            return await rows.filter(
              (person) =>
                person.clerk_org_id === where.clerk_org_id &&
                companyIds.includes(person.organisation_id)
            );
          },
        },
      };
      // Substitute the pool with scoped person reads for manager-team projection.
      return await fn(client as unknown as Prisma.TransactionClient);
    }
  );
});
test("account manager-team feed includes direct reports in another company", async () => {
  const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
    resolvePeopleForFeed(input, db)
  );
  expect(result.ok && result.value.map((person) => person.id)).toEqual(
    expect.arrayContaining(["manager-A", "report-B"])
  );
  expect(result.ok && result.value.map((person) => person.id)).not.toContain(
    "foreign"
  );
  expect(result.ok && result.value.map((person) => person.id)).not.toContain(
    "indirect-B"
  );
});
test("account policy includes indirect reports across companies", async () => {
  state.visibility = "all_team_leave";
  const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
    resolvePeopleForFeed(input, db)
  );
  expect(result.ok && result.value.map((person) => person.id)).toEqual(
    expect.arrayContaining(["manager-A", "report-B", "indirect-B"])
  );
});
test("company feed resolves a creator employed solely in another company", async () => {
  const result = await withTestTenantResult(
    tenantTestAccount({
      ...input,
      organisationId: "company-B",
    }),
    (db) =>
      resolvePeopleForFeed(
        {
          ...input,
          organisationId: "company-B",
        },
        db
      )
  );
  expect(result.ok && result.value.map((person) => person.id)).toEqual([
    "report-B",
  ]);
});
test("manager-team preparation reuses a supplied request client", async () => {
  await withTenantDb(input.clerkOrgId, async (db) => {
    await resolvePeopleForFeed(input, db);
  });
  expect(state.transaction).toHaveBeenCalledOnce();
});
