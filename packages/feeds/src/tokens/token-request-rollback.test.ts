import type { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: [] as string[],
  invalidate: vi.fn(),
  revoked: false,
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual("@repo/database/tenant-db")),
  resolveAccountCompanies: async () => [{ id: input.organisationId }],
  scopedTo: (scope: { accountId: string; organisationId: string }) => ({
    account_id: scope.accountId,
    organisation_id: scope.organisationId,
  }),
}));
vi.mock("../cache/feed-cache", () => ({
  invalidateFeedCache: state.invalidate,
}));
vi.mock("@repo/observability/error", () => ({ parseError: vi.fn() }));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));

import { afterTenantCommit, withTenantResult } from "@repo/database";
import { rotateToken } from "./token-service";

const input = {
  accountId: "account-A",
  actingRole: "owner",
  actingUserId: "user-1",
  feedId: "22222222-2222-4222-8222-222222222222",
  organisationId: "11111111-1111-4111-8111-111111111111",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.revoked = false;
  state.events = [];
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      const snapshot = state.revoked;
      const client = {
        $queryRaw: async () => [], // Context/lock reads succeed; replacement INSERT returns no row.
        feed: {
          findFirst: async () => ({
            created_by_user_id: input.actingUserId,
            id: input.feedId,
            organisation_id: input.organisationId,
            scopes: [{ scope_type: "org" }],
          }),
        },
        feedToken: {
          findMany: async () => [
            { id: "33333333-3333-4333-8333-333333333333" },
          ],
          updateMany: async () => {
            state.revoked = true;
            return await { count: 1 };
          },
        },
      };
      state.events.push("begin");
      try {
        // Substitute a stateful pool boundary to prove rollback of the earlier revocation.
        const result = await fn(client as unknown as Prisma.TransactionClient);
        state.events.push("commit");
        return result;
      } catch (error) {
        state.revoked = snapshot;
        state.events.push("rollback");
        throw error;
      }
    }
  );
});
test("caller-owned rotation conflict returns its business Result and rolls back revocations", async () => {
  const effect = vi.fn();
  const result = await withTenantResult(input.accountId, async (db) => {
    afterTenantCommit(db, () => {
      effect();

      return Promise.resolve();
    });
    return await rotateToken(input, db);
  });
  expect(result).toMatchObject({
    error: { code: "active_token_conflict" },
    ok: false,
  });
  expect(state.revoked).toBe(false);
  expect(state.events).toEqual(["begin", "rollback"]);
  expect(state.transaction).toHaveBeenCalledOnce();
  expect(effect).not.toHaveBeenCalled();
  expect(state.invalidate).not.toHaveBeenCalled();
});
test("standalone rotation preserves the same conflict and rollback contract", async () => {
  expect(
    await withTestTenantResult(tenantTestAccount(input), (db) =>
      rotateToken(input, db)
    )
  ).toMatchObject({
    error: { code: "active_token_conflict" },
    ok: false,
  });
  expect(state.revoked).toBe(false);
  expect(state.events).toEqual(["begin", "rollback"]);
});
