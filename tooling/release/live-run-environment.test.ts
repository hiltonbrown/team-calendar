import { describe, expect, it } from "vitest";
import type { ReleaseManifest } from "./database-guard.js";
import { buildLiveIntegrationEnvironment } from "./live-run-environment.js";

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
