import { expect, test, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
const tenantTestState = vi.hoisted(() => ({ client: null as object | null }));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) => {
      if (!tenantTestState.client) {
        throw new Error("Missing fixture delegates");
      }
      return await executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...tenantTestState.client,
      });
    },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", async () => {
  const actualTenantCore = await vi.importActual<
    typeof import("../../../database/src/tenant-db")
  >("../../../database/src/tenant-db");

  const exports = {
    database: { xeroAuthorisation: { findMany } },
  };
  tenantTestState.client = exports.database;
  return {
    ...exports,
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,

    ...actualTenantCore,
  };
});
vi.mock("../crypto/keyring", () => ({
  activeXeroKeyVersion: () => 2,
  resolveXeroEncryptionKey: () => ({ ok: true }),
}));
const { reencryptXeroTokens } = await import("./reencrypt-tokens");
test("key rotation traverses canonical authorisations only", async () => {
  const result = await reencryptXeroTokens({ batchSize: 25 });
  expect(result).toEqual({
    ok: true,
    value: { failed: 0, rewritten: 0, skipped: 0 },
  });
  expect(findMany).toHaveBeenCalled();
});
