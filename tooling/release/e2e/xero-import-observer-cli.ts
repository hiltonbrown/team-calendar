import { Pool } from "pg";
import { z } from "zod";
import { assertLiveDatabaseAuthority } from "../database-guard.js";
import {
  readXeroExecutionManifest,
  requireDurableXeroRunnerAuthority,
  requireXeroRunnerContext,
} from "../xero-execution-guard.js";
import { assertIndependentInitialImport } from "./xero-import-observer.js";
import { readIndependentAuImport } from "./xero-provider-oracle.js";

const context = await requireDurableXeroRunnerAuthority();
const manifest = readXeroExecutionManifest(
  z.string().min(1).parse(process.env.TC_XERO_MANIFEST)
);
const alias = z
  .string()
  .regex(/^fixture-[a-z0-9-]+$/)
  .parse(process.argv[2]);
const runIds = z
  .array(z.uuid())
  .length(3)
  .parse(JSON.parse(process.argv[3] ?? "null"));
const owned = manifest.owned.find((entry) => entry.alias === alias);
if (!owned || context.runId !== manifest.runId) {
  throw new Error("Independent import fixture is unavailable");
}
const database = assertLiveDatabaseAuthority({
  acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
  databaseUrl: process.env.DATABASE_URL,
  manifestPath: process.env.TC_RELEASE_MANIFEST,
  runId: process.env.TC_RELEASE_RUN_ID,
});
if (
  process.env.TC_RELEASE_DURABLE_VERIFIED !== database.runId ||
  process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED !== database.runId
) {
  throw new Error("Independent import requires active database authority");
}
const raw = await readIndependentAuImport({
  assertAuthority: () => {
    requireXeroRunnerContext();
  },
  bindingGeneration: owned.bindingGeneration,
  clerkOrgId: owned.clerkOrgId,
  expectedTenantId: owned.xeroTenantId,
  organisationId: owned.organisationId,
  ownedEmployeeIds: owned.employeeIds,
  providerAppId: z.string().min(1).parse(process.env.XERO_CLIENT_ID),
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const scope = [owned.clerkOrgId, owned.organisationId];
  const [people, leaves, balances, runs, tenant] = await Promise.all([
    pool.query(
      'SELECT id AS "personId", xero_employee_id AS "sourceId" FROM people WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND xero_employee_id IS NOT NULL AND archived_at IS NULL ORDER BY id',
      scope
    ),
    pool.query(
      'SELECT ar.source_remote_id AS "sourceId", ar.person_id AS "personId", ar.starts_at::text AS "startsAt", ar.ends_at::text AS "endsAt", ar.source_payload_json FROM availability_records ar WHERE ar.clerk_org_id=$1 AND ar.organisation_id=$2::uuid AND ar.source_type IN (\'xero_leave\',\'team_calendar_leave\') AND ar.archived_at IS NULL ORDER BY ar.id',
      scope
    ),
    pool.query(
      'SELECT person_id AS "personId", leave_type_xero_id AS "leaveTypeId", balance::float8 AS value, balance_unit AS unit FROM leave_balances WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND xero_tenant_id IS NOT NULL ORDER BY id',
      scope
    ),
    pool.query(
      `SELECT id, run_type AS entity, status, records_fetched AS fetched, records_failed AS failed, to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startedAt", to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "completedAt" FROM sync_runs WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND id=ANY($3::uuid[]) ORDER BY id`,
      [...scope, runIds]
    ),
    pool.query(
      "SELECT xero_tenant_id, binding_generation FROM xero_tenants WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND active_slot=1 AND retired_at IS NULL",
      scope
    ),
  ]);
  if (
    tenant.rows.length !== 1 ||
    tenant.rows[0]?.xero_tenant_id !== owned.xeroTenantId ||
    tenant.rows[0]?.binding_generation !== owned.bindingGeneration
  ) {
    throw new Error("Independent import binding is stale");
  }
  const canonical = {
    balances: balances.rows,
    bindingGeneration: owned.bindingGeneration,
    clerkOrgId: owned.clerkOrgId,
    leaves: leaves.rows.map((row) => {
      const payload = z
        .object({
          LeavePeriods: z.array(z.object({ NumberOfUnits: z.number() })),
          LeaveTypeID: z.string(),
        })
        .parse(row.source_payload_json);
      return {
        endsAt: row.endsAt,
        personId: row.personId,
        rawLeaveTypeId: payload.LeaveTypeID,
        rawUnits: payload.LeavePeriods.reduce(
          (sum, period) => sum + period.NumberOfUnits,
          0
        ),
        sourceId: row.sourceId,
        startsAt: row.startsAt,
      };
    }),
    observedAt: new Date().toISOString(),
    organisationId: owned.organisationId,
    people: people.rows,
    runs: runs.rows,
    xeroTenantId: owned.xeroTenantId,
  };
  const comparison = assertIndependentInitialImport(raw, canonical, {
    bindingGeneration: owned.bindingGeneration,
    campaignStartedAt: context.createdAt,
    clerkOrgId: owned.clerkOrgId,
    expectedRunIds: runIds,
    organisationId: owned.organisationId,
    xeroTenantId: owned.xeroTenantId,
  });
  process.stdout.write(`${JSON.stringify({ canonical, comparison, raw })}\n`);
} finally {
  await pool.end();
}
