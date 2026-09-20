import type { Result } from "@repo/core";
import { appError } from "@repo/core";
import { database } from "../client";

export interface SchedulableXeroTenant {
  clerkOrgId: string;
  connectionStatus: string;
  databaseTenantId: string;
  disconnectedAt: Date | null;
  lastApprovalStateReconciledAt: Date | null;
  lastLeaveBalancesSyncAt: Date | null;
  lastLeaveRecordsSyncAt: Date | null;
  lastPeopleSyncAt: Date | null;
  organisationId: string;
  payrollRegion: "AU" | "NZ" | "UK";
  revokedAt: Date | null;
  syncPausedAt: Date | null;
  timezone: string | null;
}

export interface ListSchedulableXeroTenantsOptions {
  cursor?: string;
  limit?: number;
}

export interface ListSchedulableXeroTenantsResult {
  nextCursor?: string;
  tenants: SchedulableXeroTenant[];
}

export interface XeroConnectionNeedingTokenRotation {
  clerkOrgId: string;
  connectionId: string;
  lastRefreshedAt: Date;
  organisationId: string;
}

export interface FindConnectionsNeedingTokenRotationOptions {
  now?: Date;
}

const REFRESH_TOKEN_ROTATION_AGE_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * System-level maintenance query for active connections whose single-use
 * refresh token has not been rotated in 45 days.
 *
 * This intentionally crosses Clerk Organisation boundaries and returns only
 * the routing identifiers needed to run a tenant-scoped refresh.
 */
export async function findConnectionsNeedingTokenRotation(
  options: FindConnectionsNeedingTokenRotationOptions = {}
): Promise<Result<XeroConnectionNeedingTokenRotation[]>> {
  try {
    const now = options.now ?? new Date();
    const refreshBefore = new Date(
      now.getTime() - REFRESH_TOKEN_ROTATION_AGE_MS
    );
    const connections = await database.xeroConnection.findMany({
      orderBy: [{ last_refreshed_at: "asc" }, { id: "asc" }],
      select: {
        clerk_org_id: true,
        id: true,
        last_refreshed_at: true,
        organisation_id: true,
      },
      where: {
        disconnected_at: null,
        OR: [
          { last_error_code: "refresh_persist_failed" },
          { last_refreshed_at: { lt: refreshBefore } },
        ],
        organisation: {
          archived_at: null,
          is_active: true,
        },
        revoked_at: null,
        status: "active",
      },
    });

    return {
      ok: true,
      value: connections.flatMap((connection) =>
        connection.last_refreshed_at
          ? [
              {
                clerkOrgId: connection.clerk_org_id,
                connectionId: connection.id,
                lastRefreshedAt: connection.last_refreshed_at,
                organisationId: connection.organisation_id,
              },
            ]
          : []
      ),
    };
  } catch (error) {
    return {
      error: appError(
        "internal",
        `Failed to find Xero connections needing token rotation: ${error instanceof Error ? error.message : "Unknown error"}`
      ),
      ok: false,
    };
  }
}

/**
 * System-level cross-tenant enumeration query to discover active AU Xero tenants due for scheduled sync.
 *
 * ARCHITECTURAL EXCEPTION NOTICE:
 * This query intentionally does NOT receive a session `clerk_org_id`.
 * Its sole responsibility as a system coordinator boundary is to enumerate active Xero tenant IDs across organisations
 * so that the scheduler can dispatch isolated, tenant-scoped events (carrying clerkOrgId and organisationId).
 *
 * Security boundary guarantees:
 * - Selects ONLY tenant routing identifiers and sync timestamps needed for cadence decisions.
 * - NEVER selects access/refresh token ciphertext, IVs, auth tags, raw JSON payloads, people data, or availability records.
 * - Filters for active, non-archived organisations and active, non-revoked, non-disconnected Xero connections.
 * - Excludes paused sync tenants.
 * - Restricts to payroll_region === "AU".
 */
export async function listSchedulableXeroTenants(
  options: ListSchedulableXeroTenantsOptions = {}
): Promise<Result<ListSchedulableXeroTenantsResult>> {
  try {
    const limit = Math.min(Math.max(1, options.limit ?? 100), 100);
    const { cursor } = options;

    const items = await database.xeroTenant.findMany({
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      orderBy: { id: "asc" },
      select: {
        clerk_org_id: true,
        id: true,
        last_approval_state_reconciled_at: true,
        last_leave_balances_sync_at: true,
        last_leave_records_sync_at: true,
        last_people_sync_at: true,
        organisation: {
          select: {
            timezone: true,
          },
        },
        organisation_id: true,
        payroll_region: true,
        sync_paused_at: true,
        xero_connection: {
          select: {
            disconnected_at: true,
            revoked_at: true,
            status: true,
          },
        },
      },
      where: {
        organisation: {
          archived_at: null,
          is_active: true,
        },
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
      },
    });

    let nextCursor: string | undefined;
    if (items.length > limit) {
      items.pop();
      if (items.length > 0) {
        nextCursor = items.at(-1)?.id;
      }
    }

    const validItems = items.filter(
      (
        item
      ): item is typeof item & {
        organisation: NonNullable<typeof item.organisation>;
        xero_connection: NonNullable<typeof item.xero_connection>;
      } => Boolean(item.xero_connection && item.organisation)
    );

    const tenants: SchedulableXeroTenant[] = validItems.map((item) => ({
      clerkOrgId: item.clerk_org_id,
      connectionStatus: item.xero_connection.status,
      databaseTenantId: item.id,
      disconnectedAt: item.xero_connection.disconnected_at,
      lastApprovalStateReconciledAt: item.last_approval_state_reconciled_at,
      lastLeaveBalancesSyncAt: item.last_leave_balances_sync_at,
      lastLeaveRecordsSyncAt: item.last_leave_records_sync_at,
      lastPeopleSyncAt: item.last_people_sync_at,
      organisationId: item.organisation_id,
      payrollRegion: item.payroll_region as "AU" | "NZ" | "UK",
      revokedAt: item.xero_connection.revoked_at,
      syncPausedAt: item.sync_paused_at,
      timezone: item.organisation.timezone,
    }));

    return {
      ok: true,
      value: {
        tenants,
        ...(nextCursor ? { nextCursor } : {}),
      },
    };
  } catch (error) {
    return {
      error: appError(
        "internal",
        `Failed to list schedulable Xero tenants: ${error instanceof Error ? error.message : "Unknown error"}`
      ),
      ok: false,
    };
  }
}
