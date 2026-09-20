import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { isLocalDatabase } from "./is-local-database";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";

export const LIVE_FIXTURE_SUITES = {
  "apps/app/app/(authenticated)/people/new/_actions.integration.test.ts": {
    tenants: 1,
  },
  "packages/availability/index.integration.test.ts": { tenants: 3 },
  "packages/availability/src/people/clerk-access-service.integration.test.ts": {
    tenants: 2,
  },
  "packages/availability/src/people/current-user-service.integration.test.ts": {
    tenants: 2,
  },
  "packages/database/authoritative-usage.integration.test.ts": { tenants: 2 },
  "packages/database/availability_records.integration.test.ts": { tenants: 2 },
  "packages/database/billing.integration.test.ts": {
    globalKeys: { plan_id: 3, plan_key: 3, stripe_event: 5 },
    tenants: 2,
  },
  "packages/database/leave_balances.integration.test.ts": { tenants: 1 },
  "packages/database/live-rollback.integration.test.ts": { tenants: 2 },
  "packages/database/plan_limits.integration.test.ts": {
    globalKeys: { plan_id: 1, plan_key: 1 },
    tenants: 0,
  },
  "packages/database/public-holidays.integration.test.ts": { tenants: 2 },
  "packages/database/src/seed/seed.integration.test.ts": {
    globalKeys: { plan_id: 3, plan_key: 3 },
    tenants: 2,
  },
  "packages/database/xero-tenancy.integration.test.ts": { tenants: 2 },
  "packages/feeds/index.integration.test.ts": { tenants: 3 },
  "packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts":
    { tenants: 2 },
  "packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts": {
    tenants: 2,
  },
  "packages/jobs/src/handlers/sync-xero-leave-balances.integration.test.ts": {
    tenants: 4,
  },
  "packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts": {
    tenants: 2,
  },
  "packages/jobs/src/handlers/sync-xero-people.integration.test.ts": {
    tenants: 2,
  },
  "packages/xero/src/oauth/disconnect.integration.test.ts": { tenants: 2 },
  "packages/xero/src/oauth/service.integration.test.ts": { tenants: 1 },
} as const;

export type LiveFixtureSuite = keyof typeof LIVE_FIXTURE_SUITES;

const manifestSchema = z.object({
  active: z.literal(true),
  durableManifestConfirmed: z.literal(true),
  namespace: z.string(),
  owned: z.object({
    clerkOrgIds: z.array(z.string().min(1)),
    globalKeys: z.array(z.string().min(1)),
    organisationIds: z.array(z.string().uuid()),
  }),
  runId: z.string().uuid(),
  version: z.literal(1),
});

type GlobalKeyKind = "plan_id" | "plan_key" | "stripe_event";

const suiteEntries = Object.entries(LIVE_FIXTURE_SUITES) as [
  LiveFixtureSuite,
  { globalKeys?: Partial<Record<GlobalKeyKind, number>>; tenants: number },
][];

export const REQUIRED_LIVE_FIXTURE_TENANT_SLOTS = suiteEntries.reduce(
  (total, [, allocation]) => total + allocation.tenants,
  0
);

export interface LiveFixtureTenant {
  clerkOrgId: string;
  organisationId: string;
}

export interface LiveTestFixture {
  globalKey: (kind: GlobalKeyKind, index?: number) => string;
  id: (kind: string, index?: number) => string;
  key: (kind: string, index?: number) => string;
  runId: string;
  suite: LiveFixtureSuite;
  tenants: readonly LiveFixtureTenant[];
}

const uuidFrom = (value: string): string => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

const allocateLocalTestFixture = (suite: LiveFixtureSuite): LiveTestFixture => {
  const suiteIndex = suiteEntries.findIndex(([name]) => name === suite);
  if (suiteIndex < 0) {
    throw new Error("Live integration suite is not in the protected registry");
  }
  const suiteAllocation = suiteEntries[suiteIndex]?.[1];
  if (!suiteAllocation) {
    throw new Error("Live integration suite allocation is missing");
  }
  const offset = suiteEntries
    .slice(0, suiteIndex)
    .reduce((total, [, allocation]) => total + allocation.tenants, 0);
  const count = suiteAllocation.tenants;
  const tenants = Array.from({ length: count }, (_, index) => ({
    clerkOrgId: `org_test_local_${String(offset + index + 1).padStart(3, "0")}`,
    organisationId: uuidFrom(`local-tenant:${offset + index + 1}`),
  }));

  const globalOffset = (kind: GlobalKeyKind) =>
    suiteEntries
      .slice(0, suiteIndex)
      .reduce(
        (total, [, allocation]) => total + (allocation.globalKeys?.[kind] ?? 0),
        0
      );

  return {
    globalKey: (kind, index = 0) => {
      const suiteCount = suiteAllocation.globalKeys?.[kind] ?? 0;
      if (!(Number.isInteger(index) && index >= 0 && index < suiteCount)) {
        throw new Error(`Suite does not own global key ${kind}:${index}`);
      }
      const slot = globalOffset(kind) + index + 1;
      if (kind === "plan_id") {
        return uuidFrom(`local-plan-id:${slot}`);
      }
      if (kind === "plan_key") {
        return `local_plan_${slot}`;
      }
      return `evt_local_${slot}`;
    },
    id: (kind, index = 0) => uuidFrom(`local:${suite}:${kind}:${index}`),
    key: (kind, index = 0) =>
      `local_${createHash("sha256")
        .update(`${suite}:${kind}:${index}`)
        .digest("hex")
        .slice(0, 16)}`,
    runId: "00000000-0000-4000-8000-000000000000",
    suite,
    tenants,
  };
};

export const allocateLiveTestFixture = (
  suite: LiveFixtureSuite
): LiveTestFixture => {
  assertTestDatabaseConnectionAllowed();
  const manifestPath = process.env.TC_RELEASE_MANIFEST;
  if (!manifestPath) {
    const databaseUrl = process.env.DATABASE_URL;
    if (
      process.env.ALLOW_LOCAL_DATABASE_TESTS === "1" &&
      databaseUrl &&
      isLocalDatabase(databaseUrl)
    ) {
      return allocateLocalTestFixture(suite);
    }
    throw new Error("Protected live fixture manifest path is required");
  }
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(manifestPath, "utf8"))
  );
  if (manifest.namespace !== `release:run:${manifest.runId}`) {
    throw new Error("Protected live fixture namespace marker is invalid");
  }
  const suiteIndex = suiteEntries.findIndex(([name]) => name === suite);
  if (suiteIndex < 0) {
    throw new Error("Live integration suite is not in the protected registry");
  }
  if (
    new Set(manifest.owned.clerkOrgIds).size !==
      manifest.owned.clerkOrgIds.length ||
    new Set(manifest.owned.globalKeys).size !==
      manifest.owned.globalKeys.length ||
    new Set(manifest.owned.organisationIds).size !==
      manifest.owned.organisationIds.length
  ) {
    throw new Error("Protected live fixture ownership slots must be unique");
  }
  if (
    manifest.owned.clerkOrgIds.length < REQUIRED_LIVE_FIXTURE_TENANT_SLOTS ||
    manifest.owned.organisationIds.length < REQUIRED_LIVE_FIXTURE_TENANT_SLOTS
  ) {
    throw new Error(
      `Protected manifest requires ${REQUIRED_LIVE_FIXTURE_TENANT_SLOTS} disjoint tenant slots`
    );
  }
  const offset = suiteEntries
    .slice(0, suiteIndex)
    .reduce((total, [, allocation]) => total + allocation.tenants, 0);
  const suiteAllocation = suiteEntries[suiteIndex]?.[1];
  if (!suiteAllocation) {
    throw new Error("Live integration suite allocation is missing");
  }
  const count = suiteAllocation.tenants;
  const tenants = Array.from({ length: count }, (_, index) => ({
    clerkOrgId: manifest.owned.clerkOrgIds[offset + index] as string,
    organisationId: manifest.owned.organisationIds[offset + index] as string,
  }));
  for (const tenant of tenants) {
    if (
      !(
        manifest.owned.clerkOrgIds.includes(tenant.clerkOrgId) &&
        manifest.owned.organisationIds.includes(tenant.organisationId)
      )
    ) {
      throw new Error("Requested live fixture tenant is not manifest-owned");
    }
  }
  const marker = `${manifest.runId}:${suite}`;
  const globalKeysByKind = (kind: GlobalKeyKind) =>
    manifest.owned.globalKeys.filter((key) => key.startsWith(`${kind}:`));
  const globalOffset = (kind: GlobalKeyKind) =>
    suiteEntries
      .slice(0, suiteIndex)
      .reduce(
        (total, [, allocation]) => total + (allocation.globalKeys?.[kind] ?? 0),
        0
      );
  for (const kind of ["plan_id", "plan_key", "stripe_event"] as const) {
    const required = suiteEntries.reduce(
      (total, [, allocation]) => total + (allocation.globalKeys?.[kind] ?? 0),
      0
    );
    if (globalKeysByKind(kind).length < required) {
      throw new Error(
        `Protected manifest requires ${required} unique ${kind} global keys`
      );
    }
  }
  return {
    globalKey: (kind, index = 0) => {
      const suiteCount = suiteAllocation.globalKeys?.[kind] ?? 0;
      if (!(Number.isInteger(index) && index >= 0 && index < suiteCount)) {
        throw new Error(`Suite does not own global key ${kind}:${index}`);
      }
      const value = globalKeysByKind(kind)[globalOffset(kind) + index];
      if (!value) {
        throw new Error(
          `Protected manifest is missing global key ${kind}:${index}`
        );
      }
      return value.slice(kind.length + 1);
    },
    id: (kind, index = 0) => uuidFrom(`${marker}:${kind}:${index}`),
    key: (kind, index = 0) =>
      `release_${manifest.runId.replaceAll("-", "")}_${createHash("sha256")
        .update(`${suite}:${kind}:${index}`)
        .digest("hex")
        .slice(0, 16)}`,
    runId: manifest.runId,
    suite,
    tenants,
  };
};
