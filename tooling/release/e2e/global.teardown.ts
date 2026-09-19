import { spawnSync } from "node:child_process";
import { releaseEnvironment } from "./environment.js";
import { assertJourneyLedgerReconciled } from "./journey-ledger.js";

export default function globalTeardown() {
  const environment = releaseEnvironment();
  assertJourneyLedgerReconciled();
  const cleanup = spawnSync(
    "bun",
    [
      "tooling/release/cleanup.ts",
      "--manifest",
      environment.manifestPath,
      "--apply",
    ],
    { encoding: "utf8", env: process.env }
  );
  if (cleanup.status !== 0) {
    throw new Error(
      `Release cleanup failed: ${cleanup.stderr || cleanup.stdout}`
    );
  }
  const result = spawnSync(
    "bun",
    [
      "tooling/release/cleanup.ts",
      "--manifest",
      environment.manifestPath,
      "--assert-clean",
    ],
    { encoding: "utf8", env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(
      `Release cleanup assertion failed: ${result.stderr || result.stdout}`
    );
  }
}
