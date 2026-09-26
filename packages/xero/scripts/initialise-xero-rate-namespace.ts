import { parseArgs } from "node:util";
import { log } from "@repo/observability/log";
import { initialiseXeroRateNamespace } from "../src/rate-limit/shared-store";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "assume-spent-daily": { type: "boolean" },
      epoch: { type: "string" },
    },
    strict: true,
  });
  if (!values.epoch || values["assume-spent-daily"] !== true) {
    throw new Error("Explicit --epoch and --assume-spent-daily are required");
  }
  const counts = await initialiseXeroRateNamespace({
    assumeSpentDaily: true,
    epoch: values.epoch,
  });
  log.info("Xero rate namespace initialisation", counts);
}
main().catch((error: unknown) => {
  log.error(
    error instanceof Error
      ? error.message
      : "Xero rate namespace initialisation failed"
  );
  process.exitCode = 1;
});
