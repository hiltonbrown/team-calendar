import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { tenantDatabase } from "../tenant-client";
import { scopedQuery } from "../tenant-query";

export interface SyncRunSummaryData {
  completedAt: Date | null;
  entityType: string | null;
  id: string;
  recordsFailed: number;
  recordsSynced: number;
  startedAt: Date;
  status: string;
}

export interface FailedRecordData {
  createdAt: Date;
  entityType: string;
  errorMessage: string;
  id: string;
  sourceId: string;
  syncRunId: string;
}

export interface AuditEventData {
  action: string;
  actorUserId: string | null;
  clerkOrgId: string;
  createdAt: Date;
  id: string;
  organisationId: OrganisationId;
  payload: unknown;
  resourceId: string | null;
  resourceType: string;
}

export async function getLatestSyncRunSummary(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId
): Promise<Result<SyncRunSummaryData | null>> {
  try {
    const syncRun = await tenantDatabase(clerkOrgId).syncRun.findFirst({
      orderBy: { started_at: "desc" },
      select: {
        completed_at: true,
        entity_type: true,
        id: true,
        records_failed: true,
        records_synced: true,
        started_at: true,
        status: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
      },
    });

    if (!syncRun) {
      return {
        ok: true,
        value: null,
      };
    }

    return {
      ok: true,
      value: {
        completedAt: syncRun.completed_at,
        entityType: syncRun.entity_type,
        id: syncRun.id,
        recordsFailed: syncRun.records_failed,
        recordsSynced: syncRun.records_synced,
        startedAt: syncRun.started_at,
        status: syncRun.status,
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to get latest sync run"),
      ok: false,
    };
  }
}

export async function listRecentSyncRuns(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  limit?: number
): Promise<Result<SyncRunSummaryData[]>> {
  try {
    const syncRuns = await tenantDatabase(clerkOrgId).syncRun.findMany({
      orderBy: { started_at: "desc" },
      select: {
        completed_at: true,
        entity_type: true,
        id: true,
        records_failed: true,
        records_synced: true,
        started_at: true,
        status: true,
      },
      take: limit ?? 10,
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
      },
    });

    return {
      ok: true,
      value: syncRuns.map((r) => ({
        completedAt: r.completed_at,
        entityType: r.entity_type,
        id: r.id,
        recordsFailed: r.records_failed,
        recordsSynced: r.records_synced,
        startedAt: r.started_at,
        status: r.status,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list sync runs"),
      ok: false,
    };
  }
}

export async function listFailedRecordsForSyncRun(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  syncRunId: string
): Promise<Result<FailedRecordData[]>> {
  try {
    const failedRecords = await tenantDatabase(
      clerkOrgId
    ).failedRecord.findMany({
      orderBy: { created_at: "desc" },
      select: {
        created_at: true,
        entity_type: true,
        error_message: true,
        id: true,
        source_id: true,
        sync_run_id: true,
      },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        sync_run_id: syncRunId,
      },
    });

    return {
      ok: true,
      value: failedRecords.map((r) => ({
        createdAt: r.created_at,
        entityType: r.entity_type,
        errorMessage: r.error_message,
        id: r.id,
        sourceId: r.source_id,
        syncRunId: r.sync_run_id,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list failed records"),
      ok: false,
    };
  }
}

export async function listRecentAuditEvents(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  limit?: number
): Promise<Result<AuditEventData[]>> {
  try {
    const auditEvents = await tenantDatabase(clerkOrgId).auditEvent.findMany({
      orderBy: { created_at: "desc" },
      select: {
        action: true,
        actor_user_id: true,
        clerk_org_id: true,
        created_at: true,
        id: true,
        organisation_id: true,
        payload: true,
        resource_id: true,
        resource_type: true,
      },
      take: limit ?? 20,
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
      },
    });

    return {
      ok: true,
      value: auditEvents.map((e) => ({
        action: e.action,
        actorUserId: e.actor_user_id,
        clerkOrgId: e.clerk_org_id,
        createdAt: e.created_at,
        id: e.id,
        organisationId: e.organisation_id as OrganisationId,
        payload: e.payload,
        resourceId: e.resource_id,
        resourceType: e.resource_type,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list audit events"),
      ok: false,
    };
  }
}
