import type { ReleaseManifest } from "./database-guard.js";

export const buildLiveIntegrationEnvironment = (
  environment: NodeJS.ProcessEnv,
  manifest: ReleaseManifest,
  manifestPath: string
): NodeJS.ProcessEnv => ({
  ...environment,
  ALLOW_TRANSACTION_ROLLBACK_TESTS: "I_ACKNOWLEDGE_TRANSACTION_ROLLBACK",
  TC_EXPECTED_DATABASE_HOST: manifest.target.hostname,
  TC_EXPECTED_DATABASE_NAME: manifest.target.database,
  TC_EXPECTED_DATABASE_ROLE: manifest.target.role,
  TC_RELEASE_DURABLE_VERIFIED: manifest.runId,
  TC_RELEASE_MANIFEST: manifestPath,
});
