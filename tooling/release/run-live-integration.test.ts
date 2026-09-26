import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  manifest: {
    runId: "fixture-run",
    target: {
      database: "fixture",
      hostname: "fixture.neon.tech",
      role: "fixture",
    },
  },
  release: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawn }));
vi.mock("./active-run-registry.js", () => ({
  acquireActiveRun: vi.fn().mockResolvedValue("acquired"),
  assertActiveRunOwner: vi.fn(),
  persistCatalogueDigest: vi.fn(),
  readCatalogueDigest: vi.fn().mockResolvedValue("catalogue"),
  releaseActiveRun: mocks.release,
}));
vi.mock("./consumer-isolation.js", () => ({
  assertConsumerIsolationReadBack: vi.fn(),
}));
vi.mock("./database-guard.js", () => ({
  assertDurableManifestReadBack: vi.fn(),
  assertLiveDatabaseAuthority: () => mocks.manifest,
}));
vi.mock("./integration-inventory.js", () => ({
  assertExpectedIntegrationInventory: vi.fn(),
  discoverIntegrationTests: () => [],
}));
const originalArgv = process.argv;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.argv = ["bun", "runner", "--manifest", "/protected/fixture.json"];
  vi.stubEnv("KV_REST_API_URL", "https://fixture-guard.example.com");
  vi.stubEnv("KV_REST_API_TOKEN", "synthetic-guard-token");
  vi.stubEnv("INNGEST_SIGNING_KEY", "synthetic-signing-key");
  vi.stubEnv("TC_RELEASE_CONSUMERS_VERIFIED", "fixture-run");
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("intercepted process exit");
  });
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});
afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function results(cleanupStatus: number) {
  const digest = JSON.stringify({ outsideOwnedCatalogueDigest: "catalogue" });
  mocks.spawn.mockResolvedValue(undefined);
  mocks.spawn
    .mockReturnValueOnce({ status: 0 })
    .mockReturnValueOnce({ status: 0, stdout: digest })
    .mockReturnValueOnce({ status: 0 })
    .mockReturnValueOnce({
      status: cleanupStatus,
      stdout: cleanupStatus ? "cleanup refused" : digest,
    });
}
describe("protected integration child boundary", () => {
  it("keeps guard KV credentials in cleanup while isolating the integration test child", async () => {
    results(0);
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    const { calls } = mocks.spawn.mock;
    expect(calls).toHaveLength(4);
    for (const index of [0, 1, 3]) {
      expect(calls[index][2].env.KV_REST_API_TOKEN).toBe(
        "synthetic-guard-token"
      );
    }
    expect(calls[2][1]).toEqual(["run", "test:integration"]);
    expect(calls[2][2].env.KV_REST_API_TOKEN).toBeUndefined();
    expect(calls[2][2].env.TC_TEST_KV_REST_API_TOKEN).toBe(
      "synthetic-guard-token"
    );
    expect(calls[2][2].env.TC_RELEASE_ACTIVE_RUN_VERIFIED).toBe("fixture-run");
    expect(calls[2][2].env).toMatchObject({
      ALLOW_TRANSACTION_ROLLBACK_TESTS: "I_ACKNOWLEDGE_TRANSACTION_ROLLBACK",
      INNGEST_SIGNING_KEY: "synthetic-signing-key",
      TC_RELEASE_CONSUMERS_VERIFIED: "fixture-run",
      TC_RELEASE_DURABLE_VERIFIED: "fixture-run",
      TC_RELEASE_MANIFEST: "/protected/fixture.json",
    });
    expect(process.env.KV_REST_API_TOKEN).toBe("synthetic-guard-token");
    expect(process.env.KV_REST_API_URL).toBe(
      "https://fixture-guard.example.com"
    );
    expect(process.env.INNGEST_SIGNING_KEY).toBe("synthetic-signing-key");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("retains the active-run fence when shared-store or database cleanup fails", async () => {
    results(1);
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    expect(mocks.release).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
