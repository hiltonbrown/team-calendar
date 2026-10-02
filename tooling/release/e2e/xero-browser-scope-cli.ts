import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { z } from "zod";
import { requireXeroObserverAuthority } from "../xero-observer-authority.js";

import { assertXeroBrowserBinding } from "./xero-browser-mutation-scope.js";

const recordTypePattern = /^[a-z_]+$/;

const alias = z
  .string()
  .regex(/^fixture-[a-z0-9-]+$/)
  .parse(process.argv[2]);
const authority = await requireXeroObserverAuthority(alias);
const { fixture: resource, manifest: xero } = authority;
const pool = new Pool({ connectionString: authority.databaseUrl });
try {
  const observation = await authority.readOnly(pool, async (client) => {
    const scope = [resource.clerkOrgId, resource.organisationId];
    if (process.argv[3] === "--feed") {
      const feedId = z.uuid().parse(process.argv[4]);
      const feed = await client.query(
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
      const tokens = await client.query(
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
          recordType: z.string().regex(recordTypePattern),
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
      const record = await client.query(
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
      client.query(
        "SELECT id, xero_tenant_id, binding_generation, active_slot, retired_at FROM xero_tenants WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
        scope
      ),
      client.query(
        "SELECT id, status, disconnected_at, revoked_at FROM xero_connections WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
        scope
      ),
      client.query(
        "SELECT id, source_remote_id, approval_status, derived_uid_key, derived_sequence FROM availability_records WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
        scope
      ),
      client.query(
        "SELECT id, run_type, status, started_at, completed_at FROM sync_runs WHERE clerk_org_id=$1 AND organisation_id=$2::uuid ORDER BY id",
        scope
      ),
    ]);
    assertXeroBrowserBinding(results[0]?.rows, resource);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(results.map((result) => result.rows)))
      .digest("hex");
    return {
      fingerprint,
      jobCount: results[3]?.rows.length ?? 0,
      observedAt: new Date().toISOString(),
    };
  });
  process.stdout.write(`${JSON.stringify(observation)}\n`);
} finally {
  await pool.end();
}
