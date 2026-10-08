import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptXeroToken, encryptXeroToken } from "../crypto/tokens";
import { reencryptXeroTokens } from "./reencrypt-tokens";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  lock: vi.fn(),
  xeroAuthorisation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@repo/database", () => ({ database: db, withXeroGrantLock: db.lock }));
const originalEnv = { ...process.env };
beforeEach(() => {
  vi.resetAllMocks();
  db.xeroAuthorisation.findMany.mockResolvedValue([]);
  db.lock.mockImplementation((_scope, work) => work(db));
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString(
    "base64"
  );
  process.env.XERO_TOKEN_ENCRYPTION_KEYS_JSON = JSON.stringify({
    "2": Buffer.alloc(32, 2).toString("base64"),
  });
  process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "1";
});
afterEach(() => {
  process.env = { ...originalEnv };
});
function authorisation() {
  const a = encryptXeroToken("access"),
    r = encryptXeroToken("refresh");
  return {
    access_token_auth_tag: a.authTag,
    access_token_encrypted: a.encrypted,
    access_token_iv: a.iv,
    id: "grant",
    provider_app_id: "app",
    refresh_token_auth_tag: r.authTag,
    refresh_token_encrypted: r.encrypted,
    refresh_token_iv: r.iv,
    token_key_version: 1,
    xero_user_id: "user",
  };
}
function list(row: ReturnType<typeof authorisation>) {
  db.xeroAuthorisation.findMany
    .mockResolvedValueOnce([{ token_key_version: 1 }])
    .mockResolvedValueOnce([row])
    .mockResolvedValueOnce([]);
  db.xeroAuthorisation.findUnique.mockResolvedValue(row);
  process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "2";
}
describe("canonical key maintenance", () => {
  it("restricts maintenance to explicitly selected authorisations", async () => {
    expect(
      await reencryptXeroTokens({
        batchSize: 1,
        only: { authorisationIds: ["grant"] },
      })
    ).toMatchObject({ ok: true });
    expect(db.xeroAuthorisation.findMany.mock.calls[0]?.[0].where).toEqual({
      id: { in: ["grant"] },
    });
  });
  it("refuses unknown canonical keys before writing", async () => {
    db.xeroAuthorisation.findMany.mockResolvedValueOnce([
      { token_key_version: 99 },
    ]);
    expect(await reencryptXeroTokens({ batchSize: 1 })).toEqual({
      error: { code: "unknown_key_version_present" },
      ok: false,
    });
    expect(db.xeroAuthorisation.update).not.toHaveBeenCalled();
  });
  it("rereads under the credential lock and skips a concurrently rotated key", async () => {
    const row = authorisation();
    list(row);
    db.xeroAuthorisation.findUnique.mockResolvedValue({
      ...row,
      token_key_version: 2,
    });
    expect(await reencryptXeroTokens({ batchSize: 2 })).toEqual({
      ok: true,
      value: { failed: 0, rewritten: 0, skipped: 1 },
    });
    expect(db.xeroAuthorisation.update).not.toHaveBeenCalled();
  });
  it("rewrites both tokens while preserving plaintext and credential identity", async () => {
    const row = authorisation();
    list(row);
    expect(await reencryptXeroTokens({ batchSize: 2 })).toEqual({
      ok: true,
      value: { failed: 0, rewritten: 1, skipped: 0 },
    });
    expect(db.lock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "refresh",
        providerAppId: "app",
        xeroUserId: "user",
      }),
      expect.any(Function)
    );
    const call = db.xeroAuthorisation.update.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: "grant" });
    expect(call.data.token_key_version).toBe(2);
    expect(call.data).not.toHaveProperty("xero_user_id");
    expect(
      decryptXeroToken({
        authTag: call.data.access_token_auth_tag,
        encrypted: call.data.access_token_encrypted,
        iv: call.data.access_token_iv,
        keyVersion: 2,
      })
    ).toBe("access");
    expect(
      decryptXeroToken({
        authTag: call.data.refresh_token_auth_tag,
        encrypted: call.data.refresh_token_encrypted,
        iv: call.data.refresh_token_iv,
        keyVersion: 2,
      })
    ).toBe("refresh");
  });
  it("counts corrupt canonical ciphertext without overwriting it", async () => {
    const row = authorisation();
    list(row);
    db.xeroAuthorisation.findUnique.mockResolvedValue({
      ...row,
      access_token_encrypted: "corrupt",
    });
    expect(await reencryptXeroTokens({ batchSize: 2 })).toEqual({
      ok: true,
      value: { failed: 1, rewritten: 0, skipped: 0 },
    });
    expect(db.xeroAuthorisation.update).not.toHaveBeenCalled();
  });
});
