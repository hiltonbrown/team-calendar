import { afterEach, describe, expect, it } from "vitest";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("database unit-test isolation", () => {
  it("denies a test connection when only DATABASE_URL is present", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://user:password@localhost/database";
    delete process.env.ALLOW_LIVE_DATABASE_TESTS;
    expect(() => assertTestDatabaseConnectionAllowed()).toThrow(
      "disabled in unit tests"
    );
  });

  it("does not constrain production client construction", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertTestDatabaseConnectionAllowed()).not.toThrow();
  });

  it("denies source-gate connections even when a framework changes NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    process.env.TC_SOURCE_GATES = "1";
    expect(() => assertTestDatabaseConnectionAllowed()).toThrow(
      "source-only gates"
    );
  });
});
