import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { hasXeroConnection } from "@repo/database/src/queries/organisations";
import {
  getLatestSyncRunSummary,
  listRecentAuditEvents,
  listRecentSyncRuns,
} from "@repo/database/src/queries/sync-runs";

/**
 * Loads sync health data including latest run, recent runs, and connection status.
 */
export async function loadSyncHealthData(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId
): Promise<
  Result<{
    latestRun: {
      id: string;
      status: string;
      entityType: string | null;
      recordsSynced: number;
      recordsFailed: number;
      startedAt: Date;
      completedAt: Date | null;
    } | null;
    recentRuns: Array<{
      id: string;
      status: string;
      entityType: string | null;
      recordsSynced: number;
      recordsFailed: number;
      startedAt: Date;
      completedAt: Date | null;
    }>;
    recentAuditEvents: Array<{
      id: string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      actorUserId: string | null;
      payload: unknown;
      createdAt: Date;
    }>;
    hasXeroConnection: boolean;
  }>
> {
  try {
    const [
      latestRunResult,
      recentRunsResult,
      auditEventsResult,
      xeroConnectionResult,
    ] = await Promise.all([
      getLatestSyncRunSummary(clerkOrgId, organisationId),
      listRecentSyncRuns(clerkOrgId, organisationId, 10),
      listRecentAuditEvents(clerkOrgId, organisationId, 20),
      hasXeroConnection(clerkOrgId, organisationId),
    ]);

    if (!latestRunResult.ok) {
      return {
        ok: false,
        error: latestRunResult.error,
      };
    }

    if (!recentRunsResult.ok) {
      return {
        ok: false,
        error: recentRunsResult.error,
      };
    }

    if (!auditEventsResult.ok) {
      return {
        ok: false,
        error: auditEventsResult.error,
      };
    }

    if (!xeroConnectionResult.ok) {
      return {
        ok: false,
        error: xeroConnectionResult.error,
      };
    }

    return {
      ok: true,
      value: {
        latestRun: latestRunResult.value
          ? {
              id: latestRunResult.value.id,
              status: latestRunResult.value.status,
              entityType: latestRunResult.value.entityType,
              recordsSynced: latestRunResult.value.recordsSynced,
              recordsFailed: latestRunResult.value.recordsFailed,
              startedAt: latestRunResult.value.startedAt,
              completedAt: latestRunResult.value.completedAt,
            }
          : null,
        recentRuns: recentRunsResult.value.map((run) => ({
          id: run.id,
          status: run.status,
          entityType: run.entityType,
          recordsSynced: run.recordsSynced,
          recordsFailed: run.recordsFailed,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
        })),
        recentAuditEvents: auditEventsResult.value.map((event) => ({
          id: event.id,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          actorUserId: event.actorUserId,
          payload: event.payload,
          createdAt: event.createdAt,
        })),
        hasXeroConnection: xeroConnectionResult.value,
      },
    };
  } catch {
    return {
      ok: false,
      error: appError("internal", "Failed to load sync health data"),
    };
  }
}
