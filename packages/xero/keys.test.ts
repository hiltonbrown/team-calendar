import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keys } from "./keys";

describe("XERO_TOKEN_ENCRYPTION_KEY env validation at startup", () => {
  const originalEnv = process.env.XERO_TOKEN_ENCRYPTION_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Temporarily set NODE_ENV to production or development to run startup validation.
    // In test environment, the auto-validation on module load is skipped,
    // but calling keys() manually will still trigger schema validation.
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("throws when XERO_TOKEN_ENCRYPTION_KEY is absent", () => {
    delete process.env.XERO_TOKEN_ENCRYPTION_KEY;
    expect(() => keys()).toThrowError("Invalid environment variables");
  });

  it("throws when XERO_TOKEN_ENCRYPTION_KEY is malformed (not valid base64)", () => {
    // Contains invalid characters like '%'
    process.env.XERO_TOKEN_ENCRYPTION_KEY =
      "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvIQ=%";
    expect(() => keys()).toThrowError("Invalid environment variables");
  });

  it("throws when XERO_TOKEN_ENCRYPTION_KEY is wrong-length (not 32 bytes decoded)", () => {
    // 16 bytes: "this is 16 bytes" in base64
    process.env.XERO_TOKEN_ENCRYPTION_KEY = "dGhpcyBpcyAxNiBieXRlcw==";
    expect(() => keys()).toThrowError("Invalid environment variables");
  });

  it("passes when XERO_TOKEN_ENCRYPTION_KEY is a valid 32-byte base64-encoded key", () => {
    // 32 bytes: "this is a 32-byte key for xero!1" in base64
    process.env.XERO_TOKEN_ENCRYPTION_KEY =
      "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=";
    expect(() => keys()).not.toThrow();
  });
});

describe("Xero encryption keyring configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  function configure() {
    vi.stubEnv(
      "XERO_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64")
    );
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION", undefined);
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEYS_JSON", undefined);
  }

  it("defaults to version one with legacy configuration", () => {
    configure();
    expect(keys().XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION).toBeUndefined();
    expect(keys().XERO_TOKEN_ENCRYPTION_KEYS_JSON).toBeUndefined();
  });

  it("allows a matching version-one definition and a present active version", () => {
    configure();
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION", "2");
    vi.stubEnv(
      "XERO_TOKEN_ENCRYPTION_KEYS_JSON",
      JSON.stringify({
        "1": process.env.XERO_TOKEN_ENCRYPTION_KEY,
        "2": Buffer.alloc(32, 8).toString("base64"),
      })
    );
    expect(keys().XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION).toBe("2");
  });

  it("rejects conflicting version one without disclosing key material", () => {
    configure();
    const conflicting = Buffer.alloc(32, 9).toString("base64");
    vi.stubEnv(
      "XERO_TOKEN_ENCRYPTION_KEYS_JSON",
      JSON.stringify({ "1": conflicting })
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => keys()).toThrow("Invalid environment variables");
      expect(JSON.stringify(spy.mock.calls)).toContain(
        "XERO_TOKEN_ENCRYPTION_KEYS_JSON"
      );
      expect(JSON.stringify(spy.mock.calls)).not.toContain(conflicting);
    } finally {
      spy.mockRestore();
    }
  });

  it.each(["0", "-1", "1.5", "01", "9007199254740992"])(
    "rejects invalid active version %s",
    (active) => {
      configure();
      vi.stubEnv("XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION", active);
      expect(() => keys()).toThrow("Invalid environment variables");
    }
  );

  it("rejects a missing active key", () => {
    configure();
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION", "2");
    expect(() => keys()).toThrow("Invalid environment variables");
  });

  it.each([
    "invalid-json",
    "[]",
    '{"2":"invalid"}',
    '{"0":"invalid"}',
    '{"2":42}',
  ])("rejects invalid keyring %s", (ring) => {
    configure();
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_KEYS_JSON", ring);
    expect(() => keys()).toThrow("Invalid environment variables");
  });
});
