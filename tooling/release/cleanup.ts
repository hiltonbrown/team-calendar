import { assertActiveRunOwner } from "./active-run-registry.js";
import {
  assertDurableManifestReadBack,
  assertLiveDatabaseAuthority,
} from "./database-guard.js";

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
}
process.env.TC_RELEASE_DURABLE_VERIFIED = manifest.runId;
if (
  !(manifest.owned.clerkOrgIds.length && manifest.owned.organisationIds.length)
) {
  throw new Error("Cleanup requires both manifest-owned tenancy keys");
}

const { database } = await import("../../packages/database/index.js");
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
const unknownGlobalKeys = manifest.owned.globalKeys.filter(
  (key) => !key.startsWith("stripe_event:")
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

if (mode === "--dry-run") {
  console.log(JSON.stringify({ counts, runId: manifest.runId }));
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
await database.$disconnect();
console.log(JSON.stringify({ before: counts, residue, runId: manifest.runId }));
if (Object.values(residue).some((count) => count !== 0)) {
  throw new Error("Manifest-owned fixture residue remains");
}
