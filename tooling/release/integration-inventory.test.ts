import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverIntegrationTests } from "./integration-inventory.js";

const EXPECTED = [
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
  "packages/database/xero-tenancy.integration.test.ts",
  "packages/feeds/index.integration.test.ts",
  "packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts",
  "packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts",
  "packages/jobs/src/handlers/sync-xero-leave-balances.integration.test.ts",
  "packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts",
  "packages/jobs/src/handlers/sync-xero-people.integration.test.ts",
  "packages/xero/src/oauth/disconnect.integration.test.ts",
  "packages/xero/src/oauth/service.integration.test.ts",
];

describe("live integration inventory", () => {
  it("fails when a database-backed suite is added or silently removed", () => {
    expect(discoverIntegrationTests(resolve(import.meta.dirname, "../.."))).toEqual(
      EXPECTED
    );
  });
});
