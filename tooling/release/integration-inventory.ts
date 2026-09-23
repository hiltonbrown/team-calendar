import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const INTEGRATION_WORKSPACES = [
  "apps/app",
  "packages/availability",
  "packages/database",
  "packages/feeds",
  "packages/jobs",
  "packages/xero",
] as const;

export const EXPECTED_INTEGRATION_TESTS = [
  "apps/app/app/(authenticated)/people/new/_actions.integration.test.ts",
  "packages/availability/index.integration.test.ts",
  "packages/availability/src/people/clerk-access-service.integration.test.ts",
  "packages/availability/src/people/current-user-service.integration.test.ts",
  "packages/database/authoritative-usage.integration.test.ts",
  "packages/database/availability_records.integration.test.ts",
  "packages/database/billing.integration.test.ts",
  "packages/database/leave_balances.integration.test.ts",
  "packages/database/live-rollback.integration.test.ts",
  "packages/database/plan_limits.integration.test.ts",
  "packages/database/public-holidays.integration.test.ts",
  "packages/database/src/seed/seed.integration.test.ts",
  "packages/database/xero-lifecycle-migration.integration.test.ts",
  "packages/database/xero-tenancy.integration.test.ts",
  "packages/feeds/index.integration.test.ts",
  "packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts",
  "packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts",
  "packages/jobs/src/handlers/sync-xero-leave-balances.integration.test.ts",
  "packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts",
  "packages/jobs/src/handlers/sync-xero-people.integration.test.ts",
  "packages/xero/src/oauth/disconnect.integration.test.ts",
  "packages/xero/src/oauth/service.integration.test.ts",
] as const;

export const assertExpectedIntegrationInventory = (
  inventory: string[]
): void => {
  if (
    JSON.stringify(inventory) !== JSON.stringify(EXPECTED_INTEGRATION_TESTS)
  ) {
    throw new Error(
      "Live integration inventory differs from the reviewed 22-suite allowlist"
    );
  }
};

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    if (["node_modules", ".next", "generated"].includes(name)) {
      return [];
    }
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

export const discoverIntegrationTests = (root: string): string[] =>
  INTEGRATION_WORKSPACES.flatMap((workspace) =>
    walk(join(root, workspace))
      .filter((path) => path.endsWith(".integration.test.ts"))
      .map((path) => relative(root, path))
  ).sort();
