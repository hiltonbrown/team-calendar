import type { Result } from "@repo/core";
import { appError } from "@repo/core";
import { database } from "../client";
export interface SchedulableXeroConnection {
  clerkOrgId: string;
  connectionId: string;
  connectionStatus: string;
  disconnectedAt: Date | null;
  lastApprovalStateReconciledAt: Date | null;
  lastFullLeaveRecordsSyncAt?: Date | null;
  lastFullPeopleSyncAt?: Date | null;
  lastLeaveBalancesSyncAt: Date | null;
  lastLeaveRecordsSyncAt: Date | null;
  lastPeopleSyncAt: Date | null;
  organisationId: string;
  payrollRegion: "AU" | "NZ" | "UK";
  syncPausedAt: Date | null;
  timezone: string | null;
}
export interface ListSchedulableXeroConnectionsOptions {
  cursor?: string;
  limit?: number;
}
export interface ListSchedulableXeroConnectionsResult {
  connections: SchedulableXeroConnection[];
  nextCursor?: string;
}
export async function listSchedulableXeroConnections(
  options: ListSchedulableXeroConnectionsOptions = {}
): Promise<Result<ListSchedulableXeroConnectionsResult>> {
  try {
    const limit = Math.min(100, Math.max(1, options.limit ?? 100));
    const rows = await database.xeroConnection.findMany({
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        clerk_org_id: true,
        disconnected_at: true,
        id: true,
        last_approval_state_reconciled_at: true,
        last_full_leave_records_sync_at: true,
        last_full_people_sync_at: true,
        last_leave_balances_sync_at: true,
        last_leave_records_sync_at: true,
        last_people_sync_at: true,
        organisation: { select: { timezone: true } },
        organisation_id: true,
        payroll_region: true,
        status: true,
        sync_paused_at: true,
      },
      where: {
        authorisation: { status: "active" },
        initial_sync_completed_at: { not: null },
        organisation: { archived_at: null, is_active: true },
        payroll_region: "AU",
        status: "active",
        sync_paused_at: null,
      },
    });
    const more = rows.length > limit;
    if (more) {
      rows.pop();
    }
    return {
      ok: true,
      value: {
        ...(more ? { nextCursor: rows.at(-1)?.id } : {}),
        connections: rows.map((row) => ({
          clerkOrgId: row.clerk_org_id,
          connectionId: row.id,
          connectionStatus: row.status,
          disconnectedAt: row.disconnected_at,
          lastApprovalStateReconciledAt: row.last_approval_state_reconciled_at,
          lastFullLeaveRecordsSyncAt: row.last_full_leave_records_sync_at,
          lastFullPeopleSyncAt: row.last_full_people_sync_at,
          lastLeaveBalancesSyncAt: row.last_leave_balances_sync_at,
          lastLeaveRecordsSyncAt: row.last_leave_records_sync_at,
          lastPeopleSyncAt: row.last_people_sync_at,
          organisationId: row.organisation_id,
          payrollRegion: row.payroll_region,
          syncPausedAt: row.sync_paused_at,
          timezone: row.organisation.timezone,
        })),
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to list Xero connections"),
      ok: false,
    };
  }
}
