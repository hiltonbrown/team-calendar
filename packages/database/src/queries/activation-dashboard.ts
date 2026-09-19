import { database } from "../client";

interface ActivationDashboardRow {
  feed_accessed: boolean;
  first_leave_approved: boolean;
  first_leave_submitted: boolean;
  initial_sync_completed: boolean;
  stripe_delivery_failures: bigint;
  sync_failures: bigint;
  xero_connected: boolean;
  xero_write_failures: bigint;
}

export interface ActivationDashboardSummary {
  failures: {
    stripeDeliveries: number;
    syncRecords: number;
    xeroWrites: number;
  };
  milestones: {
    feedAccessed: boolean;
    firstLeaveApproved: boolean;
    firstLeaveSubmitted: boolean;
    initialSyncCompleted: boolean;
    organisationProvisioned: true;
    xeroConnected: boolean;
  };
}

export async function getActivationDashboardSummary(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<ActivationDashboardSummary> {
  const rows = await database.$queryRaw<ActivationDashboardRow[]>`
    SELECT
      EXISTS (SELECT 1 FROM xero_connections WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId} AND status = 'active') AS xero_connected,
      (SELECT COUNT(DISTINCT run_type) = 3 FROM sync_runs WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId} AND status = 'succeeded' AND run_type IN ('people', 'leave_records', 'leave_balances')) AS initial_sync_completed,
      EXISTS (SELECT 1 FROM audit_events WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId} AND action = 'activation.first_feed_accessed') AS feed_accessed,
      EXISTS (SELECT 1 FROM availability_records WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId} AND submitted_at IS NOT NULL) AS first_leave_submitted,
      EXISTS (SELECT 1 FROM availability_records WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId} AND approved_at IS NOT NULL) AS first_leave_approved,
      COALESCE((SELECT SUM(records_failed) FROM sync_runs WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId}), 0)::bigint AS sync_failures,
      (SELECT COUNT(*) FROM availability_records WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId} AND approval_status = 'xero_sync_failed')::bigint AS xero_write_failures,
      (SELECT COUNT(*) FROM stripe_events WHERE clerk_org_id = ${input.clerkOrgId} AND delivery_state = 'failed')::bigint AS stripe_delivery_failures
  `;
  const [row] = rows;
  if (!row) {
    throw new Error("Activation dashboard aggregation returned no row");
  }
  return {
    failures: {
      stripeDeliveries: Number(row.stripe_delivery_failures),
      syncRecords: Number(row.sync_failures),
      xeroWrites: Number(row.xero_write_failures),
    },
    milestones: {
      feedAccessed: row.feed_accessed,
      firstLeaveApproved: row.first_leave_approved,
      firstLeaveSubmitted: row.first_leave_submitted,
      initialSyncCompleted: row.initial_sync_completed,
      organisationProvisioned: true,
      xeroConnected: row.xero_connected,
    },
  };
}
