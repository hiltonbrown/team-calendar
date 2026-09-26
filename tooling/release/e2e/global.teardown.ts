import { spawnSync } from "node:child_process";
import { releaseEnvironment } from "./environment.js";
import { assertJourneyLedgerReconciled } from "./journey-ledger.js";
import { reconcileReleaseTeardown } from "./release-teardown.js";

export default function globalTeardown() {
  const environment = releaseEnvironment();
  const cleanup = (mode: "--apply" | "--assert-clean") => {
    const result = spawnSync(
      "bun",
      [
        "tooling/release/cleanup.ts",
        "--manifest",
        environment.manifestPath,
        mode,
      ],
      { env: process.env, stdio: "ignore" }
    );
    if (result.status !== 0) {
      throw new Error("Release cleanup requires reconciliation");
    }
  };
  reconcileReleaseTeardown({
    applyCleanup: () => cleanup("--apply"),
    assertClean: () => cleanup("--assert-clean"),
    assertLedger: assertJourneyLedgerReconciled,
    inspectCleanup: () => cleanup("--assert-clean"),
  });
}
