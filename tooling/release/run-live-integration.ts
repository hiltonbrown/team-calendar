import { spawnSync } from "node:child_process";
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
import { buildLiveIntegrationEnvironment } from "./live-run-environment.js";
import { type LiveRunMode, resolveLiveRunAction } from "./live-run-mode.js";

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
const registryInput = {
  token: process.env.KV_REST_API_TOKEN,
  url: process.env.KV_REST_API_URL,
};
let activeState: "acquired" | "interrupted";
if (preacquired) {
  await assertActiveRunOwner(manifest, registryInput);
  activeState = "acquired";
} else {
  activeState = await acquireActiveRun(manifest, registryInput);
}
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
} catch (error) {
  if (activeState === "acquired" && recoveryRequested) {
    await releaseActiveRun(manifest, registryInput);
  }
  throw error;
}
if (action === "release-noop") {
  await releaseActiveRun(manifest, registryInput);
  process.exit(0);
}

const inventory = discoverIntegrationTests(root);
assertExpectedIntegrationInventory(inventory);

const childEnvironment = buildLiveIntegrationEnvironment(
  process.env,
  manifest,
  protectedManifestPath
);
await assertConsumerIsolationReadBack(manifest, {
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
if (manifest.consumerIsolation) {
  childEnvironment.TC_RELEASE_CONSUMERS_VERIFIED = manifest.runId;
}
if (action === "run") {
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
  const parsed = JSON.parse(line) as { outsideOwnedCatalogueDigest?: unknown };
  if (typeof parsed.outsideOwnedCatalogueDigest !== "string") {
    throw new Error("Cleanup returned an invalid catalogue digest");
  }
  return parsed.outsideOwnedCatalogueDigest;
};
try {
  if (action === "run") {
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
    const result = spawnSync("bun", ["run", "test:integration"], {
      cwd: root,
      env: childEnvironment,
      stdio: "inherit",
    });
    status = result.status ?? 1;
  } else {
    catalogueDigestBefore = await readCatalogueDigest(manifest, registryInput);
  }
} finally {
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
    } else {
      cleanupSucceeded = true;
      if (recoveryRequested || recoverIfOwned) {
        status = 0;
      }
    }
  } else {
    process.stderr.write(cleanup.stderr || cleanup.stdout);
    status = cleanup.status ?? 1;
  }
}
if (cleanupSucceeded) {
  if (!catalogueDigestBefore) {
    throw new Error("Release catalogue baseline was not established");
  }
  await releaseActiveRun(manifest, registryInput);
}
process.exit(status);
