import type { TenantDb } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { withTenantDb as withTestTenantDb } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  companies: vi.fn(),
  people: vi.fn(),
  settings: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual("@repo/database/tenant-db")),
  getAccountSettings: state.settings,
  resolveAccountCompanies: state.companies,
}));

import { TenantMismatchError, withTenantDb } from "@repo/database";
import { managerScopePersonIds } from "./manager-scope";

const input = { actingPersonId: "manager-A", clerkOrgId: "account-A" };
beforeEach(() => {
  vi.clearAllMocks();
  state.companies.mockResolvedValue([{ id: "company-A" }, { id: "company-B" }]);
  state.settings.mockResolvedValue({
    manager_visibility_scope: "direct_reports_only",
  });
  state.people.mockResolvedValue([
    { id: input.actingPersonId, manager_person_id: null },
    { id: "report-B", manager_person_id: input.actingPersonId },
    { id: "indirect-B", manager_person_id: "report-B" },
  ]);
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Substitute the pool with the delegates reached by the manager-scope query.
      return await fn({
        $queryRaw: async () => [],
        person: { findMany: state.people },
      } as unknown as Prisma.TransactionClient);
    }
  );
});
test("direct reports span every owned company", async () => {
  expect(
    await withTestTenantDb(tenantTestAccount(input), (db) =>
      managerScopePersonIds(input, db)
    )
  ).toEqual([input.actingPersonId, "report-B"]);
  expect(state.people).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        organisation_id: { in: ["company-A", "company-B"] },
      },
    })
  );
});
test("account setting includes indirect reports across companies", async () => {
  state.settings.mockResolvedValue({
    manager_visibility_scope: "all_team_leave",
  });
  expect(
    await withTestTenantDb(
      tenantTestAccount({ ...input, excludeSelf: true }),
      (db) => managerScopePersonIds({ ...input, excludeSelf: true }, db)
    )
  ).toEqual(["report-B", "indirect-B"]);
});
test("a foreign or archived acting person is never returned", async () => {
  expect(
    await withTestTenantDb(
      tenantTestAccount({ ...input, actingPersonId: "foreign-manager" }),
      (db) =>
        managerScopePersonIds(
          { ...input, actingPersonId: "foreign-manager" },
          db
        )
    )
  ).toEqual([]);
});
test("caller-owned scope is reused and forwarded", async () => {
  await withTenantDb(input.clerkOrgId, async (db) => {
    await managerScopePersonIds(input, db);
    expect(state.settings).toHaveBeenCalledWith(input.clerkOrgId, db);
    expect(state.companies).toHaveBeenCalledWith(input.clerkOrgId, db);
  });
  expect(state.transaction).toHaveBeenCalledOnce();
});
test("wrong-account scope fails before reading settings or people", async () => {
  await expect(
    withTenantDb("account-B", (db: TenantDb) =>
      managerScopePersonIds(input, db)
    )
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.settings).not.toHaveBeenCalled();
  expect(state.people).not.toHaveBeenCalled();
});
test("cyclic hierarchies terminate without including the manager as a report", async () => {
  state.settings.mockResolvedValue({
    manager_visibility_scope: "all_team_leave",
  });
  state.people.mockResolvedValue([
    { id: input.actingPersonId, manager_person_id: "report-B" },
    { id: "report-B", manager_person_id: input.actingPersonId },
  ]);
  expect(
    await withTestTenantDb(
      tenantTestAccount({ ...input, excludeSelf: true }),
      (db) => managerScopePersonIds({ ...input, excludeSelf: true }, db)
    )
  ).toEqual(["report-B"]);
});
