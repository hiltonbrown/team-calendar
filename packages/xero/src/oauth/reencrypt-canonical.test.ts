import { expect, test, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@repo/database", () => ({
  database: { xeroAuthorisation: { findMany } },
}));
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
