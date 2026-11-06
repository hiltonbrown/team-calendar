import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";

const originalEnvironment = { ...process.env };

const configureProtectedRemoteRun = () => {
  const runId = "00000000-0000-4000-8000-000000000001";
  const ownerUrl =
    "postgresql://release_owner:owner-private@ep-release.example.neon.tech/release_db";
  const appUrl =
    "postgresql://team_calendar_app:app-private@ep-release.example.neon.tech/release_db";
  const manifestPath = join(
    mkdtempSync(join(tmpdir(), "tc-restricted-guard-")),
    "manifest.json"
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      active: true,
      consumerIsolation: { kind: "unregistered-inngest-environment" },
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
    DATABASE_APP_URL: appUrl,
    DATABASE_URL: ownerUrl,
    NODE_ENV: "test",
    TC_RELEASE_ACTIVE_RUN_VERIFIED: runId,
    TC_RELEASE_CONSUMERS_VERIFIED: runId,
    TC_RELEASE_DURABLE_VERIFIED: runId,
    TC_RELEASE_MANIFEST: manifestPath,
    TC_RELEASE_RUN_ID: runId,
  });
  return { appUrl, ownerUrl };
};

beforeEach(() => {
  delete process.env.TC_SOURCE_GATES;
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnvironment };
});

describe("database unit-test isolation", () => {
  it("admits the exact configured restricted client under the same protected owner target", () => {
    const { appUrl, ownerUrl } = configureProtectedRemoteRun();
    expect(() => assertTestDatabaseConnectionAllowed(ownerUrl)).not.toThrow();
    expect(() => assertTestDatabaseConnectionAllowed(appUrl)).not.toThrow();
  });

  it.each([
    "postgresql://team_calendar_app:other-private@ep-release.example.neon.tech/release_db",
    "postgresql://another_app:app-private@ep-release.example.neon.tech/release_db",
  ])("rejects an unconfigured restricted connection: %s", (appUrl) => {
    configureProtectedRemoteRun();
    expect(() => assertTestDatabaseConnectionAllowed(appUrl)).toThrow(
      "protected manifest"
    );
  });

  it.each([
    "postgresql://team_calendar_app:app-private@ep-other.example.neon.tech/release_db",
    "postgresql://team_calendar_app:app-private@ep-release.example.neon.tech/other_db",
    "postgresql://team_calendar_app:app-private@ep-release.example.neon.tech:5433/release_db",
    "postgresql://release_owner:app-private@ep-release.example.neon.tech/release_db",
  ])(
    "rejects a configured app URL outside the restricted target: %s",
    (appUrl) => {
      configureProtectedRemoteRun();
      process.env.DATABASE_APP_URL = appUrl;
      expect(() => assertTestDatabaseConnectionAllowed(appUrl)).toThrow(
        "protected manifest"
      );
    }
  );

  it("requires the configured owner to match the manifest before admitting the app", () => {
    const { appUrl } = configureProtectedRemoteRun();
    process.env.DATABASE_URL =
      "postgresql://release_owner:owner-private@ep-other.example.neon.tech/release_db";
    expect(() => assertTestDatabaseConnectionAllowed(appUrl)).toThrow(
      "protected manifest"
    );
  });

  it.each([
    ["TC_RELEASE_DURABLE_VERIFIED", "protected manifest"],
    ["TC_RELEASE_ACTIVE_RUN_VERIFIED", "protected manifest"],
    ["TC_RELEASE_CONSUMERS_VERIFIED", "verified live Inngest inventory"],
  ])("retains %s proof for the restricted client", (key, message) => {
    const { appUrl } = configureProtectedRemoteRun();
    delete process.env[key];
    expect(() => assertTestDatabaseConnectionAllowed(appUrl)).toThrow(message);
  });

  it.each(["xero-e2e", "unknown-mode"])(
    "rejects foreign manifest mode %s rather than stripping it",
    (mode) => {
      const runId = "00000000-0000-4000-8000-000000000001";
      const manifestPath = join(
        mkdtempSync(join(tmpdir(), "tc-mode-")),
        "manifest.json"
      );
      writeFileSync(
        manifestPath,
        JSON.stringify({
          active: true,
          durableManifestConfirmed: true,
          mode,
          namespace: `release:run:${runId}`,
          runId,
          target: {
            database: "release_db",
            endpointId: "endpoint",
            hostname: "example.neon.tech",
            role: "owner",
          },
          version: 1,
        })
      );
      Object.assign(process.env, {
        ALLOW_LIVE_DATABASE_TESTS: "I_ACKNOWLEDGE_LIVE_MUTATION",
        DATABASE_URL: "postgresql://owner:unused@example.neon.tech/release_db",
        NODE_ENV: "test",
        TC_RELEASE_ACTIVE_RUN_VERIFIED: runId,
        TC_RELEASE_DURABLE_VERIFIED: runId,
        TC_RELEASE_MANIFEST: manifestPath,
        TC_RELEASE_RUN_ID: runId,
      });
      expect(() => assertTestDatabaseConnectionAllowed()).toThrow();
    }
  );
  it("denies a test connection when only DATABASE_URL is present", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.DATABASE_URL = "postgresql://user:password@localhost/database";
    delete process.env.ALLOW_LIVE_DATABASE_TESTS;
    expect(() => assertTestDatabaseConnectionAllowed()).toThrow(
      "disabled in unit tests"
    );
  });

  it("does not constrain production client construction", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertTestDatabaseConnectionAllowed()).not.toThrow();
  });

  it("denies source-gate connections even when a framework changes NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TC_SOURCE_GATES = "1";
    expect(() => assertTestDatabaseConnectionAllowed()).toThrow(
      "source-only gates"
    );
  });

  it.each([false, true])(
    "requires independently verified live guards with unregistered consumers=%s",
    (unregistered) => {
      const runId = "00000000-0000-4000-8000-000000000001";
      const manifestPath = join(
        mkdtempSync(join(tmpdir(), "tc-guard-")),
        "manifest.json"
      );
      writeFileSync(
        manifestPath,
        JSON.stringify({
          active: true,
          ...(unregistered
            ? {
                consumerIsolation: { kind: "unregistered-inngest-environment" },
              }
            : {}),
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
      process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED = runId;
      delete process.env.TC_RELEASE_CONSUMERS_VERIFIED;
      if (unregistered) {
        expect(() => assertTestDatabaseConnectionAllowed()).toThrow(
          "verified live Inngest inventory"
        );
        process.env.TC_RELEASE_CONSUMERS_VERIFIED = runId;
      }
      expect(() => assertTestDatabaseConnectionAllowed()).not.toThrow();
    }
  );

  it("permits local test connections when ALLOW_LOCAL_DATABASE_TESTS is enabled", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.ALLOW_LOCAL_DATABASE_TESTS = "1";
    process.env.DATABASE_URL =
      "postgresql://user:password@localhost:5432/test_db";

    expect(() => assertTestDatabaseConnectionAllowed()).not.toThrow();
  });

  it("permits 127.0.0.1 test connections when ALLOW_LOCAL_DATABASE_TESTS is enabled", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.ALLOW_LOCAL_DATABASE_TESTS = "1";
    process.env.DATABASE_URL =
      "postgresql://user:password@127.0.0.1:5432/test_db";

    expect(() => assertTestDatabaseConnectionAllowed()).not.toThrow();
  });

  it("denies remote database connections with ALLOW_LOCAL_DATABASE_TESTS", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.ALLOW_LOCAL_DATABASE_TESTS = "1";
    process.env.DATABASE_URL =
      "postgresql://user:password@remote.neon.tech/production_db";

    expect(() => assertTestDatabaseConnectionAllowed()).toThrow(
      "ALLOW_LOCAL_DATABASE_TESTS can only be used with a local database connection"
    );
  });
});

it("does not let a local owner URL authorize a remote app connection", () => {
  Object.assign(process.env, {
    ALLOW_LOCAL_DATABASE_TESTS: "1",
    DATABASE_URL: "postgresql://owner:unused@localhost/test",
    NODE_ENV: "test",
  });
  delete process.env.ALLOW_LIVE_DATABASE_TESTS;
  expect(() =>
    assertTestDatabaseConnectionAllowed(
      "postgresql://team_calendar_app:unused@example.neon.tech/test"
    )
  ).toThrow("local database");
});
