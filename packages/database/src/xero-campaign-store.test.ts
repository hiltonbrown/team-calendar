import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  XeroCampaignStore,
  xeroCampaignStoreCredentials,
  xeroCampaignStoreInput,
} from "./xero-campaign-store";

const runId = "00000000-0000-4000-8000-000000000001";
const domainId = "00000000-0000-4000-8000-000000000002";
const directories: string[] = [];
const variables = [
  "TC_SOURCE_GATES",
  "ALLOW_LIVE_DATABASE_TESTS",
  "ALLOW_LOCAL_DATABASE_TESTS",
  "DATABASE_URL",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "TC_TEST_KV_REST_API_URL",
  "TC_TEST_KV_REST_API_TOKEN",
  "TC_RELEASE_MANIFEST",
  "TC_RELEASE_RUN_ID",
  "TC_RELEASE_DURABLE_VERIFIED",
  "TC_RELEASE_ACTIVE_RUN_VERIFIED",
  "TC_RELEASE_CONSUMERS_VERIFIED",
];
beforeEach(() => {
  for (const name of variables) {
    vi.stubEnv(name, undefined);
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});
function protectedChild() {
  const directory = mkdtempSync(join(tmpdir(), "tc-campaign-store-test-"));
  directories.push(directory);
  const path = join(directory, "manifest.json");
  writeFileSync(
    path,
    JSON.stringify({
      active: true,
      consumerIsolation: { kind: "unregistered-inngest-environment" },
      durableManifestConfirmed: true,
      mode: "database-fixture",
      namespace: `release:run:${runId}`,
      runId,
      target: {
        database: "fixture",
        endpointId: "ep-fixture",
        hostname: "ep-fixture.example.neon.tech",
        role: "fixture_role",
      },
      version: 1,
    }),
    { mode: 0o600 }
  );
  // The release tooling separately tests construction of this protected child contract.
  const child: NodeJS.ProcessEnv = {
    ALLOW_LIVE_DATABASE_TESTS: "I_ACKNOWLEDGE_LIVE_MUTATION",
    DATABASE_URL:
      "postgresql://fixture_role:synthetic@ep-fixture.example.neon.tech/fixture",
    NODE_ENV: "test",
    TC_RELEASE_ACTIVE_RUN_VERIFIED: runId,
    TC_RELEASE_CONSUMERS_VERIFIED: runId,
    TC_RELEASE_DURABLE_VERIFIED: runId,
    TC_RELEASE_MANIFEST: path,
    TC_RELEASE_RUN_ID: runId,
    TC_TEST_KV_REST_API_TOKEN: "fixture-store-token",
    TC_TEST_KV_REST_API_URL: "https://fixture-control.example",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    XERO_CREDENTIAL_DOMAIN_ID: domainId,
  };
  for (const [name, value] of Object.entries(child)) {
    vi.stubEnv(name, value);
  }
  return child;
}

describe("campaign store protected child credentials", () => {
  it("uses the runner's dedicated pair through the default runtime store without restoring regular KV", async () => {
    const child = protectedChild();
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({
          result: [
            JSON.stringify({
              credentialDomainId: domainId,
              databaseTargetHash: `sha256:${"a".repeat(64)}`,
              version: 1,
            }),
            null,
            runId,
            null,
          ],
        })
      )
    );
    vi.stubGlobal("fetch", transport);
    expect(xeroCampaignStoreInput()).toMatchObject({
      token: child.TC_TEST_KV_REST_API_TOKEN,
      url: child.TC_TEST_KV_REST_API_URL,
    });
    const snapshot = await new XeroCampaignStore().readOrganisation(domainId);
    expect(snapshot.control).toBeNull();
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[0]).toBe(child.TC_TEST_KV_REST_API_URL);
    expect(process.env.KV_REST_API_URL).toBeUndefined();
    expect(process.env.KV_REST_API_TOKEN).toBeUndefined();
  });
  it.each(["TC_TEST_KV_REST_API_URL", "TC_TEST_KV_REST_API_TOKEN"])(
    "rejects missing %s even if regular KV is configured",
    (name) => {
      protectedChild();
      vi.stubEnv(name, undefined);
      vi.stubEnv("KV_REST_API_URL", "https://ordinary.example");
      vi.stubEnv("KV_REST_API_TOKEN", "ordinary-token");
      expect(() => xeroCampaignStoreCredentials()).toThrow(CAMPAIGN_DENIED);
    }
  );
  it.each([
    "TC_RELEASE_DURABLE_VERIFIED",
    "TC_RELEASE_ACTIVE_RUN_VERIFIED",
    "TC_RELEASE_CONSUMERS_VERIFIED",
    "TC_RELEASE_MANIFEST",
    "ALLOW_LIVE_DATABASE_TESTS",
  ])("rejects incomplete protected proof %s", (name) => {
    protectedChild();
    vi.stubEnv(name, undefined);
    expect(() => xeroCampaignStoreCredentials()).toThrow(CAMPAIGN_DENIED);
  });
  it("rejects a mismatched target and source-gate execution", () => {
    protectedChild();
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://fixture_role:synthetic@ep-other.example.neon.tech/fixture"
    );
    expect(() => xeroCampaignStoreCredentials()).toThrow(CAMPAIGN_DENIED);
    vi.stubEnv("TC_SOURCE_GATES", "1");
    expect(() => xeroCampaignStoreCredentials()).toThrow(CAMPAIGN_DENIED);
  });
  it.each(["production", "development"])(
    "cannot select dedicated credentials in %s",
    (environment) => {
      protectedChild();
      vi.stubEnv("NODE_ENV", environment);
      expect(() => xeroCampaignStoreCredentials()).toThrow(CAMPAIGN_DENIED);
    }
  );
  it("preserves ordinary runtime credentials when no protected test pair is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KV_REST_API_URL", "https://ordinary.example");
    vi.stubEnv("KV_REST_API_TOKEN", "ordinary-token");
    expect(xeroCampaignStoreCredentials()).toEqual({
      token: "ordinary-token",
      url: "https://ordinary.example",
    });
  });
});

const CAMPAIGN_DENIED = /^xero_campaign_admission_denied$/;

it("preserves acknowledged parent tooling credentials outside a protected test child", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ALLOW_LIVE_DATABASE_TESTS", "I_ACKNOWLEDGE_LIVE_MUTATION");
  vi.stubEnv("KV_REST_API_URL", "https://ordinary.example");
  vi.stubEnv("KV_REST_API_TOKEN", "ordinary-token");
  expect(xeroCampaignStoreCredentials()).toEqual({
    token: "ordinary-token",
    url: "https://ordinary.example",
  });
});
