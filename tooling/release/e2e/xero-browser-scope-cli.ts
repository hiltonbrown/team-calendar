import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { z } from "zod";
import { assertLiveDatabaseAuthority } from "../database-guard.js";
import {
  readXeroExecutionManifest,
  requireDurableXeroRunnerAuthority,
} from "../xero-execution-guard.js";

const context = await requireDurableXeroRunnerAuthority();
const xero = readXeroExecutionManifest(
  z.string().min(1).parse(process.env.TC_XERO_MANIFEST)
);
const alias = z
  .string()
  .regex(/^fixture-[a-z0-9-]+$/)
  .parse(process.argv[2]);
const resource = xero.owned.find((entry) => entry.alias === alias);
if (!resource || context.runId !== xero.runId) {
  throw new Error("Protected browser scope is unavailable");
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
  throw new Error(
    "Browser scope observation requires active database authority"
  );
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const scope = [resource.clerkOrgId, resource.organisationId];
  if (process.argv[3] === "--feed") {
    const feedId = z.uuid().parse(process.argv[4]);
    const feed = await pool.query(
      "SELECT id FROM feeds WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND id=$3::uuid AND archived_at IS NULL",
      [...scope, feedId]
    );
    if (feed.rows.length !== 1) {
      throw new Error("Feed is outside exact owned payroll scope");
    }
    const { privateUrl } = z
      .strictObject({ privateUrl: z.string().url() })
      .parse(JSON.parse(readFileSync(0, "utf8")));
    const capability = new URL(privateUrl);
    if (
      capability.origin !== new URL(xero.deployments.api).origin ||
      capability.search ||
      capability.hash ||
      !capability.pathname.startsWith("/ical/") ||
      !capability.pathname.endsWith(".ics")
    ) {
      throw new Error("Feed capability origin is foreign");
    }
    const token = capability.pathname.slice(6, -4);
    const { hashFeedToken, verifySignedFeedToken } = await import(
      "../../../packages/feeds/src/tokens/token-service.js"
    );
    const tokens = await pool.query(
      "SELECT id, token_hash FROM feed_tokens WHERE clerk_org_id=$1 AND organisation_id=$2::uuid AND feed_id=$3::uuid AND status='active' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",
      [...scope, feedId]
    );
    const matching = tokens.rows.filter(
      (row) =>
        verifySignedFeedToken({
          token,
          tokenHash: row.token_hash,
          tokenId: row.id,
        }) || hashFeedToken(token) === row.token_hash
    );
    if (matching.length !== 1) {
      throw new Error("Feed capability does not belong to exact owned feed");
    }
  } else if (process.argv[3]) {
    const expected = z
      .strictObject({
        employeeId: z.uuid(),
        endsAt: z.iso.date(),
        leaveTypeId: z.uuid(),
        personId: z.uuid(),
        recordId: z.uuid(),
        recordType: z.string().regex(/^[a-z_]+$/),
        startsAt: z.iso.date(),
      })
      .parse(JSON.parse(process.argv[3]));
    if (
      !(
        resource.employeeIds.includes(expected.employeeId) &&
        resource.leaveTypeIds.includes(expected.leaveTypeId)
      )
    ) {
      throw new Error("Intended payroll identity is not owned");
    }
    const record = await pool.query(
      "SELECT ar.id FROM availability_records ar JOIN people p ON p.id=ar.person_id AND p.clerk_org_id=ar.clerk_org_id AND p.organisation_id=ar.organisation_id WHERE ar.clerk_org_id=$1 AND ar.organisation_id=$2::uuid AND ar.id=$3::uuid AND p.id=$4::uuid AND p.xero_employee_id=$5 AND ar.record_type::text=$6 AND ar.starts_at::date=$7::date AND ar.ends_at::date=$8::date AND EXISTS (SELECT 1 FROM leave_balances lb WHERE lb.clerk_org_id=ar.clerk_org_id AND lb.organisation_id=ar.organisation_id AND lb.person_id=ar.person_id AND lb.leave_type_xero_id=$9)",
      [
        ...scope,
        expected.recordId,
        expected.personId,
        expected.employeeId,
        expected.recordType,
        expected.startsAt,
        expected.endsAt,
        expected.leaveTypeId,
      ]
    );
    if (
      record.rows.length !== 1 ||
      expected.startsAt < xero.dateWindow.from ||
      expected.endsAt > xero.dateWindow.until
    ) {
      throw new Error(
        "Browser record is outside exact person, type or date scope"
      );
    }
  }
  const results = await Promise.all([
    pool.query(
      "SELECT id, xero_tenant_id, binding_generation, active_slot, retired_at FROM xero_tenants WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
      scope
    ),
    pool.query(
      "SELECT id, status, disconnected_at, revoked_at FROM xero_connections WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
      scope
    ),
    pool.query(
      "SELECT id, source_remote_id, approval_status, derived_uid_key, derived_sequence FROM availability_records WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
      scope
    ),
    pool.query(
      "SELECT id, run_type, status, started_at, completed_at FROM sync_runs WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
      scope
    ),
  ]);
  const binding = results[0]?.rows[0];
  if (
    resource.bindingGeneration === 0
      ? results[0]?.rows.length !== 0
      : results[0]?.rows.length !== 1 ||
        binding?.binding_generation !== resource.bindingGeneration ||
        binding?.xero_tenant_id !== resource.xeroTenantId
  ) {
    throw new Error("Browser payroll binding or generation is stale");
  }
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(results.map((result) => result.rows)))
    .digest("hex");
  process.stdout.write(
    `${JSON.stringify({ fingerprint, jobCount: results[3]?.rows.length ?? 0, observedAt: new Date().toISOString() })}\n`
  );
} finally {
  await pool.end();
}
