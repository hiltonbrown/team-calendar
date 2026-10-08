import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  authority: vi.fn(),
  durable: vi.fn(),
  manifest: {
    runId: "fixture-run",
    target: {
      database: "fixture",
      hostname: "fixture.neon.tech",
      role: "fixture",
    },
  },
  readDigest: vi.fn(),
  release: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawn }));
vi.mock("./active-run-registry.js", () => ({
  acquireActiveRun: mocks.acquire,
  assertActiveRunOwner: vi.fn(),
  persistCatalogueDigest: vi.fn(),
  readCatalogueDigest: mocks.readDigest,
  releaseActiveRun: mocks.release,
}));
vi.mock("./consumer-isolation.js", () => ({
  assertConsumerIsolationReadBack: vi.fn(),
}));
vi.mock("./database-guard.js", () => ({
  assertDurableManifestReadBack: mocks.durable,
  assertLiveDatabaseAuthority: mocks.authority,
}));
vi.mock("./integration-inventory.js", () => ({
  assertExpectedIntegrationInventory: vi.fn(),
  discoverIntegrationTests: () => [],
}));
const originalArgv = process.argv;
const candidateSha = "a".repeat(40);
let evidenceDir: string;
function report() {
  const json: unknown = JSON.parse(
    readFileSync(join(evidenceDir, "live-integration.json"), "utf8")
  );
  return {
    json,
  };
}
function requestEvidence() {
  process.argv.push("--evidence-dir", evidenceDir);
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  evidenceDir = mkdtempSync(join(tmpdir(), "xero-runner-evidence-"));
  mocks.acquire.mockReset().mockResolvedValue("acquired");
  mocks.authority.mockReset().mockReturnValue(mocks.manifest);
  mocks.durable.mockReset().mockResolvedValue(undefined);
  mocks.readDigest.mockReset().mockResolvedValue("catalogue");
  mocks.spawn.mockReset().mockImplementation((command: string) => {
    if (command === "git") {
      return { status: 0, stdout: `${candidateSha}\n` };
    }
    throw new Error("Unconfigured subprocess in runner test");
  });
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
  rmSync(evidenceDir, { force: true, recursive: true });
});
function results(cleanupStatus: number, testStatus = 0) {
  const digest = JSON.stringify({ outsideOwnedCatalogueDigest: "catalogue" });
  mocks.spawn
    .mockReturnValueOnce({ status: 0 })
    .mockReturnValueOnce({ status: 0, stdout: digest })
    .mockReturnValueOnce({ status: testStatus })
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

describe("protected runner evidence failure paths", () => {
  it.each(["missing authority", "malformed protected manifest"])(
    "writes bounded authority failure evidence without cleanup for %s",
    async (reason) => {
      requestEvidence();
      const original = new Error(reason);
      mocks.authority.mockImplementation(() => {
        throw original;
      });
      await expect(import("./run-live-integration.js")).rejects.toBe(original);
      expect(mocks.acquire).not.toHaveBeenCalled();
      expect(mocks.release).not.toHaveBeenCalled();
      expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith(
        "git",
        ["rev-parse", "HEAD"],
        expect.objectContaining({ encoding: "utf8" })
      );
      expect(report().json).toMatchObject({
        candidateSha,
        runner: {
          cleanupStatus: "NOT_VERIFIED",
          exitCode: 1,
          fenceState: "not_acquired",
          inventoryStatus: "NOT_VERIFIED",
          outcome: "FAIL",
          phase: "authority",
        },
      });
    }
  );

  it("retains snapshot failure phase after successful cleanup without releasing the fence", async () => {
    requestEvidence();
    mocks.spawn
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 3, stderr: "synthetic snapshot failure" })
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ outsideOwnedCatalogueDigest: "catalogue" }),
      });
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "synthetic snapshot failure"
    );
    expect(mocks.release).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(report().json).toMatchObject({
      runner: {
        cleanupStatus: "PASS",
        failurePhase: "snapshot",
        fenceState: "held",
        inventoryStatus: "NOT_VERIFIED",
        outcome: "FAIL",
        phase: "cleanup",
      },
    });
  });
  it("preserves nonzero test exit and releases only after verified cleanup while recording both outcomes", async () => {
    requestEvidence();
    results(0, 4);
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(4);
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(report().json).toMatchObject({
      runner: {
        cleanupStatus: "PASS",
        exitCode: 4,
        failurePhase: "tests",
        fenceState: "released",
        inventoryStatus: "FAIL",
        outcome: "FAIL",
      },
    });
  });
  it("keeps successful inventory exit zero with a bounded integration result", async () => {
    requestEvidence();
    results(0);
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(report().json).toMatchObject({
      runner: {
        cleanupStatus: "PASS",
        exitCode: 0,
        fenceState: "released",
        inventoryStatus: "PASS",
        outcome: "PASS",
      },
    });
  });
  it("writes cleanup failure evidence and preserves the ownership fence", async () => {
    requestEvidence();
    results(7);
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(7);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(report().json).toMatchObject({
      runner: {
        cleanupStatus: "FAIL",
        exitCode: 7,
        failurePhase: "cleanup",
        fenceState: "held",
        inventoryStatus: "PASS",
        outcome: "FAIL",
        phase: "cleanup",
      },
    });
  });
  it("records recovery cleanup without rerunning inventory tests", async () => {
    requestEvidence();
    process.argv.push("--recover");
    mocks.acquire.mockResolvedValue("interrupted");
    mocks.spawn.mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({ outsideOwnedCatalogueDigest: "catalogue" }),
    });
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    expect(mocks.spawn.mock.calls.map((call) => call[0])).toEqual([
      "bun",
      "git",
    ]);
    expect(mocks.spawn.mock.calls[0]?.[1]).toContain("--apply");
    expect(mocks.readDigest).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(report().json).toMatchObject({
      runner: {
        cleanupStatus: "PASS",
        fenceState: "released",
        inventoryStatus: "NOT_VERIFIED",
        outcome: "PASS",
      },
    });
  });
  it("emits evidence for recovery no-op without dispatching cleanup or tests", async () => {
    requestEvidence();
    process.argv.push("--recover-if-owned");
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.spawn.mock.calls.map((call) => call[0])).toEqual(["git"]);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(report().json).toMatchObject({
      runner: {
        cleanupStatus: "NOT_VERIFIED",
        fenceState: "released",
        inventoryStatus: "NOT_VERIFIED",
        outcome: "PASS",
        phase: "complete",
      },
    });
  });

  it("preserves a nonzero inventory exit if evidence output also fails", async () => {
    const blockedDirectory = join(evidenceDir, "regular-file");
    writeFileSync(blockedDirectory, "synthetic");
    process.argv.push("--evidence-dir", blockedDirectory);
    results(0, 2);
    await expect(import("./run-live-integration.js")).rejects.toThrow(
      "intercepted process exit"
    );
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(2);
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(process.stderr.write).toHaveBeenCalledWith(
      "Integration evidence output failed; original runner failure preserved.\n"
    );
  });
  it("makes writer failure primary after an otherwise successful inventory run", async () => {
    const blockedDirectory = join(evidenceDir, "regular-file");
    writeFileSync(blockedDirectory, "synthetic");
    process.argv.push("--evidence-dir", blockedDirectory);
    results(0);
    await expect(import("./run-live-integration.js")).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(process.exit).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("preserves the original authority error if evidence output also fails", async () => {
    const original = new Error("original authority failure");
    mocks.authority.mockImplementation(() => {
      throw original;
    });
    const blockedDirectory = join(evidenceDir, "regular-file");
    writeFileSync(blockedDirectory, "synthetic");
    process.argv.push("--evidence-dir", blockedDirectory);
    await expect(import("./run-live-integration.js")).rejects.toBe(original);
    expect(process.stderr.write).toHaveBeenCalledWith(
      "Integration evidence output failed; original runner failure preserved.\n"
    );
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("writes integration result artifact in a real missing-manifest invocation without attempting authority", async () => {
    const { spawnSync } =
      await vi.importActual<typeof import("node:child_process")>(
        "node:child_process"
      );
    const root = resolve(import.meta.dirname, "../..");
    const result = spawnSync(
      "bun",
      [
        "--no-env-file",
        "tooling/release/run-live-integration.ts",
        "--evidence-dir",
        evidenceDir,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { NODE_ENV: "test", PATH: process.env.PATH },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "A protected release manifest path is required"
    );
    expect(report().json).toMatchObject({
      runner: {
        cleanupStatus: "NOT_VERIFIED",
        fenceState: "not_acquired",
        inventoryStatus: "NOT_VERIFIED",
        outcome: "FAIL",
        phase: "authority",
      },
    });
  });
});
