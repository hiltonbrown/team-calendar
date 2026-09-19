import { Pool } from "pg";
import { z } from "zod";
import { assertLiveDatabaseAuthority } from "../database-guard.js";

const recordId = z.string().uuid().parse(process.argv[2]);
const manifest = assertLiveDatabaseAuthority({
  acknowledgement: process.env.ALLOW_LIVE_DATABASE_TESTS,
  databaseUrl: process.env.DATABASE_URL,
  manifestPath: process.env.TC_RELEASE_MANIFEST,
  runId: process.env.TC_RELEASE_RUN_ID,
});
if (
  process.env.TC_RELEASE_DURABLE_VERIFIED !== manifest.runId ||
  process.env.TC_RELEASE_ACTIVE_RUN_VERIFIED !== manifest.runId
) {
  throw new Error("Provider verification requires the verified active run");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query<{
    approval_status: string;
    clerk_org_id: string;
    known_remote_id: string | null;
    organisation_id: string;
    request_employee_id: string | null;
    request_ends_at: Date | null;
    request_fingerprint: string | null;
    request_leave_type_id: string | null;
    request_starts_at: Date | null;
    request_title: string | null;
    request_units: string | null;
    source_remote_id: string | null;
  }>(
    `SELECT ar.approval_status, ar.clerk_org_id, ar.organisation_id,
            ar.source_remote_id, op.known_remote_id, op.request_employee_id,
            op.request_ends_at, op.request_fingerprint,
            op.request_leave_type_id, op.request_starts_at, op.request_title,
            op.request_units::text
     FROM availability_records ar
     LEFT JOIN outbound_operations op
       ON op.availability_record_id = ar.id AND op.action = 'submit'
     WHERE ar.id = $1::uuid`,
    [recordId]
  );
  if (result.rows.length !== 1) {
    throw new Error("Provider verification record is not exact");
  }
  const [row] = result.rows;
  if (!row) {
    throw new Error("Provider verification operation is missing");
  }
  if (!row.request_employee_id) {
    throw new Error("Provider verification employee is missing");
  }
  if (!(row.request_ends_at && row.request_starts_at)) {
    throw new Error("Provider verification dates are missing");
  }
  if (!(row.request_fingerprint && row.request_leave_type_id)) {
    throw new Error("Provider verification fingerprint is incomplete");
  }
  if (row.request_units === null) {
    throw new Error("Provider verification operation is incomplete");
  }
  if (!manifest.owned.organisationIds.includes(row.organisation_id)) {
    throw new Error("Provider verification record is outside the manifest");
  }
  const requestEndsAt = row.request_ends_at;
  const requestStartsAt = row.request_starts_at;
  const [{ XeroWriteAdapter }, { submitRequestFingerprint }] =
    await Promise.all([
      import("../../../packages/xero/src/adapter/xero-write-adapter.js"),
      import("../../../packages/availability/src/plans/submit-service.js"),
    ]);
  const candidates = await XeroWriteAdapter.findLeaveApplicationCandidates?.({
    clerkOrgId: row.clerk_org_id,
    employeeId: row.request_employee_id,
    organisationId: row.organisation_id,
  });
  if (!(candidates?.ok && candidates.value.complete)) {
    throw new Error("Provider verification returned an incomplete result");
  }
  const units = Number(row.request_units);
  const matches = candidates.value.candidates.filter(
    (candidate) =>
      candidate.employeeId === row.request_employee_id &&
      candidate.leaveTypeId === row.request_leave_type_id &&
      candidate.startsAt === requestStartsAt.toISOString().slice(0, 10) &&
      candidate.endsAt === requestEndsAt.toISOString().slice(0, 10) &&
      candidate.units === units &&
      candidate.title === row.request_title &&
      submitRequestFingerprint({
        employeeId: candidate.employeeId,
        endsAt: requestEndsAt,
        leaveTypeId: candidate.leaveTypeId,
        startsAt: requestStartsAt,
        title: candidate.title,
        units: candidate.units,
      }) === row.request_fingerprint
  );
  const knownRemoteId = row.known_remote_id ?? row.source_remote_id;
  if (
    row.known_remote_id &&
    row.source_remote_id &&
    row.known_remote_id !== row.source_remote_id
  ) {
    throw new Error("Canonical and operation remote IDs disagree");
  }
  process.stdout.write(
    `${JSON.stringify({
      approvalStatus: row.approval_status,
      knownRemoteId,
      matches: matches.map((candidate) => ({
        approvalStatus: candidate.approvalStatus,
        remoteId: candidate.remoteId,
      })),
    })}\n`
  );
} finally {
  await pool.end();
}
