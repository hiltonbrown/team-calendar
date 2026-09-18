import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assertDurableManifestReadBack,
  assertLiveDatabaseAuthority,
} from "./database-guard.js";
import { discoverIntegrationTests } from "./integration-inventory.js";

const manifestFlag = process.argv.indexOf("--manifest");
const manifestPath = manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
const root = resolve(import.meta.dirname, "../..");
if (!manifestPath) {
  throw new Error("A protected release manifest path is required");
}
const protectedManifestPath = manifestPath;

const manifest = assertLiveDatabaseAuthority({
  acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
  databaseUrl: process.env.DATABASE_URL,
  manifestPath: protectedManifestPath,
  runId: process.env.TC_RELEASE_RUN_ID,
});
await assertDurableManifestReadBack(manifest, {
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const inventory = discoverIntegrationTests(root);
if (inventory.length === 0) {
  throw new Error("No live integration tests were discovered");
}

const childEnvironment = {
  ...process.env,
  TC_RELEASE_MANIFEST: protectedManifestPath,
  TC_RELEASE_DURABLE_VERIFIED: manifest.runId,
};
let status = 1;
try {
  const result = spawnSync("bun", ["run", "test:integration"], {
    cwd: root,
    env: childEnvironment,
    stdio: "inherit",
  });
  status = result.status ?? 1;
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
  if (cleanup.status !== 0) {
    status = cleanup.status ?? 1;
  }
}
process.exit(status);
