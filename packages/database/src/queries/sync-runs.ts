import type { AccountId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import { assertTenantDb, type TenantDb } from "../tenant-db";
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
  accountId: string;
  action: string;
  actorUserId: string | null;
  createdAt: Date;
  id: string;
  organisationId: OrganisationId;
  payload: unknown;
  resourceId: string | null;
  resourceType: string;
}

export async function getLatestSyncRunSummary(
  accountId: AccountId,
  organisationId: OrganisationId,
  db: TenantDb
): Promise<Result<SyncRunSummaryData | null>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const syncRun = await tenantDb.syncRun.findFirst({
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
          ...scopedQuery(accountId, organisationId),
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
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to get latest sync run"),
        ok: false,
      };
    }
  }
}

export async function listRecentSyncRuns(
  accountId: AccountId,
  organisationId: OrganisationId,
  limit: number | undefined,
  db: TenantDb
): Promise<Result<SyncRunSummaryData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb2 = db;

    try {
      const syncRuns = await tenantDb2.syncRun.findMany({
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
          ...scopedQuery(accountId, organisationId),
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
    } catch (error) {
      if (tenantDb2) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list sync runs"),
        ok: false,
      };
    }
  }
}

export async function listFailedRecordsForSyncRun(
  accountId: AccountId,
  organisationId: OrganisationId,
  syncRunId: string,
  db: TenantDb
): Promise<Result<FailedRecordData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb3 = db;

    try {
      const failedRecords = await tenantDb3.failedRecord.findMany({
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
          ...scopedQuery(accountId, organisationId),
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
    } catch (error) {
      if (tenantDb3) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list failed records"),
        ok: false,
      };
    }
  }
}

export async function listRecentAuditEvents(
  accountId: AccountId,
  organisationId: OrganisationId,
  limit: number | undefined,
  db: TenantDb
): Promise<Result<AuditEventData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb4 = db;

    try {
      const auditEvents = await tenantDb4.auditEvent.findMany({
        orderBy: { created_at: "desc" },
        select: {
          account_id: true,
          action: true,
          actor_user_id: true,
          created_at: true,
          id: true,
          organisation_id: true,
          payload: true,
          resource_id: true,
          resource_type: true,
        },
        take: limit ?? 20,
        where: {
          ...scopedQuery(accountId, organisationId),
        },
      });

      return {
        ok: true,
        value: auditEvents.map((e) => ({
          accountId: e.account_id,
          action: e.action,
          actorUserId: e.actor_user_id,
          createdAt: e.created_at,
          id: e.id,
          organisationId: e.organisation_id as OrganisationId,
          payload: e.payload,
          resourceId: e.resource_id,
          resourceType: e.resource_type,
        })),
      };
    } catch (error) {
      if (tenantDb4) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list audit events"),
        ok: false,
      };
    }
  }
}
