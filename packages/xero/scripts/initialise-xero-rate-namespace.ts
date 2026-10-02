import { log } from "@repo/observability/log";
import { parseXeroNamespaceInitialisationArgs } from "../src/rate-limit/namespace-initialisation";
import { initialiseXeroRateNamespace } from "../src/rate-limit/shared-store";

async function main(): Promise<void> {
  const { policy, ...input } = parseXeroNamespaceInitialisationArgs(
    process.argv.slice(2)
  );
  const counts = await initialiseXeroRateNamespace(input);
  log.info("Xero rate namespace initialisation", { ...counts, policy });
}
main().catch((error: unknown) => {
  log.error(
    error instanceof Error
      ? error.message
      : "Xero rate namespace initialisation failed"
  );
  process.exitCode = 1;
});
