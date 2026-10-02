import { Pool } from "pg";
import { z } from "zod";
import { requireXeroObserverAuthority } from "../xero-observer-authority.js";
import { assertIndependentInitialImport } from "./xero-import-observer.js";
import { readIndependentAuImport } from "./xero-provider-oracle.js";

const alias = z
  .string()
  .regex(/^fixture-[a-z0-9-]+$/)
  .parse(process.argv[2]);
const runIds = z
  .array(z.uuid())
  .length(3)
  .parse(JSON.parse(process.argv[3] ?? "null"));
const authority = await requireXeroObserverAuthority(alias);
const { fixture: owned, context } = authority;
const raw = await authority.observeProvider(() =>
  readIndependentAuImport({
    assertAuthority: authority.assertCurrent,
    bindingGeneration: owned.bindingGeneration,
    clerkOrgId: owned.clerkOrgId,
    expectedTenantId: owned.xeroTenantId,
    organisationId: owned.organisationId,
    ownedEmployeeIds: owned.employeeIds,
    providerAppId: z.string().min(1).parse(process.env.XERO_CLIENT_ID),
  })
);
const pool = new Pool({ connectionString: authority.databaseUrl });
try {
  const observation = await authority.readOnly(pool, async (client) => {
    const scope = [owned.clerkOrgId, owned.organisationId];
    const [people, leaves, balances, runs, tenant] = await Promise.all([
      client.query(
        'SELECT id AS "personId", xero_employee_id AS "sourceId" FROM people WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND xero_employee_id IS NOT NULL AND archived_at IS NULL ORDER BY id',
        scope
      ),
      client.query(
        'SELECT ar.source_remote_id AS "sourceId", ar.person_id AS "personId", ar.starts_at::text AS "startsAt", ar.ends_at::text AS "endsAt", ar.source_payload_json FROM availability_records ar WHERE ar.clerk_org_id=$1 AND ar.organisation_id=$2::uuid AND ar.source_type IN (\'xero_leave\',\'team_calendar_leave\') AND ar.archived_at IS NULL ORDER BY ar.id',
        scope
      ),
      client.query(
        'SELECT person_id AS "personId", leave_type_xero_id AS "leaveTypeId", balance::float8 AS value, balance_unit AS unit FROM leave_balances WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND xero_tenant_id IS NOT NULL ORDER BY id',
        scope
      ),
      client.query(
        `SELECT id, run_type AS entity, status, records_fetched AS fetched, records_failed AS failed, to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startedAt", to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "completedAt" FROM sync_runs WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND id=ANY($3::uuid[]) ORDER BY id`,
        [...scope, runIds]
      ),
      client.query(
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
    return { canonical, comparison, raw };
  });
  process.stdout.write(`${JSON.stringify(observation)}\n`);
} finally {
  await pool.end();
}
