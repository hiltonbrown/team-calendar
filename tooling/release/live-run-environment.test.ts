import { describe, expect, it } from "vitest";
import type { ReleaseManifest } from "./database-guard.js";
import {
  buildLiveIntegrationEnvironment,
  buildLiveIntegrationTestEnvironment,
} from "./live-run-environment.js";

describe("buildLiveIntegrationEnvironment", () => {
  it("derives rollback authority and the exact target from the validated manifest", () => {
    const manifest = {
      runId: "00000000-0000-4000-8000-000000000001",
      target: {
        database: "release_db",
        hostname: "ep-release.example.neon.tech",
        role: "release_owner",
      },
    } as ReleaseManifest;

    const result = buildLiveIntegrationEnvironment(
      { EXISTING_VALUE: "preserved", NODE_ENV: "test" },
      manifest,
      "/protected/manifest.json"
    );

    expect(result).toMatchObject({
      ALLOW_TRANSACTION_ROLLBACK_TESTS: "I_ACKNOWLEDGE_TRANSACTION_ROLLBACK",
      EXISTING_VALUE: "preserved",
      TC_EXPECTED_DATABASE_HOST: "ep-release.example.neon.tech",
      TC_EXPECTED_DATABASE_NAME: "release_db",
      TC_EXPECTED_DATABASE_ROLE: "release_owner",
      TC_RELEASE_ACTIVE_RUN_VERIFIED: manifest.runId,
      TC_RELEASE_DURABLE_VERIFIED: manifest.runId,
      TC_RELEASE_MANIFEST: "/protected/manifest.json",
    });
  });
});

describe("buildLiveIntegrationTestEnvironment", () => {
  it("isolates only the test child while preserving live guard proof and parent credentials", () => {
    const parent: NodeJS.ProcessEnv = {
      ALLOW_LIVE_DATABASE_TESTS: "approved",
      INNGEST_SIGNING_KEY: "synthetic-signing-key",
      KV_REST_API_TOKEN: "synthetic-guard-token",
      KV_REST_API_URL: "https://guard.example.com",
      NODE_ENV: "test",
      TC_RELEASE_ACTIVE_RUN_VERIFIED: "run",
      TC_RELEASE_CONSUMERS_VERIFIED: "run",
      TC_RELEASE_DURABLE_VERIFIED: "run",
      TC_RELEASE_MANIFEST: "/protected/manifest.json",
      TC_TEST_KV_REST_API_TOKEN: "untrusted-token",
      TC_TEST_KV_REST_API_URL: "https://untrusted.example.com",
      TURBO_CONCURRENCY: "2",
    };
    const child = buildLiveIntegrationTestEnvironment(parent);
    expect(child.KV_REST_API_URL).toBeUndefined();
    expect(child.KV_REST_API_TOKEN).toBeUndefined();
    expect(child.TC_TEST_KV_REST_API_URL).toBe(parent.KV_REST_API_URL);
    expect(child.TC_TEST_KV_REST_API_TOKEN).toBe(parent.KV_REST_API_TOKEN);
    expect(child).toMatchObject({
      ALLOW_LIVE_DATABASE_TESTS: "approved",
      TC_RELEASE_ACTIVE_RUN_VERIFIED: "run",
      TC_RELEASE_CONSUMERS_VERIFIED: "run",
      TC_RELEASE_DURABLE_VERIFIED: "run",
      TC_RELEASE_MANIFEST: "/protected/manifest.json",
      TURBO_CONCURRENCY: "2",
    });
    expect(child.INNGEST_SIGNING_KEY).toBe("synthetic-signing-key");
    expect(parent.INNGEST_SIGNING_KEY).toBe("synthetic-signing-key");
    expect(parent.KV_REST_API_TOKEN).toBe("synthetic-guard-token");
  });
  it.each([
    {},
    { KV_REST_API_URL: "https://guard.example.com" },
    { KV_REST_API_TOKEN: "synthetic-guard-token" },
  ])(
    "fails closed for incomplete guard credentials without disclosing values",
    (environment) => {
      expect(() =>
        buildLiveIntegrationTestEnvironment({
          ...environment,
          NODE_ENV: "test",
        })
      ).toThrow("Protected integration KV configuration is required");
    }
  );
});
