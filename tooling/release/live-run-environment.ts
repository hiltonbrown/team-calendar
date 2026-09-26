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
  TC_RELEASE_ACTIVE_RUN_VERIFIED: manifest.runId,
  TC_RELEASE_DURABLE_VERIFIED: manifest.runId,
  TC_RELEASE_MANIFEST: manifestPath,
});

// Authority and cleanup retain their guard credentials. Only fake-provider test children
// receive the dedicated fixture pair, so their default Xero limiter remains in memory.
export function buildLiveIntegrationTestEnvironment(
  environment: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  if (!(environment.KV_REST_API_URL && environment.KV_REST_API_TOKEN)) {
    throw new Error("Protected integration KV configuration is required");
  }
  const { KV_REST_API_URL, KV_REST_API_TOKEN, ...guardProof } = environment;
  return {
    ...guardProof,
    TC_TEST_KV_REST_API_TOKEN: KV_REST_API_TOKEN,
    TC_TEST_KV_REST_API_URL: KV_REST_API_URL,
  };
}
