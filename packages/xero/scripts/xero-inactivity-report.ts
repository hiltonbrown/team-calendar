import { parseArgs } from "node:util";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { buildXeroInactivityReport } from "../src/oauth/inactivity-report";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "clerk-org-id": { type: "string" },
      "organisation-id": { type: "string" },
    },
    strict: true,
  });
  const scope = z
    .object({
      "clerk-org-id": z.string().min(1),
      "organisation-id": z.string().uuid(),
    })
    .safeParse(values);
  if (!scope.success) {
    throw new Error(
      "Explicit --clerk-org-id and --organisation-id are required"
    );
  }
  const result = await buildXeroInactivityReport({
    clerkOrgId: scope.data["clerk-org-id"],
    now: new Date(),
    organisationId: scope.data["organisation-id"],
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  log.info("Xero inactivity classifications", result.value);
}
main().catch(() => {
  log.error(
    "Xero inactivity report failed. Check explicit scope and database configuration."
  );
  process.exitCode = 1;
});
