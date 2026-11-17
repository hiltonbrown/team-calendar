import { withTenantResult as withTestTenantResult } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));

import { beforeEach, expect, test, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("../tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (callback: (db: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [],
        ...{ xeroConnection: { findFirst } },
      }),
  },
}));
const { getXeroConnectionState } = await import("./xero-connection-state");
vi.mock("../system-client", () => ({
  systemDatabase: {
    xeroAuthorisation: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        status:
          where.id === "reconnect-grant" ? "reconnect_required" : "active",
      }),
    },
  },
}));
const scope = { accountId: "account", organisationId: "payroll" };
beforeEach(() => {
  findFirst.mockReset();
});
test.each([
  [null, "not_connected"],
  [
    { status: "active", xero_authorisation_id: null },
    "reauthorisation_required",
  ],
  [{ status: "disconnected", xero_authorisation_id: null }, "not_connected"],
  [{ status: "active", xero_authorisation_id: "grant" }, "connected"],
  [
    { status: "active", xero_authorisation_id: "reconnect-grant" },
    "reauthorisation_required",
  ],
  [
    { status: "reconnect_required", xero_authorisation_id: "grant" },
    "reauthorisation_required",
  ],
])(
  "derives safe connection state from persisted grant and selected connection",
  async (row, expected) => {
    findFirst.mockResolvedValue(row);
    expect(
      await withTestTenantResult(tenantTestAccount(scope), (db) =>
        getXeroConnectionState(scope, db)
      )
    ).toEqual({
      ok: true,
      value: { state: expected },
    });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      account_id: "account",
      organisation_id: "payroll",
      released_at: null,
    });
  }
);
test("database failures abort the owning transaction", async () => {
  findFirst.mockRejectedValue(new Error("database unavailable"));
  await expect(
    withTestTenantResult(tenantTestAccount(scope), (db) =>
      getXeroConnectionState(scope, db)
    )
  ).rejects.toThrow("database unavailable");
});
