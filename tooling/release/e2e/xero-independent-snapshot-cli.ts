import { Pool } from "pg";
import { z } from "zod";
import { assertLiveDatabaseAuthority } from "../database-guard.js";
import {
  readXeroExecutionManifest,
  requireDurableXeroRunnerAuthority,
  requireXeroRunnerContext,
} from "../xero-execution-guard.js";
import {
  matchRawProviderLeave,
  observerSqlDate,
  readIndependentAuLeave,
} from "./xero-provider-oracle.js";

const recordId = z.uuid().parse(process.argv[2]);
const context = process.env.TC_XERO_MANIFEST
  ? requireXeroRunnerContext()
  : null;
const xeroManifest = process.env.TC_XERO_MANIFEST
  ? readXeroExecutionManifest(process.env.TC_XERO_MANIFEST)
  : null;
const manifest = assertLiveDatabaseAuthority({
  acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
  databaseUrl: process.env.DATABASE_URL,
  manifestPath: process.env.TC_RELEASE_MANIFEST,
  runId: process.env.TC_RELEASE_RUN_ID,
});
if (
  (context && xeroManifest && context.runId !== xeroManifest.runId) ||
  process.env.TC_RELEASE_DURABLE_VERIFIED !== manifest.runId ||
  process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED !== manifest.runId
) {
  throw new Error("Provider verification requires a verified active run");
}
const fixtureAlias = process.env.TC_XERO_OBSERVER_FIXTURE;
const fixture = xeroManifest?.owned.find(
  (entry) => entry.alias === fixtureAlias
);
if (xeroManifest && !fixture) {
  throw new Error("Provider verification fixture is unavailable");
}
const ordinaryScope = z
  .strictObject({
    bindingGeneration: z.number().int().nonnegative(),
    clerkOrgId: z.string().min(1),
    employeeIds: z.array(z.uuid()).min(1),
    leaveTypeIds: z.array(z.uuid()).min(1),
    organisationId: z.uuid(),
    xeroTenantId: z.uuid(),
  })
  .parse(
    fixture
      ? {
          bindingGeneration: fixture.bindingGeneration,
          clerkOrgId: fixture.clerkOrgId,
          employeeIds: fixture.employeeIds,
          leaveTypeIds: fixture.leaveTypeIds,
          organisationId: fixture.organisationId,
          xeroTenantId: fixture.xeroTenantId,
        }
      : JSON.parse(process.env.TC_XERO_ORDINARY_OBSERVER_SCOPE ?? "null")
  );
if (
  !(
    manifest.owned.clerkOrgIds.includes(ordinaryScope.clerkOrgId) &&
    manifest.owned.organisationIds.includes(ordinaryScope.organisationId)
  )
) {
  throw new Error("Provider verification scope is outside protected ownership");
}
const rawExpectation = z
  .strictObject({
    rawApplicationStatuses: z.array(z.string().min(1)).max(10),
    rawPeriodStatuses: z.array(z.string().min(1)).min(1).max(10),
  })
  .parse(JSON.parse(process.env.TC_XERO_RAW_STATE_EXPECTATION ?? "null"));
if (xeroManifest) {
  await requireDurableXeroRunnerAuthority();
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query<{
    approval_status: string;
    source_remote_id: string | null;
    known_remote_id: string | null;
    action: string | null;
    employee_id: string;
    starts_at: string;
    ends_at: string;
    source_payload_json: unknown;
    request_leave_type_id: string | null;
    request_units: string | null;
  }>(
    `
    SELECT ar.approval_status, ar.source_remote_id, ar.source_payload_json,
           ar.starts_at::date::text AS starts_at, ar.ends_at::date::text AS ends_at, p.xero_employee_id AS employee_id,
           op.known_remote_id, op.action, op.request_leave_type_id, op.request_units::text
    FROM availability_records ar
    JOIN people p ON p.id = ar.person_id AND p.clerk_org_id = ar.clerk_org_id AND p.organisation_id = ar.organisation_id
    LEFT JOIN LATERAL (SELECT known_remote_id, action, request_leave_type_id, request_units FROM outbound_operations op
      WHERE op.availability_record_id = ar.id AND op.clerk_org_id = ar.clerk_org_id AND op.organisation_id = ar.organisation_id
      ORDER BY op.created_at DESC, op.id DESC LIMIT 1) op ON true
    WHERE ar.id = $1::uuid AND ar.clerk_org_id = $2 AND ar.organisation_id = $3::uuid`,
    [recordId, ordinaryScope.clerkOrgId, ordinaryScope.organisationId]
  );
  const [row] = result.rows;
  if (
    result.rows.length !== 1 ||
    !row ||
    !ordinaryScope.employeeIds.includes(row.employee_id)
  ) {
    throw new Error("Provider verification intent is outside owned scope");
  }
  if (
    row.known_remote_id &&
    row.source_remote_id &&
    row.known_remote_id !== row.source_remote_id
  ) {
    throw new Error("Canonical and operation remote identities disagree");
  }
  const imported = z
    .object({
      LeavePeriods: z.array(
        z.object({ NumberOfUnits: z.number().nonnegative() })
      ),
      LeaveTypeID: z.string().min(1),
    })
    .safeParse(row.source_payload_json);
  const leaveTypeId =
    row.request_leave_type_id ??
    (imported.success ? imported.data.LeaveTypeID : null);
  let units: number | null = null;
  if (row.request_units !== null) {
    units = Number(row.request_units);
  } else if (imported.success) {
    units = imported.data.LeavePeriods.reduce(
      (sum, period) => sum + period.NumberOfUnits,
      0
    );
  }
  if (
    !leaveTypeId ||
    units === null ||
    !Number.isFinite(units) ||
    !ordinaryScope.leaveTypeIds.includes(leaveTypeId)
  ) {
    throw new Error("Provider intent type or units are incomplete");
  }
  const knownRemoteId = row.known_remote_id ?? row.source_remote_id;
  const observation = await readIndependentAuLeave({
    assertAuthority: () => {
      if (xeroManifest) {
        requireXeroRunnerContext();
      } else {
        assertLiveDatabaseAuthority({
          acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
          databaseUrl: process.env.DATABASE_URL,
          manifestPath: process.env.TC_RELEASE_MANIFEST,
          runId: process.env.TC_RELEASE_RUN_ID,
        });
      }
    },
    bindingGeneration: ordinaryScope.bindingGeneration,
    clerkOrgId: ordinaryScope.clerkOrgId,
    expectedTenantId: ordinaryScope.xeroTenantId,
    organisationId: ordinaryScope.organisationId,
    providerAppId: z.string().min(1).parse(process.env.XERO_CLIENT_ID),
    remoteId: knownRemoteId,
  });
  const matches = matchRawProviderLeave(observation.payload, {
    employeeId: row.employee_id,
    endsAt: observerSqlDate(row.ends_at),
    leaveTypeId,
    remoteId: knownRemoteId,
    startsAt: observerSqlDate(row.starts_at),
    units,
    ...rawExpectation,
  });
  process.stdout.write(
    `${JSON.stringify({ approvalStatus: row.approval_status, independentRawAssertion: true, knownRemoteId, matches: matches.map((candidate) => ({ approvalStatus: row.approval_status, rawApplicationStatus: candidate.Status ?? null, rawAssertionPassed: true, rawPeriodStatuses: candidate.LeavePeriods.map((period) => period.LeavePeriodStatus), remoteId: candidate.LeaveApplicationID })), mode: "LIVE", observedAt: observation.observedAt, operationAction: row.action, origin: observation.origin })}\n`
  );
} finally {
  await pool.end();
}
