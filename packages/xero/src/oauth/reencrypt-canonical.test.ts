import { expect, test, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@repo/database", () => {
  const exports = {
    database: { xeroAuthorisation: { findMany } },
  };
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
    tenantDatabase: vi.fn(() => exports.database),
    tenantTransaction: vi.fn((_clerkOrgId, callback) =>
      "$transaction" in exports.database
        ? exports.database.$transaction(callback)
        : callback(exports.database)
    ),
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
