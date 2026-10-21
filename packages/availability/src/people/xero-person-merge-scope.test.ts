import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  audit: vi.fn(),
  effect: vi.fn(),
  graph: [] as Array<{ id: string; manager_person_id: string | null }>,
  invalidate: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
  lockPlanLimitMutations: vi.fn(),
  resolveAccountCompanies: async () => [
    { id: "company-A" },
    { id: "company-B" },
  ],
}));
vi.mock("@repo/feeds", () => ({
  invalidateAccountFeedCaches: state.invalidate,
  invalidateFeedCachesForPerson: async () => ({
    ok: true,
    value: { feedIds: [] },
  }),
}));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));

import {
  afterTenantCommit,
  assertTenantDb,
  isTenantScopeActive,
  type TenantDb,
  TenantMismatchError,
  withTenantDb,
} from "@repo/database";
import { mergeCandidateIntoXeroPerson } from "./xero-person-reconciliation";

const context = { clerkOrgId: "account-A", organisationId: "company-A" };
const input = {
  ...context,
  actorUserId: "user-admin",
  candidatePersonId: "candidate",
  xeroPersonId: "xero",
};
const person = (id: string) => ({
  archived_at: null,
  clerk_org_id: "account-A",
  clerk_user_id: null,
  id,
  location_id: null,
  manager_person_id: null,
  organisation_id: "company-A",
  team_id: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  state.graph = [
    { id: "candidate", manager_person_id: null },
    { id: "xero", manager_person_id: null },
    { id: "report-B", manager_person_id: "candidate" },
  ];
  state.audit.mockResolvedValue({});
  state.updateMany.mockResolvedValue({ count: 1 });
  state.invalidate.mockImplementation(
    async (scope: { clerkOrgId: string }, db: TenantDb) => {
      assertTenantDb(db, scope.clerkOrgId);
      expect(isTenantScopeActive()).toBe(true);
      afterTenantCommit(db, async () => {
        expect(isTenantScopeActive()).toBe(false);
        state.effect();
        await Promise.resolve();
      });
      return await { ok: true, value: { feedIds: [] } };
    }
  );
  state.transaction.mockImplementation(
    async (run: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Delegate fake exercises real scope ownership, rollback and effect scheduling.
      const db = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
        alternativeContact: { updateMany: vi.fn() },
        auditEvent: { create: state.audit },
        availabilityRecord: { updateMany: vi.fn() },
        feedScope: { findMany: async () => [] },
        leaveBalance: { findMany: async () => [] },
        notification: { updateMany: state.updateMany },
        person: {
          findFirst: async ({ where }: { where: { id: string } }) =>
            person(where.id),
          findMany: async () => state.graph,
          update: vi.fn(),
          updateMany: state.updateMany,
        },
      } as unknown as Prisma.TransactionClient;
      return await run(db);
    }
  );
});

test("merge transfers cross-company direct reports and recipients in one scope, then invalidates", async () => {
  expect(
    (
      await withTestTenantResult(tenantTestAccount(context), (db) =>
        mergeCandidateIntoXeroPerson(context, input, db)
      )
    ).ok
  ).toBe(true);
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { manager_person_id: "xero" },
      where: expect.objectContaining({
        id: { notIn: ["candidate", "xero"] },
        manager_person_id: "candidate",
        organisation_id: { in: ["company-A", "company-B"] },
      }),
    })
  );
  expect(state.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { recipient_person_id: "xero" },
      where: expect.objectContaining({
        organisation_id: { in: ["company-A", "company-B"] },
      }),
    })
  );
  expect(state.invalidate).toHaveBeenCalledWith(
    { clerkOrgId: "account-A" },
    expect.any(Object)
  );
});
test("merge reuses a branded parent and defers invalidation until the parent commits", async () => {
  await withTenantDb("account-A", async (db) => {
    expect((await mergeCandidateIntoXeroPerson(context, input, db)).ok).toBe(
      true
    );
    expect(state.effect).not.toHaveBeenCalled();
  });
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.invalidate).toHaveBeenCalledTimes(1);
});
test("merge rejects a contracted manager cycle before relation writes", async () => {
  state.graph = [
    { id: "candidate", manager_person_id: "report-B" },
    { id: "report-B", manager_person_id: "xero" },
    { id: "xero", manager_person_id: null },
  ];
  const result = await withTestTenantResult(tenantTestAccount(context), (db) =>
    mergeCandidateIntoXeroPerson(context, input, db)
  );
  expect(result).toMatchObject({
    error: { code: "validation_error" },
    ok: false,
  });
  expect(state.updateMany).not.toHaveBeenCalled();
  expect(state.audit).not.toHaveBeenCalled();
  expect(state.effect).not.toHaveBeenCalled();
});
test("merging a direct manager into their report preserves the manager's parent without a self-link", async () => {
  state.graph = [
    { id: "candidate", manager_person_id: "manager-B" },
    { id: "xero", manager_person_id: "candidate" },
    { id: "manager-B", manager_person_id: null },
  ];
  expect(
    (
      await withTestTenantResult(tenantTestAccount(context), (db) =>
        mergeCandidateIntoXeroPerson(context, input, db)
      )
    ).ok
  ).toBe(true);
  expect(state.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { manager_person_id: "manager-B" },
      where: expect.objectContaining({ id: "xero" }),
    })
  );
});
test("audit failure rejects and discards cache invalidation", async () => {
  state.audit.mockRejectedValue(new Error("SQL audit failure"));
  await expect(
    withTestTenantResult(tenantTestAccount(context), (db) =>
      mergeCandidateIntoXeroPerson(context, input, db)
    )
  ).rejects.toThrow("SQL audit failure");
  expect(state.effect).not.toHaveBeenCalled();
});
test("a foreign branded client is rejected before reads", async () => {
  await withTenantDb("account-B", async (db) => {
    await expect(
      mergeCandidateIntoXeroPerson(context, input, db)
    ).rejects.toBeInstanceOf(TenantMismatchError);
    expect(state.updateMany).not.toHaveBeenCalled();
  });
});
