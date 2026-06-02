import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
