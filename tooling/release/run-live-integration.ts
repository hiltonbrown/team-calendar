import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  acquireActiveRun,
  assertActiveRunOwner,
  persistCatalogueDigest,
  readCatalogueDigest,
  releaseActiveRun,
} from "./active-run-registry.js";
import { assertConsumerIsolationReadBack } from "./consumer-isolation.js";
import {
  assertDurableManifestReadBack,
  assertLiveDatabaseAuthority,
} from "./database-guard.js";
import {
  assertExpectedIntegrationInventory,
  discoverIntegrationTests,
} from "./integration-inventory.js";
import {
  buildLiveIntegrationEnvironment,
  buildLiveIntegrationTestEnvironment,
} from "./live-run-environment.js";
import { type LiveRunMode, resolveLiveRunAction } from "./live-run-mode.js";

const runner: {
  cleanupStatus: string;
  exitCode: number;
  fenceState: string;
  inventoryStatus: string;
  outcome: string;
  phase: string;
  failurePhase?: string;
} = {
  cleanupStatus: "NOT_VERIFIED",
  exitCode: 1,
  fenceState: "not_acquired",
  inventoryStatus: "NOT_VERIFIED",
  outcome: "NOT_VERIFIED",
  phase: "authority",
};
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Evidence wrapper preserves the existing protected runner authority, recovery and cleanup sequence.
async function runLiveIntegration(): Promise<number> {
  const manifestFlag = process.argv.indexOf("--manifest");
  const manifestPath =
    manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
  const root = resolve(import.meta.dirname, "../..");
  if (!manifestPath) {
    throw new Error("A protected release manifest path is required");
  }
  const protectedManifestPath = manifestPath;
  const recoveryRequested = process.argv.includes("--recover");
  const recoverIfOwned = process.argv.includes("--recover-if-owned");
  const preacquired = process.argv.includes("--preacquired");
  if (
    [recoveryRequested, recoverIfOwned, preacquired].filter(Boolean).length > 1
  ) {
    throw new Error(
      "Choose only one of --recover, --recover-if-owned, or --preacquired"
    );
  }

  const manifest = assertLiveDatabaseAuthority({
    acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
    databaseUrl: process.env.DATABASE_URL,
    manifestPath: protectedManifestPath,
    runId: process.env.TC_RELEASE_RUN_ID,
  });
  await assertDurableManifestReadBack(manifest, {
    token: process.env.KV_REST_API_TOKEN,
    url: process.env.KV_REST_API_URL,
  });
  runner.phase = "ownership";
  const registryInput = {
    token: process.env.KV_REST_API_TOKEN,
    url: process.env.KV_REST_API_URL,
  };
  let activeState: "acquired" | "interrupted";
  runner.fenceState = "unknown";
  if (preacquired) {
    await assertActiveRunOwner(manifest, registryInput);
    activeState = "acquired";
  } else {
    activeState = await acquireActiveRun(manifest, registryInput);
  }
  runner.fenceState = activeState === "acquired" ? "held" : "unknown";
  let mode: LiveRunMode = "new";
  if (recoveryRequested) {
    mode = "recover";
  } else if (recoverIfOwned) {
    mode = "recover-if-owned";
  } else if (preacquired) {
    mode = "preacquired";
  }
  let action: ReturnType<typeof resolveLiveRunAction>;
  try {
    action = resolveLiveRunAction(activeState, mode);
    runner.fenceState = "held";
  } catch (error) {
    if (activeState === "acquired" && recoveryRequested) {
      await releaseActiveRun(manifest, registryInput);
      runner.fenceState = "released";
    }
    throw error;
  }
  if (action === "release-noop") {
    runner.phase = "release";
    await releaseActiveRun(manifest, registryInput);
    runner.fenceState = "released";
    runner.phase = "complete";
    return 0;
  }

  runner.phase = "inventory";
  const inventory = discoverIntegrationTests(root);
  try {
    assertExpectedIntegrationInventory(inventory);
  } catch (error) {
    runner.inventoryStatus = "FAIL";
    throw error;
  }

  const childEnvironment = buildLiveIntegrationEnvironment(
    process.env,
    manifest,
    protectedManifestPath
  );
  runner.phase = "consumer_isolation";
  await assertConsumerIsolationReadBack(manifest, {
    signingKey: process.env.INNGEST_SIGNING_KEY,
  });
  if (manifest.consumerIsolation) {
    childEnvironment.TC_RELEASE_CONSUMERS_VERIFIED = manifest.runId;
  }
  if (action === "run") {
    runner.phase = "baseline";
    const baseline = spawnSync(
      "bun",
      [
        "run",
        "tooling/release/cleanup.ts",
        "--manifest",
        protectedManifestPath,
        "--assert-clean",
      ],
      { cwd: root, env: childEnvironment, stdio: "inherit" }
    );
    if (baseline.status !== 0) {
      throw new Error(
        "Manifest-owned fixture baseline is not clean; recover the interrupted run before testing"
      );
    }
  }
  let status = 1;
  let cleanupSucceeded = false;
  let catalogueDigestBefore: string | undefined;
  const parseCatalogueDigest = (output: string) => {
    const line = output.trim().split("\n").at(-1);
    if (!line) {
      throw new Error("Cleanup did not return a catalogue digest");
    }
    const parsed = JSON.parse(line) as {
      outsideOwnedCatalogueDigest?: unknown;
    };
    if (typeof parsed.outsideOwnedCatalogueDigest !== "string") {
      throw new Error("Cleanup returned an invalid catalogue digest");
    }
    return parsed.outsideOwnedCatalogueDigest;
  };
  try {
    if (action === "run") {
      runner.phase = "snapshot";
      const snapshot = spawnSync(
        "bun",
        [
          "run",
          "tooling/release/cleanup.ts",
          "--manifest",
          protectedManifestPath,
          "--dry-run",
        ],
        { cwd: root, encoding: "utf8", env: childEnvironment }
      );
      if (snapshot.status !== 0) {
        throw new Error(snapshot.stderr || snapshot.stdout);
      }
      catalogueDigestBefore = parseCatalogueDigest(snapshot.stdout);
      await persistCatalogueDigest(
        manifest,
        catalogueDigestBefore,
        registryInput
      );
      await assertConsumerIsolationReadBack(manifest, {
        signingKey: process.env.INNGEST_SIGNING_KEY,
      });
      runner.phase = "tests";
      const result = spawnSync("bun", ["run", "test:integration"], {
        cwd: root,
        env: buildLiveIntegrationTestEnvironment(childEnvironment),
        stdio: "inherit",
      });
      status = result.status ?? 1;
      runner.inventoryStatus = status === 0 ? "PASS" : "FAIL";
      if (status !== 0) {
        runner.failurePhase = "tests";
      }
    } else {
      catalogueDigestBefore = await readCatalogueDigest(
        manifest,
        registryInput
      );
    }
  } catch (error) {
    runner.failurePhase = runner.phase;
    throw error;
  } finally {
    runner.phase = "cleanup";
    const cleanup = spawnSync(
      "bun",
      [
        "run",
        "tooling/release/cleanup.ts",
        "--manifest",
        protectedManifestPath,
        "--apply",
      ],
      { cwd: root, encoding: "utf8", env: childEnvironment }
    );
    if (cleanup.status === 0) {
      const catalogueChanged =
        catalogueDigestBefore &&
        parseCatalogueDigest(cleanup.stdout) !== catalogueDigestBefore;
      if (catalogueChanged) {
        process.stderr.write(
          "Live integration changed catalogue rows outside manifest ownership"
        );
        status = 1;
        runner.cleanupStatus = "FAIL";
        runner.failurePhase ??= "cleanup";
      } else {
        runner.cleanupStatus = "PASS";
        cleanupSucceeded = true;
        if (recoveryRequested || recoverIfOwned) {
          status = 0;
        }
      }
    } else {
      runner.cleanupStatus = "FAIL";
      runner.failurePhase ??= "cleanup";
      process.stderr.write(cleanup.stderr || cleanup.stdout);
      status = cleanup.status ?? 1;
    }
  }
  if (cleanupSucceeded) {
    if (!catalogueDigestBefore) {
      throw new Error("Release catalogue baseline was not established");
    }
    runner.phase = "release";
    await releaseActiveRun(manifest, registryInput);
    runner.fenceState = "released";
    runner.phase = "complete";
  }
  return status;
}

const evidenceFlag = process.argv.indexOf("--evidence-dir");
const evidenceDir =
  evidenceFlag >= 0 ? process.argv[evidenceFlag + 1] : undefined;
let exitStatus = 1;
let originalError: unknown;
let failed = false;
try {
  if (evidenceFlag >= 0 && (!evidenceDir || evidenceDir.startsWith("--"))) {
    throw new Error("--evidence-dir requires a directory");
  }
  exitStatus = await runLiveIntegration();
  runner.exitCode = exitStatus;
  runner.outcome = exitStatus === 0 ? "PASS" : "FAIL";
} catch (error) {
  failed = true;
  runner.outcome = "FAIL";
  runner.exitCode = 1;
  runner.failurePhase ??= runner.phase;
  originalError = error;
} finally {
  if (evidenceDir && !evidenceDir.startsWith("--")) {
    try {
      const candidate = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: resolve(import.meta.dirname, "../.."),
        encoding: "utf8",
      });
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(
        resolve(evidenceDir, "live-integration.json"),
        JSON.stringify(
          {
            assessedAt: new Date().toISOString(),
            candidateSha: candidate.status === 0 ? candidate.stdout.trim() : "",
            runner,
          },
          null,
          2
        )
      );
    } catch (error) {
      if (failed || exitStatus !== 0) {
        process.stderr.write(
          "Integration evidence output failed; original runner failure preserved.\n"
        );
      } else {
        exitStatus = 1;
        failed = true;
        originalError = error;
      }
    }
  }
}
if (failed) {
  throw originalError;
}
process.exit(exitStatus);
