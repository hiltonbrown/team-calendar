import { withTenantDb as withTestTenantDb } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));

import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (callback: (db: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [],
        ...{ organisation: { findMany: mocks.findMany } },
      }),
  },
}));

import { resolveAccountCompanies } from "./account-companies";

test("account companies retain manual companies and exclude released or archived ones", async () => {
  mocks.findMany.mockResolvedValue([]);
  await withTestTenantDb(tenantTestAccount("account"), (db) =>
    resolveAccountCompanies("account", db)
  );
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        account_id: "account",
        archived_at: null,
        is_active: true,
        OR: [
          { xero_connection: null },
          { xero_connection: { released_at: null } },
        ],
      },
    })
  );
});
