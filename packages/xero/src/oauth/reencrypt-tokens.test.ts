import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptXeroToken, encryptXeroToken } from "../crypto/tokens";
import { reencryptXeroTokens } from "./reencrypt-tokens";

vi.mock("server-only", () => ({}));
vi.mock("@repo/observability/log", () => ({ log: { warn: vi.fn() } }));
const db = vi.hoisted(() => ({
  xeroConnection: { findMany: vi.fn(), updateMany: vi.fn() },
  xeroCredentialOwner: { findMany: vi.fn(), updateMany: vi.fn() },
  xeroOAuthSession: { findMany: vi.fn(), updateMany: vi.fn() },
  xeroRefreshAttempt: { findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@repo/database", () => ({ database: db }));
beforeEach(() => {
  vi.resetAllMocks();
  for (const table of Object.values(db)) {
    table.findMany.mockResolvedValue([]);
    table.updateMany.mockResolvedValue({ count: 1 });
  }
  process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString(
    "base64"
  );
  process.env.XERO_TOKEN_ENCRYPTION_KEYS_JSON = JSON.stringify({
    "2": Buffer.alloc(32, 2).toString("base64"),
  });
  process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "1";
});
function owner() {
  const a = encryptXeroToken("access");
  const r = encryptXeroToken("refresh");
  return {
    access_token_auth_tag: a.authTag,
    access_token_encrypted: a.encrypted,
    access_token_iv: a.iv,
    id: "owner",
    refresh_token_auth_tag: r.authTag,
    refresh_token_encrypted: r.encrypted,
    refresh_token_iv: r.iv,
    token_key_version: 1,
    token_version: 3,
  };
}
describe("owner/recovery key maintenance", () => {
  it("excludes owners and attempts from legacy restricted operations", async () => {
    await reencryptXeroTokens({
      batchSize: 1,
      only: { connectionIds: ["legacy"] },
    });
    expect(
      db.xeroCredentialOwner.findMany.mock.calls[0][0].where.id.in
    ).toEqual([]);
    expect(db.xeroRefreshAttempt.findMany.mock.calls[0][0].where.id.in).toEqual(
      []
    );
  });
  it("refuses unknown recovery keys before writing any table", async () => {
    db.xeroRefreshAttempt.findMany.mockResolvedValueOnce([
      { recovery_key_version: 99 },
    ]);
    expect(await reencryptXeroTokens({ batchSize: 1 })).toEqual({
      error: { code: "unknown_key_version_present" },
      ok: false,
    });
    for (const table of Object.values(db)) {
      expect(table.updateMany).not.toHaveBeenCalled();
    }
  });
  it("rewrites owner without changing credential generation and skips CAS races", async () => {
    const row = owner();
    process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "2";
    db.xeroCredentialOwner.findMany
      .mockResolvedValueOnce([{ token_key_version: 1 }])
      .mockResolvedValueOnce([row]);
    db.xeroCredentialOwner.updateMany.mockResolvedValueOnce({ count: 0 });
    const beforeWrite = vi.fn().mockResolvedValue(undefined);
    expect(
      await reencryptXeroTokens(
        { batchSize: 2, only: { ownerIds: ["owner"] } },
        { beforeWrite }
      )
    ).toEqual({ ok: true, value: { failed: 0, rewritten: 0, skipped: 1 } });
    const [[call]] = db.xeroCredentialOwner.updateMany.mock.calls;
    expect(call.where).toMatchObject({
      access_token_encrypted: row.access_token_encrypted,
      token_key_version: 1,
      token_version: 3,
    });
    expect(call.data.token_version).toBeUndefined();
    expect(call.data.token_key_version).toBe(2);
    expect(beforeWrite).toHaveBeenCalledWith("owner", "owner");
  });
  it("rewrites recovery token with CAS on state and previous envelope", async () => {
    const r = encryptXeroToken("retry-refresh");
    const row = {
      expected_token_version: 3,
      id: "attempt",
      outcome: "uncertain",
      recovery_key_version: 1,
      recovery_token_auth_tag: r.authTag,
      recovery_token_encrypted: r.encrypted,
      recovery_token_iv: r.iv,
    };
    process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION = "2";
    db.xeroRefreshAttempt.findMany
      .mockResolvedValueOnce([{ recovery_key_version: 1 }])
      .mockResolvedValueOnce([row]);
    expect(
      await reencryptXeroTokens({
        batchSize: 2,
        only: { attemptIds: ["attempt"] },
      })
    ).toEqual({ ok: true, value: { failed: 0, rewritten: 1, skipped: 0 } });
    const [[call]] = db.xeroRefreshAttempt.updateMany.mock.calls;
    expect(call.where).toMatchObject(row);
    expect(
      decryptXeroToken({
        authTag: call.data.recovery_token_auth_tag,
        encrypted: call.data.recovery_token_encrypted,
        iv: call.data.recovery_token_iv,
        keyVersion: call.data.recovery_key_version,
      })
    ).toBe("retry-refresh");
  });
});
