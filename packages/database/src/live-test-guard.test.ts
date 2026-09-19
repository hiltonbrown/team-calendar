import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";

const originalEnvironment = { ...process.env };

beforeEach(() => {
  delete process.env.TC_SOURCE_GATES;
});

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

  it("denies direct live invocation without the runner-verified active lock", () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const manifestPath = join(
      mkdtempSync(join(tmpdir(), "tc-guard-")),
      "manifest.json"
    );
    writeFileSync(
      manifestPath,
      JSON.stringify({
        active: true,
        durableManifestConfirmed: true,
        namespace: `release:run:${runId}`,
        runId,
        target: {
          database: "release_db",
          endpointId: "ep-release",
          hostname: "ep-release.example.neon.tech",
          role: "release_owner",
        },
        version: 1,
      })
    );
    Object.assign(process.env, {
      ALLOW_LIVE_DATABASE_TESTS: "I_ACKNOWLEDGE_LIVE_MUTATION",
      DATABASE_URL:
        "postgresql://release_owner:private@ep-release.example.neon.tech/release_db",
      NODE_ENV: "test",
      TC_RELEASE_DURABLE_VERIFIED: runId,
      TC_RELEASE_MANIFEST: manifestPath,
      TC_RELEASE_RUN_ID: runId,
    });
    delete process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED;

    expect(() => assertTestDatabaseConnectionAllowed()).toThrow(
      "protected manifest"
    );
  });
});
