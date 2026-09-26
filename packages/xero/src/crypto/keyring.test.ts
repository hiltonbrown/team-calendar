import { afterEach, describe, expect, it, vi } from "vitest";
import { activeXeroKeyVersion, resolveXeroEncryptionKey } from "./keyring";
import {
  decryptXeroToken,
  encryptXeroToken,
  tryDecryptXeroToken,
} from "./tokens";

const legacyKey = Buffer.alloc(32, 7).toString("base64");
const nextKey = Buffer.alloc(32, 8).toString("base64");
afterEach(() => vi.unstubAllEnvs());

function configure(active = "1") {
  vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEY", legacyKey);
  vi.stubEnv(
    "XERO_TOKEN_ENCRYPTION_KEYS_JSON",
    JSON.stringify({ "2": nextKey })
  );
  vi.stubEnv("XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION", active);
}

describe("version-aware Xero encryption", () => {
  it("keeps version-one ciphertext decryptable after selecting version two", () => {
    configure();
    const old = encryptXeroToken("legacy-token");
    configure("2");
    expect(activeXeroKeyVersion()).toBe(2);
    expect(old.keyVersion).toBe(1);
    expect(decryptXeroToken(old)).toBe("legacy-token");
    const current = encryptXeroToken("current-token");
    expect(current.keyVersion).toBe(2);
    expect(decryptXeroToken(current)).toBe("current-token");
  });

  it("distinguishes unknown versions from authentication failures safely", () => {
    configure();
    const encrypted = encryptXeroToken("private-token-content");
    const unknown = tryDecryptXeroToken({ ...encrypted, keyVersion: 99 });
    const corrupted = tryDecryptXeroToken({
      ...encrypted,
      authTag: Buffer.alloc(16).toString("base64"),
    });
    expect(resolveXeroEncryptionKey(99)).toEqual({
      error: { code: "unknown_key_version" },
      ok: false,
    });
    expect(unknown).toEqual({
      ok: false,
      reason: "Encrypted Xero token has an unknown key version.",
    });
    expect(corrupted).toEqual({
      ok: false,
      reason: "Encrypted Xero token authentication failed.",
    });
    expect(JSON.stringify([unknown, corrupted])).not.toContain(
      "private-token-content"
    );
    expect(tryDecryptXeroToken({ ...encrypted, keyVersion: 2 }).ok).toBe(false);
  });
});
