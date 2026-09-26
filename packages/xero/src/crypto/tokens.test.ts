import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateEncryptionKey } from "../../keys";
import {
  decryptXeroToken,
  encryptXeroToken,
  tryDecryptXeroToken,
} from "./tokens";

const MISSING_TOKEN_COMPONENTS_ERROR = /missing its IV or auth tag/;

describe("validateEncryptionKey", () => {
  it("throws an error if key is absent (undefined)", () => {
    expect(() => validateEncryptionKey(undefined)).toThrowError(
      "XERO_TOKEN_ENCRYPTION_KEY is required but was not found in the environment."
    );
  });

  it("throws an error if key is empty string", () => {
    expect(() => validateEncryptionKey("")).toThrowError(
      "XERO_TOKEN_ENCRYPTION_KEY is required but was not found in the environment."
    );
  });

  it("throws an error if key is not valid base64", () => {
    // Contains invalid characters like '%'
    expect(() =>
      validateEncryptionKey("dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvIQ=%")
    ).toThrowError(
      "XERO_TOKEN_ENCRYPTION_KEY is malformed: must be a valid base64-encoded string."
    );
  });

  it("throws an error if key decodes to wrong length", () => {
    // 16 bytes: "this is 16 bytes" in base64 is "dGhpcyBpcyAxNiBieXRlcw=="
    expect(() =>
      validateEncryptionKey("dGhpcyBpcyAxNiBieXRlcw==")
    ).toThrowError("must decode to exactly 32 bytes");
  });

  it("passes with a valid 32-byte base64-encoded key", () => {
    // 32 bytes: "this is a 32-byte key for xero!1" in base64 is "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE="
    expect(() =>
      validateEncryptionKey("dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=")
    ).not.toThrow();
  });
});

describe("encryptXeroToken and decryptXeroToken", () => {
  const originalEnv = process.env.XERO_TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = originalEnv;
  });

  it("successfully encrypts and decrypts with a valid key", () => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY =
      "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=";
    const originalText = "my-secret-xero-oauth-token";

    const encrypted = encryptXeroToken(originalText);
    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.keyVersion).toBe(1);

    const decrypted = decryptXeroToken(encrypted);
    expect(decrypted).toBe(originalText);
  });

  it("uses distinct IVs and auth tags for repeated encryption", () => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY =
      "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=";

    const first = encryptXeroToken("same-token");
    const second = encryptXeroToken("same-token");

    expect(first.iv).not.toBe(second.iv);
    expect(first.authTag).not.toBe(second.authTag);
  });

  it("throws an error when encrypting with a missing key", () => {
    delete process.env.XERO_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptXeroToken("secret")).toThrowError(
      "Invalid environment variables"
    );
  });

  it("throws an error when decrypting with a missing key", () => {
    delete process.env.XERO_TOKEN_ENCRYPTION_KEY;
    expect(() =>
      decryptXeroToken({
        authTag: "abc",
        encrypted: "abc",
        iv: "abc",
        keyVersion: 1,
      })
    ).toThrowError("Invalid environment variables");
  });

  it("returns an empty string for an empty stored token", () => {
    expect(
      decryptXeroToken({
        authTag: null,
        encrypted: "",
        iv: null,
        keyVersion: 1,
      })
    ).toBe("");
  });

  it("throws an error when a non-empty token is missing its IV", () => {
    expect(() =>
      decryptXeroToken({
        authTag: "auth-tag",
        encrypted: "encrypted-token",
        iv: null,
        keyVersion: 1,
      })
    ).toThrowError(MISSING_TOKEN_COMPONENTS_ERROR);
  });

  it("throws an error when a non-empty token is missing its auth tag", () => {
    expect(() =>
      decryptXeroToken({
        authTag: null,
        encrypted: "encrypted-token",
        iv: "iv",
        keyVersion: 1,
      })
    ).toThrowError(MISSING_TOKEN_COMPONENTS_ERROR);
  });

  it("throws an error when the auth tag has been tampered with", () => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY =
      "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=";
    const encrypted = encryptXeroToken("my-secret-xero-oauth-token");
    const tamperedAuthTag = Buffer.from(encrypted.authTag, "base64");
    const firstByte = tamperedAuthTag.at(0);
    expect(firstByte).toBeDefined();
    if (firstByte !== undefined) {
      tamperedAuthTag[0] = firstByte === 0 ? 1 : firstByte - 1;
    }

    expect(() =>
      decryptXeroToken({
        ...encrypted,
        authTag: tamperedAuthTag.toString("base64"),
      })
    ).toThrow();
  });

  it("throws an error when the IV has been tampered with", () => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY =
      "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=";
    const encrypted = encryptXeroToken("my-secret-xero-oauth-token");
    const tamperedIv = Buffer.from(encrypted.iv, "base64");
    const firstByte = tamperedIv.at(0);
    expect(firstByte).toBeDefined();
    if (firstByte !== undefined) {
      tamperedIv[0] = firstByte === 0 ? 1 : firstByte - 1;
    }

    expect(() =>
      decryptXeroToken({
        ...encrypted,
        iv: tamperedIv.toString("base64"),
      })
    ).toThrow();
  });
});

describe("tryDecryptXeroToken", () => {
  const originalEnv = process.env.XERO_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY =
      "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=";
  });

  afterEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = originalEnv;
  });

  it("returns ok: true with decrypted plaintext for valid ciphertext, iv, and auth tag", () => {
    const originalText = "my-secret-xero-oauth-token";
    const encrypted = encryptXeroToken(originalText);

    const result = tryDecryptXeroToken(encrypted);
    expect(result).toEqual({ ok: true, token: originalText });
  });

  it("returns ok: false when iv is null and does not throw", () => {
    const result = tryDecryptXeroToken({
      authTag: "auth-tag",
      encrypted: "encrypted-token",
      iv: null,
      keyVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(MISSING_TOKEN_COMPONENTS_ERROR);
    }
  });

  it("returns ok: false when authTag is null and does not throw", () => {
    const result = tryDecryptXeroToken({
      authTag: null,
      encrypted: "encrypted-token",
      iv: "iv",
      keyVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(MISSING_TOKEN_COMPONENTS_ERROR);
    }
  });

  it("returns ok: true with empty string when encrypted is empty string", () => {
    const result = tryDecryptXeroToken({
      authTag: null,
      encrypted: "",
      iv: null,
      keyVersion: 1,
    });
    expect(result).toEqual({ ok: true, token: "" });
  });

  it("decryptXeroToken still throws for missing iv or authTag while tryDecryptXeroToken returns ok: false", () => {
    expect(() =>
      decryptXeroToken({
        authTag: "auth-tag",
        encrypted: "encrypted-token",
        iv: null,
        keyVersion: 1,
      })
    ).toThrowError(MISSING_TOKEN_COMPONENTS_ERROR);

    expect(
      tryDecryptXeroToken({
        authTag: "auth-tag",
        encrypted: "encrypted-token",
        iv: null,
        keyVersion: 1,
      }).ok
    ).toBe(false);
  });
});
