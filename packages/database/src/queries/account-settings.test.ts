import { beforeEach, expect, test, vi } from "vitest";
import type { Prisma } from "../../generated/client";
import { withTenantDb as withTestTenantDb } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  read: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));

import { TenantMismatchError, withTenantDb } from "../tenant-db";
import { getAccountSettings, updateAccountSettings } from "./account-settings";

beforeEach(() => {
  vi.clearAllMocks();
  state.read.mockResolvedValue({
    clerk_org_id: "account-A",
    created_at: new Date(),
    id: "settings-A",
    manager_visibility_scope: "direct_reports_only",
    updated_at: new Date(),
  });
  state.create.mockResolvedValue({ count: 1 });
  state.update.mockResolvedValue({ count: 1 });
  state.transaction.mockImplementation(
    async (fn: (db: Prisma.TransactionClient) => Promise<unknown>) => {
      // Substitute the pool with the account settings delegates used by this test.
      return await fn({
        $queryRaw: async () => [],
        accountSettings: {
          createMany: state.create,
          findFirst: state.read,
          findFirstOrThrow: state.read,
          updateMany: state.update,
        },
      } as unknown as Prisma.TransactionClient);
    }
  );
});
test("account settings open one owned scope", async () => {
  await withTestTenantDb(tenantTestAccount("account-A"), (db) =>
    getAccountSettings("account-A", db)
  );
  expect(state.transaction).toHaveBeenCalledOnce();
  expect(state.read).toHaveBeenCalledWith(
    expect.objectContaining({ where: { clerk_org_id: "account-A" } })
  );
});
test("account settings reuse the request client for reads and updates", async () => {
  await withTenantDb("account-A", async (db) => {
    await getAccountSettings("account-A", db);
    await updateAccountSettings("account-A", "all_team_leave", db);
  });
  expect(state.transaction).toHaveBeenCalledOnce();
  expect(state.update).toHaveBeenCalledWith(
    expect.objectContaining({ where: { clerk_org_id: "account-A" } })
  );
});
test("another account's client is rejected before any settings access", async () => {
  await expect(
    withTenantDb("account-B", (db) => getAccountSettings("account-A", db))
  ).rejects.toBeInstanceOf(TenantMismatchError);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.create).not.toHaveBeenCalled();
});
test("first settings access uses a conflict-safe insert then reload", async () => {
  state.read.mockResolvedValueOnce(null);
  await withTestTenantDb(tenantTestAccount("account-A"), (db) =>
    getAccountSettings("account-A", db)
  );
  expect(state.create).toHaveBeenCalledWith({
    data: { clerk_org_id: "account-A" },
    skipDuplicates: true,
  });
  expect(state.read).toHaveBeenCalledTimes(2);
});
