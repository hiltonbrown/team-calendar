import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  acquireActiveRun,
  assertActiveRunOwner,
  releaseActiveRun,
} from "./active-run-registry.js";
import {
  assertDurableManifestReadBack,
  assertLiveDatabaseAuthority,
} from "./database-guard.js";
import { discoverIntegrationTests } from "./integration-inventory.js";
import { buildLiveIntegrationEnvironment } from "./live-run-environment.js";

const manifestFlag = process.argv.indexOf("--manifest");
const manifestPath =
  manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
const root = resolve(import.meta.dirname, "../..");
if (!manifestPath) {
  throw new Error("A protected release manifest path is required");
}
const protectedManifestPath = manifestPath;
const recoveryRequested = process.argv.includes("--recover");
const preacquired = process.argv.includes("--preacquired");
if (recoveryRequested && preacquired) {
  throw new Error("Choose either --recover or --preacquired, not both");
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
if (activeState === "interrupted" && !recoveryRequested) {
  throw new Error(
    "Interrupted release run detected; rerun with --recover to reconcile it"
  );
}
if (activeState === "acquired" && recoveryRequested) {
  await releaseActiveRun(manifest, registryInput);
  throw new Error("No interrupted release run exists for recovery");
}

const inventory = discoverIntegrationTests(root);
if (inventory.length === 0) {
  throw new Error("No live integration tests were discovered");
}

const childEnvironment = buildLiveIntegrationEnvironment(
  process.env,
  manifest,
  protectedManifestPath
);
let status = 1;
let cleanupSucceeded = false;
try {
  if (activeState === "acquired") {
    const result = spawnSync("bun", ["run", "test:integration"], {
      cwd: root,
      env: childEnvironment,
      stdio: "inherit",
    });
    status = result.status ?? 1;
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
    { cwd: root, env: childEnvironment, stdio: "inherit" }
  );
  if (cleanup.status === 0) {
    cleanupSucceeded = true;
    if (recoveryRequested) {
      status = 0;
    }
  } else {
    status = cleanup.status ?? 1;
  }
}
if (cleanupSucceeded) {
  await releaseActiveRun(manifest, registryInput);
}
process.exit(status);
