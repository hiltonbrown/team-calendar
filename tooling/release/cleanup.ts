import { createHash } from "node:crypto";
import { createStandaloneDatabaseClient } from "../../packages/database/src/standalone-client.js";
import { assertActiveRunOwner } from "./active-run-registry.js";
import { assertConsumerIsolationReadBack } from "./consumer-isolation.js";
import {
  assertDurableManifestReadBack,
  assertLiveDatabaseAuthority,
} from "./database-guard.js";
import { unsupportedGlobalFixtureKeys } from "./global-fixture-keys.js";

const flag = process.argv.indexOf("--manifest");
const manifestPath = flag >= 0 ? process.argv[flag + 1] : undefined;
const modes = ["--dry-run", "--apply", "--assert-clean"].filter((item) =>
  process.argv.includes(item)
);
if (!manifestPath || modes.length > 1) {
  throw new Error(
    "Usage: cleanup.ts --manifest <path> [--dry-run|--apply|--assert-clean]"
  );
}
const mode = modes[0] ?? "--dry-run";
const manifest = assertLiveDatabaseAuthority({
  acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
  databaseUrl: process.env.DATABASE_URL,
  manifestPath,
  runId: process.env.TC_RELEASE_RUN_ID,
});
await assertDurableManifestReadBack(manifest, {
  token: process.env.KV_REST_API_TOKEN,
  url: process.env.KV_REST_API_URL,
});
if (mode !== "--dry-run") {
  await assertActiveRunOwner(manifest, {
    token: process.env.KV_REST_API_TOKEN,
    url: process.env.KV_REST_API_URL,
  });
  process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED = manifest.runId;
}
process.env.TC_RELEASE_DURABLE_VERIFIED = manifest.runId;
await assertConsumerIsolationReadBack(manifest, {
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
if (manifest.consumerIsolation) {
  process.env.TC_RELEASE_CONSUMERS_VERIFIED = manifest.runId;
}
if (
  !(manifest.owned.clerkOrgIds.length && manifest.owned.organisationIds.length)
) {
  throw new Error("Cleanup requires both manifest-owned tenancy keys");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
const database = createStandaloneDatabaseClient(databaseUrl);
const scopedTables = [
  "outbound_operations",
  "notification_email_queue",
  "notification_preferences",
  "notifications",
  "failed_records",
  "sync_runs",
  "availability_publications",
  "feed_tokens",
  "feed_scopes",
  "feeds",
  "public_holiday_assignments",
  "public_holidays",
  "public_holiday_jurisdictions",
  "leave_balances",
  "xero_person_matches",
  "alternative_contacts",
  "availability_records",
  "xero_sync_cursors",
  "xero_tenants",
  "xero_connections",
  "people",
  "locations",
  "teams",
  "organisation_settings",
  "audit_events",
] as const;
const clerkTables = [
  "xero_oauth_sessions",
  "usage_counters",
  "clerk_org_subscriptions",
] as const;
const stripeEventIds = manifest.owned.globalKeys
  .filter((key) => key.startsWith("stripe_event:"))
  .map((key) => key.slice("stripe_event:".length));
const planIds = manifest.owned.globalKeys
  .filter((key) => key.startsWith("plan_id:"))
  .map((key) => key.slice("plan_id:".length));
const planKeys = manifest.owned.globalKeys
  .filter((key) => key.startsWith("plan_key:"))
  .map((key) => key.slice("plan_key:".length));
const unknownGlobalKeys = unsupportedGlobalFixtureKeys(
  manifest.owned.globalKeys
);
if (unknownGlobalKeys.length > 0) {
  throw new Error("Cleanup manifest contains unsupported global fixture keys");
}
const placeholders = (offset: number, count: number) =>
  Array.from({ length: count }, (_, index) => `$${offset + index}`).join(",");
const scopedValues = [
  ...manifest.owned.clerkOrgIds,
  ...manifest.owned.organisationIds,
];
const scopedSql = `clerk_org_id IN (${placeholders(1, manifest.owned.clerkOrgIds.length)}) AND organisation_id IN (${placeholders(1 + manifest.owned.clerkOrgIds.length, manifest.owned.organisationIds.length)})`;
const clerkSql = `clerk_org_id IN (${placeholders(1, manifest.owned.clerkOrgIds.length)})`;
const organisationSql = `clerk_org_id IN (${placeholders(1, manifest.owned.clerkOrgIds.length)}) AND id IN (${placeholders(1 + manifest.owned.clerkOrgIds.length, manifest.owned.organisationIds.length)})`;

const countRows = async (table: string, sql: string, values: string[]) => {
  const rows = await database.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "${table}" WHERE ${sql}`,
    ...values
  );
  return Number(rows[0]?.count ?? 0n);
};
const outsideOwnedCatalogueDigest = async () => {
  const plans = await database.$queryRawUnsafe<unknown[]>(
    `SELECT id::text, key, plan_key, name, is_active, is_custom, COALESCE(stripe_price_id, '') AS stripe_price_id
     FROM plans
     WHERE NOT (id = ANY($1::uuid[]) OR key = ANY($2::text[]) OR plan_key = ANY($2::text[]))
     ORDER BY id`,
    planIds,
    planKeys
  );
  const limits = await database.$queryRawUnsafe<unknown[]>(
    `SELECT id::text, plan_id::text, limit_type::text, limit_value
     FROM plan_limits
     WHERE NOT (plan_id = ANY($1::uuid[]))
     ORDER BY id`,
    planIds
  );
  return createHash("sha256")
    .update(JSON.stringify({ limits, plans }))
    .digest("hex");
};
const catalogueDigestBefore = await outsideOwnedCatalogueDigest();
const counts: Record<string, number> = {};
for (const table of scopedTables) {
  counts[table] = await countRows(table, scopedSql, scopedValues);
}
for (const table of clerkTables) {
  counts[table] = await countRows(table, clerkSql, manifest.owned.clerkOrgIds);
}
counts.organisations = await countRows(
  "organisations",
  organisationSql,
  scopedValues
);
if (stripeEventIds.length > 0) {
  const stripeSql = `stripe_event_id IN (${placeholders(1, stripeEventIds.length)})`;
  counts.stripe_events = await countRows(
    "stripe_events",
    stripeSql,
    stripeEventIds
  );
}
if (planIds.length > 0) {
  const planIdSql = `plan_id IN (${placeholders(1, planIds.length)})`;
  counts.plan_limits = await countRows("plan_limits", planIdSql, planIds);
}
if (planIds.length > 0 || planKeys.length > 0) {
  const clauses: string[] = [];
  const values: string[] = [];
  if (planIds.length > 0) {
    clauses.push(`id IN (${placeholders(1, planIds.length)})`);
    values.push(...planIds);
  }
  if (planKeys.length > 0) {
    clauses.push(
      `(key IN (${placeholders(values.length + 1, planKeys.length)}) OR plan_key IN (${placeholders(values.length + planKeys.length + 1, planKeys.length)}))`
    );
    values.push(...planKeys);
    values.push(...planKeys);
  }
  counts.plans = await countRows("plans", clauses.join(" OR "), values);
}

if (mode === "--dry-run") {
  console.log(
    JSON.stringify({
      counts,
      outsideOwnedCatalogueDigest: catalogueDigestBefore,
      runId: manifest.runId,
    })
  );
  await database.$disconnect();
  process.exit(0);
}
if (mode === "--apply") {
  const activeFixtureRuns = await database.syncRun.count({
    where: {
      clerk_org_id: { in: manifest.owned.clerkOrgIds },
      organisation_id: { in: manifest.owned.organisationIds },
      status: "running",
    },
  });
  if (activeFixtureRuns > 0) {
    throw new Error(
      "Cleanup refused while manifest-owned sync runs are active"
    );
  }
  await database.$transaction(async (transaction) => {
    for (const table of scopedTables) {
      await transaction.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE ${scopedSql}`,
        ...scopedValues
      );
    }
    for (const table of clerkTables) {
      await transaction.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE ${clerkSql}`,
        ...manifest.owned.clerkOrgIds
      );
    }
    if (stripeEventIds.length > 0) {
      await transaction.$executeRawUnsafe(
        `DELETE FROM "stripe_events" WHERE stripe_event_id IN (${placeholders(1, stripeEventIds.length)})`,
        ...stripeEventIds
      );
    }
    if (planIds.length > 0) {
      await transaction.$executeRawUnsafe(
        `DELETE FROM "plan_limits" WHERE plan_id IN (${placeholders(1, planIds.length)})`,
        ...planIds
      );
    }
    if (planIds.length > 0 || planKeys.length > 0) {
      const clauses: string[] = [];
      const values: string[] = [];
      if (planIds.length > 0) {
        clauses.push(`id IN (${placeholders(1, planIds.length)})`);
        values.push(...planIds);
      }
      if (planKeys.length > 0) {
        clauses.push(
          `(key IN (${placeholders(values.length + 1, planKeys.length)}) OR plan_key IN (${placeholders(values.length + planKeys.length + 1, planKeys.length)}))`
        );
        values.push(...planKeys);
        values.push(...planKeys);
      }
      await transaction.$executeRawUnsafe(
        `DELETE FROM "plans" WHERE ${clauses.join(" OR ")}`,
        ...values
      );
    }
    await transaction.$executeRawUnsafe(
      `DELETE FROM "organisations" WHERE ${organisationSql}`,
      ...scopedValues
    );
  });
}

const residue: Record<string, number> = {};
for (const table of scopedTables) {
  residue[table] = await countRows(table, scopedSql, scopedValues);
}
for (const table of clerkTables) {
  residue[table] = await countRows(table, clerkSql, manifest.owned.clerkOrgIds);
}
residue.organisations = await countRows(
  "organisations",
  organisationSql,
  scopedValues
);
if (stripeEventIds.length > 0) {
  residue.stripe_events = await countRows(
    "stripe_events",
    `stripe_event_id IN (${placeholders(1, stripeEventIds.length)})`,
    stripeEventIds
  );
}
if (planIds.length > 0) {
  residue.plan_limits = await countRows(
    "plan_limits",
    `plan_id IN (${placeholders(1, planIds.length)})`,
    planIds
  );
}
if (planIds.length > 0 || planKeys.length > 0) {
  const clauses: string[] = [];
  const values: string[] = [];
  if (planIds.length > 0) {
    clauses.push(`id IN (${placeholders(1, planIds.length)})`);
    values.push(...planIds);
  }
  if (planKeys.length > 0) {
    clauses.push(
      `(key IN (${placeholders(values.length + 1, planKeys.length)}) OR plan_key IN (${placeholders(values.length + planKeys.length + 1, planKeys.length)}))`
    );
    values.push(...planKeys);
    values.push(...planKeys);
  }
  residue.plans = await countRows("plans", clauses.join(" OR "), values);
}
const catalogueDigestAfter =
  mode === "--apply"
    ? await outsideOwnedCatalogueDigest()
    : catalogueDigestBefore;
await database.$disconnect();
console.log(
  JSON.stringify({
    before: counts,
    outsideOwnedCatalogueDigest: catalogueDigestAfter,
    residue,
    runId: manifest.runId,
  })
);
if (Object.values(residue).some((count) => count !== 0)) {
  throw new Error("Manifest-owned fixture residue remains");
}
