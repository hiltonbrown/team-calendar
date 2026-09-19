import { log } from "@repo/observability/log";
import { sanitizeObject } from "@repo/observability/scrubber";
import "server-only";

import type { Result } from "@repo/core";
import { database, scopedTo as scoped } from "@repo/database";
import { z } from "zod";
import { scrubXeroWriteErrorRaw } from "../settings/shared";
import {
  dispatchCancelSyncRun,
  dispatchSyncEvent,
  getRegisteredSyncEventName,
  syncEventNames,
} from "./sync-events";

export type SyncMonitorError =
  | { code: "connection_not_active"; message: string }
  | { code: "dispatch_failed"; message: string }
  | { code: "invalid_run_type"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "tenant_sync_paused"; message: string }
  | { code: "run_not_found"; message: string }
  | { code: "tenant_not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export type SyncRunType =
  | "approval_state_reconciliation"
  | "leave_balances"
  | "leave_records"
  | "people";
export type SyncRunStatus =
  | "cancelled"
  | "failed"
  | "partial_success"
  | "running"
  | "succeeded";
export type SyncTriggerType = "manual" | "scheduled" | "webhook";
export type SyncMonitorRole =
  | "admin"
  | "contractor"
  | "manager"
  | "owner"
  | "viewer";

export interface TenantSummary {
  connectionStatus: "active" | "expired" | "not_configured" | "revoked";
  currentFailedRuns: number;
  currentPartialSuccessRuns: number;
  currentRun: {
    id: string;
    runType: SyncRunType;
    startedAt: Date;
  } | null;
  failedRunsLast30Days: number;
  lastApprovalReconciliation: Date | null;
  lastLeaveBalancesSync: Date | null;
  lastLeaveRecordsSync: Date | null;
  lastPeopleSync: Date | null;
  lastRefreshedAt: Date | null;
  lastRun: {
    completedAt: Date | null;
    id: string;
    recordsFailed: number;
    recordsUpserted: number;
    runType: SyncRunType;
    startedAt: Date;
    status: SyncRunStatus;
  } | null;
  payrollRegion: "AU" | "NZ" | "UK";
  pendingFailedRecords: number;
  syncPausedAt: Date | null;
  tenantName: string;
  totalRunsLast30Days: number;
  xeroTenantId: string;
}

export interface RunListItem {
  completedAt: Date | null;
  durationSeconds: number | null;
  errorSummary: string | null;
  hasFailedRecords: boolean;
  id: string;
  recordsFailed: number;
  recordsFetched: number;
  recordsSkipped: number;
  recordsUpserted: number;
  runType: SyncRunType;
  startedAt: Date;
  status: SyncRunStatus;
  tenantName: string;
  triggeredByUserDisplay: string;
  triggerType: SyncTriggerType;
  xeroTenantId: string | null;
}

export interface RunDetail {
  failedRecords: FailedRecordSummary[];
  failedRecordsNextCursor: string | null;
  run: RunListItem;
  timeline: TimelineEvent[];
  timelineNextCursor: string | null;
}

export interface FailedRecordSummary {
  createdAt: Date;
  errorCode: string;
  errorMessage: string;
  id: string;
  recordType: string;
  sourceRemoteId: string | null;
}

export interface TimelineEvent {
  action: string;
  actorUserId: string | null;
  createdAt: Date;
  id: string;
}

export interface RunDetailPage {
  nextCursor: string | null;
  records: FailedRecordSummary[];
}

export interface TimelinePage {
  events: TimelineEvent[];
  nextCursor: string | null;
}

export interface SyncRunFilters {
  dateFrom?: Date;
  dateTo?: Date;
  runType?: SyncRunType[];
  status?: SyncRunStatus[];
  triggerType?: SyncTriggerType[];
  xeroTenantId?: string[];
}

const RoleSchema = z.enum([
  "admin",
  "contractor",
  "manager",
  "owner",
  "viewer",
]);
const RunTypeSchema = z.enum([
  "people",
  "leave_records",
  "leave_balances",
  "approval_state_reconciliation",
]);
const RunStatusSchema = z.enum([
  "running",
  "succeeded",
  "partial_success",
  "failed",
  "cancelled",
]);
const TriggerTypeSchema = z.enum(["scheduled", "manual", "webhook"]);

const BaseSchema = z.object({
  actingRole: RoleSchema,
  actingUserId: z.string().min(1).optional(),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});
const ListTenantSummariesSchema = BaseSchema;
const ListRunsSchema = BaseSchema.extend({
  filters: z
    .object({
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      runType: z.array(RunTypeSchema).optional(),
      status: z.array(RunStatusSchema).optional(),
      triggerType: z.array(TriggerTypeSchema).optional(),
      xeroTenantId: z.array(z.string().uuid()).optional(),
    })
    .optional(),
  pagination: z
    .object({
      cursor: z.string().min(1).nullable().optional(),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    })
    .optional(),
});
const GetRunDetailSchema = BaseSchema.extend({
  runId: z.string().uuid(),
});
const DetailPageSchema = GetRunDetailSchema.extend({
  cursor: z.string().min(1).nullable().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
const GetRawFailureSchema = BaseSchema.extend({
  actingUserId: z.string().min(1),
  failureId: z.string().uuid(),
  runId: z.string().uuid(),
});
const DispatchManualSyncSchema = BaseSchema.extend({
  actingUserId: z.string().min(1),
  runType: RunTypeSchema,
  xeroTenantId: z.string().uuid(),
});
const ExportFailedRecordsCsvSchema = BaseSchema.extend({
  actingUserId: z.string().min(1),
  runId: z.string().uuid(),
});
const CancelRunSchema = BaseSchema.extend({
  actingUserId: z.string().min(1),
  runId: z.string().uuid(),
});

type BaseInput = z.infer<typeof BaseSchema>;
type ListRunsInput = z.infer<typeof ListRunsSchema>;
type GetRunDetailInput = z.infer<typeof GetRunDetailSchema>;
type DispatchManualSyncInput = z.infer<typeof DispatchManualSyncSchema>;
type ExportFailedRecordsCsvInput = z.infer<typeof ExportFailedRecordsCsvSchema>;
type CancelRunInput = z.infer<typeof CancelRunSchema>;

const CSV_EXPORT_LIMIT = 50_000;
const CSV_ESCAPE_PATTERN = /[",\r\n]/;
const SUCCESS_STATUSES: SyncRunStatus[] = ["succeeded", "partial_success"];
const syncRunTypes: SyncRunType[] = [
  "approval_state_reconciliation",
  "leave_balances",
  "leave_records",
  "people",
];
const DETAIL_PAGE_SIZE = 50;

export async function listTenantSummaries(
  input: z.input<typeof ListTenantSummariesSchema>
): Promise<Result<TenantSummary[], SyncMonitorError>> {
  const parsed = ListTenantSummariesSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const tenants = await database.xeroTenant.findMany({
      include: { xero_connection: true },
      orderBy: { tenant_name: "asc" },
      where: scoped(parsed.data),
    });
    const tenantIds = tenants.map((tenant) => tenant.id);
    if (tenantIds.length === 0) {
      return { ok: true, value: [] };
    }

    const since = daysAgo(30);
    const summarySelect = {
      completed_at: true,
      id: true,
      records_failed: true,
      records_upserted: true,
      run_type: true,
      started_at: true,
      status: true,
      xero_tenant_id: true,
    } as const;
    const [latestCompleted, latestSuccessful, currentRuns, runCounts] =
      await Promise.all([
        Promise.all(
          tenants.flatMap((tenant) =>
            syncRunTypes.map((runType) =>
              database.syncRun.findFirst({
                orderBy: [{ started_at: "desc" }, { id: "desc" }],
                select: summarySelect,
                where: {
                  ...scoped(parsed.data),
                  run_type: runType,
                  status: { not: "running" },
                  xero_tenant_id: tenant.id,
                },
              })
            )
          )
        ).then(nonNullRows),
        Promise.all(
          tenants.flatMap((tenant) =>
            syncRunTypes.map((runType) =>
              database.syncRun.findFirst({
                orderBy: [{ started_at: "desc" }, { id: "desc" }],
                select: summarySelect,
                where: {
                  ...scoped(parsed.data),
                  run_type: runType,
                  status: { in: SUCCESS_STATUSES },
                  xero_tenant_id: tenant.id,
                },
              })
            )
          )
        ).then(nonNullRows),
        Promise.all(
          tenants.map((tenant) =>
            database.syncRun.findFirst({
              orderBy: [{ started_at: "desc" }, { id: "desc" }],
              select: summarySelect,
              where: {
                ...scoped(parsed.data),
                status: "running",
                xero_tenant_id: tenant.id,
              },
            })
          )
        ).then(nonNullRows),
        database.syncRun.groupBy({
          _count: { _all: true },
          by: ["xero_tenant_id", "status"],
          where: {
            ...scoped(parsed.data),
            started_at: { gte: since },
            xero_tenant_id: { in: tenantIds },
          },
        }),
      ]);

    const pendingCounts = await Promise.all(
      tenants.flatMap((tenant) =>
        syncRunTypes.map(async (runType) => {
          const success = latestSuccessful.find(
            (run) =>
              run.xero_tenant_id === tenant.id && run.run_type === runType
          );
          const count = await database.failedRecord.count({
            where: {
              ...scoped(parsed.data),
              ...(success ? { created_at: { gt: success.started_at } } : {}),
              sync_run: {
                run_type: runType,
                xero_tenant_id: tenant.id,
              },
            },
          });
          return { count, tenantId: tenant.id };
        })
      )
    );

    return {
      ok: true,
      value: tenants.map((tenant) => {
        const completedRuns = latestCompletedRunsByType(
          latestCompleted.filter((run) => run.xero_tenant_id === tenant.id)
        );
        const currentRun = currentRuns.find(
          (run) => run.xero_tenant_id === tenant.id
        );
        const lastRun = completedRuns.reduce<
          (typeof completedRuns)[number] | undefined
        >(
          (latest, run) =>
            !latest || run.started_at > latest.started_at ? run : latest,
          undefined
        );
        const counts = runCounts.filter(
          (row) => row.xero_tenant_id === tenant.id
        );
        const totalRunsLast30Days = counts.reduce(
          (total, row) => total + row._count._all,
          0
        );
        const failedRunsLast30Days =
          counts.find((row) => row.status === "failed")?._count._all ?? 0;
        const pendingFailedRecords = pendingCounts
          .filter((entry) => entry.tenantId === tenant.id)
          .reduce((total, entry) => total + entry.count, 0);

        return {
          connectionStatus: connectionStatus(tenant.xero_connection),
          currentFailedRuns: completedRuns.filter(
            (run) => run.status === "failed"
          ).length,
          currentPartialSuccessRuns: completedRuns.filter(
            (run) => run.status === "partial_success"
          ).length,
          currentRun: currentRun
            ? {
                id: currentRun.id,
                runType: currentRun.run_type,
                startedAt: currentRun.started_at,
              }
            : null,
          failedRunsLast30Days,
          lastApprovalReconciliation: latestCompletedRunAt(
            completedRuns,
            "approval_state_reconciliation"
          ),
          lastLeaveBalancesSync: latestCompletedRunAt(
            completedRuns,
            "leave_balances"
          ),
          lastLeaveRecordsSync: latestCompletedRunAt(
            completedRuns,
            "leave_records"
          ),
          lastPeopleSync: latestCompletedRunAt(completedRuns, "people"),
          lastRefreshedAt: tenant.xero_connection.last_refreshed_at,
          lastRun: lastRun
            ? {
                completedAt: lastRun.completed_at,
                id: lastRun.id,
                recordsFailed: lastRun.records_failed,
                recordsUpserted: lastRun.records_upserted,
                runType: lastRun.run_type,
                startedAt: lastRun.started_at,
                status: lastRun.status,
              }
            : null,
          payrollRegion: tenant.payroll_region,
          pendingFailedRecords,
          syncPausedAt: tenant.sync_paused_at,
          tenantName: tenant.tenant_name ?? tenant.xero_tenant_id,
          totalRunsLast30Days,
          xeroTenantId: tenant.id,
        };
      }),
    };
  } catch {
    return unknownError("Failed to load sync tenant summaries.");
  }
}

export async function listRuns(
  input: z.input<typeof ListRunsSchema>
): Promise<
  Result<{ nextCursor: string | null; runs: RunListItem[] }, SyncMonitorError>
> {
  const parsed = ListRunsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const pageSize = parsed.data.pagination?.pageSize ?? 50;
    const cursor = decodeCursor(parsed.data.pagination?.cursor ?? null);
    const where = runWhere(parsed.data, cursor);
    const rows = await database.syncRun.findMany({
      include: {
        _count: { select: { failed_records: true } },
        xero_tenant: { select: { id: true, tenant_name: true } },
      },
      orderBy: [{ started_at: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      where,
    });
    const page = rows.slice(0, pageSize);
    const people = await loadTriggeredByPeople(parsed.data, page);
    const runs = page.map((run) => toRunListItem(run, people));
    const last = page.at(-1);

    return {
      ok: true,
      value: {
        nextCursor:
          rows.length > pageSize && last
            ? encodeCursor({ id: last.id, startedAt: last.started_at })
            : null,
        runs,
      },
    };
  } catch {
    return unknownError("Failed to load sync run history.");
  }
}

export async function getRunDetail(
  input: z.input<typeof GetRunDetailSchema>
): Promise<Result<RunDetail, SyncMonitorError>> {
  const parsed = GetRunDetailSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const run = await database.syncRun.findFirst({
      include: {
        _count: { select: { failed_records: true } },
        xero_tenant: { select: { id: true, tenant_name: true } },
      },
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
      },
    });
    if (!run) {
      return await runNotFound(parsed.data);
    }

    const [people, failedRecords, timeline] = await Promise.all([
      loadTriggeredByPeople(parsed.data, [run]),
      database.failedRecord.findMany({
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: {
          created_at: true,
          error_code: true,
          error_message: true,
          id: true,
          record_type: true,
          source_remote_id: true,
        },
        take: DETAIL_PAGE_SIZE + 1,
        where: {
          ...scoped(parsed.data),
          sync_run_id: run.id,
        },
      }),
      database.auditEvent.findMany({
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: {
          action: true,
          actor_user_id: true,
          created_at: true,
          id: true,
        },
        take: DETAIL_PAGE_SIZE + 1,
        where: {
          ...scoped(parsed.data),
          OR: [
            { resource_id: run.id, resource_type: "sync_run" },
            { action: { startsWith: "sync." }, resource_id: run.id },
          ],
        },
      }),
    ]);

    const failurePage = failedRecords.slice(0, DETAIL_PAGE_SIZE);
    const timelinePage = timeline.slice(0, DETAIL_PAGE_SIZE);
    return {
      ok: true,
      value: {
        failedRecords: failurePage.map((record) => ({
          createdAt: record.created_at,
          errorCode: record.error_code,
          errorMessage: record.error_message,
          id: record.id,
          recordType: record.record_type,
          sourceRemoteId: record.source_remote_id,
        })),
        failedRecordsNextCursor: pageCursor(failedRecords, DETAIL_PAGE_SIZE),
        run: toRunListItem(run, people),
        timeline: timelinePage.map((event) => ({
          action: event.action,
          actorUserId: event.actor_user_id,
          createdAt: event.created_at,
          id: event.id,
        })),
        timelineNextCursor: pageCursor(timeline, DETAIL_PAGE_SIZE),
      },
    };
  } catch {
    return unknownError("Failed to load sync run detail.");
  }
}

export async function listRunFailedRecords(
  input: z.input<typeof DetailPageSchema>
): Promise<Result<RunDetailPage, SyncMonitorError>> {
  const parsed = DetailPageSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const cursor = decodeCreatedCursor(parsed.data.cursor ?? null);
  if (parsed.data.cursor && !cursor) {
    return validationErrorMessage("Invalid page cursor.");
  }
  try {
    const runExists = await database.syncRun.findFirst({
      select: { id: true },
      where: { ...scoped(parsed.data), id: parsed.data.runId },
    });
    if (!runExists) {
      return await runNotFound(parsed.data);
    }
    const rows = await database.failedRecord.findMany({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: {
        created_at: true,
        error_code: true,
        error_message: true,
        id: true,
        record_type: true,
        source_remote_id: true,
      },
      take: parsed.data.pageSize + 1,
      where: {
        ...scoped(parsed.data),
        sync_run_id: parsed.data.runId,
        ...createdCursorWhere(cursor),
      },
    });
    return {
      ok: true,
      value: {
        nextCursor: pageCursor(rows, parsed.data.pageSize),
        records: rows.slice(0, parsed.data.pageSize).map((row) => ({
          createdAt: row.created_at,
          errorCode: row.error_code,
          errorMessage: row.error_message,
          id: row.id,
          recordType: row.record_type,
          sourceRemoteId: row.source_remote_id,
        })),
      },
    };
  } catch {
    return unknownError("Failed to load failed records.");
  }
}

export async function listRunTimeline(
  input: z.input<typeof DetailPageSchema>
): Promise<Result<TimelinePage, SyncMonitorError>> {
  const parsed = DetailPageSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const cursor = decodeCreatedCursor(parsed.data.cursor ?? null);
  if (parsed.data.cursor && !cursor) {
    return validationErrorMessage("Invalid page cursor.");
  }
  try {
    const runExists = await database.syncRun.findFirst({
      select: { id: true },
      where: { ...scoped(parsed.data), id: parsed.data.runId },
    });
    if (!runExists) {
      return await runNotFound(parsed.data);
    }
    const rows = await database.auditEvent.findMany({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { action: true, actor_user_id: true, created_at: true, id: true },
      take: parsed.data.pageSize + 1,
      where: {
        ...scoped(parsed.data),
        OR: [
          { resource_id: parsed.data.runId, resource_type: "sync_run" },
          { action: { startsWith: "sync." }, resource_id: parsed.data.runId },
        ],
        ...createdCursorWhere(cursor),
      },
    });
    return {
      ok: true,
      value: {
        events: rows.slice(0, parsed.data.pageSize).map((row) => ({
          action: row.action,
          actorUserId: row.actor_user_id,
          createdAt: row.created_at,
          id: row.id,
        })),
        nextCursor: pageCursor(rows, parsed.data.pageSize),
      },
    };
  } catch {
    return unknownError("Failed to load sync timeline.");
  }
}

export async function getRedactedFailedRecordPayload(
  input: z.input<typeof GetRawFailureSchema>
): Promise<Result<{ payload: unknown }, SyncMonitorError>> {
  const parsed = GetRawFailureSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (
    !(parsed.data.actingRole === "admin" || parsed.data.actingRole === "owner")
  ) {
    return notAuthorised();
  }
  try {
    return await database.$transaction(async (tx) => {
      const failure = await tx.failedRecord.findFirst({
        select: { id: true, raw_payload: true },
        where: {
          ...scoped(parsed.data),
          id: parsed.data.failureId,
          sync_run: { ...scoped(parsed.data), id: parsed.data.runId },
          sync_run_id: parsed.data.runId,
        },
      });
      if (!failure) {
        return runNotFoundResult();
      }
      await tx.auditEvent.create({
        data: {
          action: "sync.failed_record_payload_viewed",
          actor_user_id: parsed.data.actingUserId,
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          resource_id: failure.id,
          resource_type: "failed_record",
        },
      });
      const scrubbed = scrubXeroWriteErrorRaw(failure.raw_payload);
      const payload =
        scrubbed && typeof scrubbed === "object" && !Array.isArray(scrubbed)
          ? sanitizeObject(scrubbed as Record<string, unknown>)
          : "[SCRUBBED]";
      return { ok: true, value: { payload } };
    });
  } catch {
    return unknownError("Failed to load failed record payload.");
  }
}

export async function dispatchManualSync(
  input: z.input<typeof DispatchManualSyncSchema>
): Promise<
  Result<
    { eventName: string; queued: boolean; reason?: string },
    SyncMonitorError
  >
> {
  const parsed = DispatchManualSyncSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const tenant = await database.xeroTenant.findFirst({
      include: { xero_connection: true },
      where: {
        ...scoped(parsed.data),
        id: parsed.data.xeroTenantId,
      },
    });
    if (!tenant) {
      return await tenantNotFound(parsed.data);
    }

    const eventName = syncEventNames[parsed.data.runType];
    if (tenant.sync_paused_at) {
      return {
        ok: true,
        value: {
          eventName,
          queued: false,
          reason: "tenant_sync_paused",
        },
      };
    }
    if (!getRegisteredSyncEventName(parsed.data.runType)) {
      return {
        ok: true,
        value: {
          eventName,
          queued: false,
          reason: "dispatch_not_wired",
        },
      };
    }

    if (connectionStatus(tenant.xero_connection) !== "active") {
      return {
        ok: true,
        value: {
          eventName,
          queued: false,
          reason: "connection_not_active",
        },
      };
    }

    const dispatched = await dispatchSyncEvent({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
      runType: parsed.data.runType,
      triggeredByUserId: parsed.data.actingUserId,
      triggerType: "manual",
      xeroTenantId: parsed.data.xeroTenantId,
    });
    if (!dispatched.ok) {
      return {
        error: {
          code:
            dispatched.error.code === "dispatch_not_wired"
              ? "invalid_run_type"
              : dispatched.error.code,
          message: dispatched.error.message,
        },
        ok: false,
      };
    }

    await database.auditEvent.create({
      data: {
        ...auditBase(parsed.data, parsed.data.actingUserId),
        action: "sync.manual_dispatched",
        payload: {
          actingUserId: parsed.data.actingUserId,
          eventName,
          runType: parsed.data.runType,
          xeroTenantId: parsed.data.xeroTenantId,
        },
        resource_id: parsed.data.xeroTenantId,
        resource_type: "xero_tenant",
      },
    });

    return {
      ok: true,
      value: { eventName, queued: true },
    };
  } catch {
    return unknownError("Failed to dispatch the manual sync.");
  }
}

export async function exportFailedRecordsCsv(
  input: z.input<typeof ExportFailedRecordsCsvSchema>
): Promise<Result<{ csvContent: string; filename: string }, SyncMonitorError>> {
  const parsed = ExportFailedRecordsCsvSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const run = await database.syncRun.findFirst({
      select: { id: true },
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
      },
    });
    if (!run) {
      return await runNotFound(parsed.data);
    }

    const failedRecords = await database.failedRecord.findMany({
      orderBy: { created_at: "asc" },
      select: {
        created_at: true,
        error_code: true,
        error_message: true,
        record_type: true,
        source_remote_id: true,
      },
      take: CSV_EXPORT_LIMIT + 1,
      where: {
        ...scoped(parsed.data),
        sync_run_id: run.id,
      },
    });
    const truncated = failedRecords.length > CSV_EXPORT_LIMIT;
    const rows = failedRecords
      .slice(0, CSV_EXPORT_LIMIT)
      .map((record) => [
        record.record_type,
        record.source_remote_id ?? "",
        record.error_code,
        record.error_message,
        record.created_at.toISOString(),
      ]);
    if (truncated) {
      rows.push([
        "# Truncated after 50000 rows; use the API for full export",
        "",
        "",
        "",
        "",
      ]);
    }
    const csvContent = toCsv([
      [
        "record_type",
        "source_remote_id",
        "error_code",
        "error_message",
        "created_at",
      ],
      ...rows,
    ]);

    await database.auditEvent.create({
      data: {
        ...auditBase(parsed.data, parsed.data.actingUserId),
        action: "sync.failed_records_exported",
        payload: {
          actingUserId: parsed.data.actingUserId,
          rowCount: Math.min(failedRecords.length, CSV_EXPORT_LIMIT),
          runId: run.id,
        },
        resource_id: run.id,
        resource_type: "sync_run",
      },
    });

    return {
      ok: true,
      value: {
        csvContent,
        filename: `sync-failed-records-${run.id}-${dateStamp(new Date())}.csv`,
      },
    };
  } catch {
    return unknownError("Failed to export failed records.");
  }
}

export async function cancelRun(
  input: z.input<typeof CancelRunSchema>
): Promise<
  Result<
    { cancellationRequested: true; eventQueued: boolean },
    SyncMonitorError
  >
> {
  const parsed = CancelRunSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }

  try {
    const run = await database.syncRun.findFirst({
      select: { id: true },
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
        status: "running",
      },
    });
    if (!run) {
      return await runNotFound(parsed.data);
    }

    await database.syncRun.update({
      data: { cancel_requested_at: new Date() },
      where: { id: run.id },
    });
    const queued = await dispatchCancelSyncRun({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
      runId: run.id,
    });
    await database.auditEvent.create({
      data: {
        ...auditBase(parsed.data, parsed.data.actingUserId),
        action: "sync.cancel_requested",
        payload: {
          actingUserId: parsed.data.actingUserId,
          eventQueued: queued.ok,
          runId: run.id,
        },
        resource_id: run.id,
        resource_type: "sync_run",
      },
    });

    return {
      ok: true,
      value: { cancellationRequested: true, eventQueued: queued.ok },
    };
  } catch {
    return unknownError("Failed to request sync cancellation.");
  }
}

function canUseSyncMonitor(role: SyncMonitorRole): boolean {
  return role === "admin" || role === "owner";
}

function auditBase(input: BaseInput, actingUserId: string) {
  return {
    actor_user_id: actingUserId,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
}

function connectionStatus(connection: {
  access_token_encrypted: string;
  disconnected_at?: Date | null;
  expires_at: Date;
  last_refreshed_at: Date | null;
  status?: string;
  refresh_token_encrypted: string;
  revoked_at: Date | null;
}): TenantSummary["connectionStatus"] {
  if (connection.status === "disconnected" || connection.disconnected_at) {
    return "not_configured";
  }
  if (connection.status === "stale") {
    return "expired";
  }
  if (connection.revoked_at) {
    return "revoked";
  }
  if (
    connection.access_token_encrypted.trim().length === 0 ||
    connection.refresh_token_encrypted.trim().length === 0
  ) {
    return "not_configured";
  }
  if (connection.status === "active") {
    return "active";
  }
  return "not_configured";
}

function latestCompletedRunAt(
  runs: Array<{
    completed_at: Date | null;
    run_type: SyncRunType;
    status: SyncRunStatus;
  }>,
  runType: SyncRunType
): Date | null {
  return (
    runs.find(
      (run) =>
        run.run_type === runType &&
        run.completed_at &&
        isSuccessStatus(run.status)
    )?.completed_at ?? null
  );
}

function latestCompletedRunsByType<
  T extends {
    run_type: SyncRunType;
    started_at: Date;
    status: SyncRunStatus;
  },
>(runs: T[]): T[] {
  const latestRuns = new Map<SyncRunType, T>();

  for (const run of runs) {
    if (run.status === "cancelled" || run.status === "running") {
      continue;
    }
    const latestRun = latestRuns.get(run.run_type);
    if (latestRun && latestRun.started_at >= run.started_at) {
      continue;
    }
    latestRuns.set(run.run_type, run);
  }

  return [...latestRuns.values()];
}

function isSuccessStatus(status: SyncRunStatus): boolean {
  return SUCCESS_STATUSES.includes(status);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function nonNullRows<T>(rows: Array<T | null>): T[] {
  return rows.filter((row): row is T => row !== null);
}

function decodeCursor(
  cursor: string | null
): { id: string; startedAt: Date } | null {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = CursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    );
    if (!parsed.success) {
      return null;
    }
    return { id: parsed.data.id, startedAt: parsed.data.startedAt };
  } catch {
    return null;
  }
}

const CursorSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.coerce.date(),
});

function encodeCursor(input: { id: string; startedAt: Date }): string {
  return Buffer.from(
    JSON.stringify({ id: input.id, startedAt: input.startedAt.toISOString() })
  ).toString("base64url");
}

function decodeCreatedCursor(
  cursor: string | null
): { createdAt: Date; id: string } | null {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = CreatedCursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    );
    return parsed.success
      ? { createdAt: parsed.data.createdAt, id: parsed.data.id }
      : null;
  } catch {
    return null;
  }
}

const CreatedCursorSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.string().uuid(),
});

function createdCursorWhere(cursor: { createdAt: Date; id: string } | null) {
  return cursor
    ? {
        OR: [
          { created_at: { lt: cursor.createdAt } },
          { created_at: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};
}

function pageCursor(
  rows: Array<{ created_at: Date; id: string }>,
  pageSize: number
): string | null {
  if (rows.length <= pageSize) {
    return null;
  }
  const last = rows[pageSize - 1];
  if (!last) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({ createdAt: last.created_at.toISOString(), id: last.id })
  ).toString("base64url");
}

function runWhere(
  input: ListRunsInput,
  cursor: { id: string; startedAt: Date } | null
) {
  const filters = input.filters ?? {};
  return {
    ...scoped(input),
    ...(filters.dateFrom ? { started_at: { gte: filters.dateFrom } } : {}),
    ...(filters.dateTo ? { started_at: { lte: filters.dateTo } } : {}),
    ...(filters.runType?.length ? { run_type: { in: filters.runType } } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.triggerType?.length
      ? { trigger_type: { in: filters.triggerType } }
      : {}),
    ...(filters.xeroTenantId?.length
      ? { xero_tenant_id: { in: filters.xeroTenantId } }
      : {}),
    ...(cursor
      ? {
          OR: [
            { started_at: { lt: cursor.startedAt } },
            { id: { lt: cursor.id }, started_at: cursor.startedAt },
          ],
        }
      : {}),
  };
}

async function loadTriggeredByPeople(
  input: { clerkOrgId: string; organisationId: string },
  runs: Array<{
    trigger_type: SyncTriggerType;
    triggered_by_user_id: string | null;
  }>
): Promise<Map<string, string>> {
  const userIds = [
    ...new Set(
      runs
        .map((run) =>
          run.trigger_type === "manual" ? run.triggered_by_user_id : null
        )
        .filter((userId): userId is string => Boolean(userId))
    ),
  ];
  if (userIds.length === 0) {
    return new Map();
  }
  const people = await database.person.findMany({
    select: {
      clerk_user_id: true,
      first_name: true,
      last_name: true,
    },
    where: {
      ...scoped(input),
      clerk_user_id: { in: userIds },
    },
  });
  return new Map(
    people.flatMap((person) =>
      person.clerk_user_id
        ? [
            [
              person.clerk_user_id,
              `${person.first_name} ${person.last_name.charAt(0)}.`,
            ],
          ]
        : []
    )
  );
}

function toRunListItem(
  run: {
    _count: { failed_records: number };
    completed_at: Date | null;
    error_summary: string | null;
    id: string;
    records_failed: number;
    records_fetched: number;
    records_skipped: number;
    records_upserted: number;
    run_type: SyncRunType;
    started_at: Date;
    status: SyncRunStatus;
    trigger_type: SyncTriggerType;
    triggered_by_user_id: string | null;
    xero_tenant: { id: string; tenant_name: string | null } | null;
    xero_tenant_id: string | null;
  },
  people: Map<string, string>
): RunListItem {
  return {
    completedAt: run.completed_at,
    durationSeconds: run.completed_at
      ? Math.max(
          0,
          Math.round(
            (run.completed_at.getTime() - run.started_at.getTime()) / 1000
          )
        )
      : null,
    errorSummary: run.error_summary,
    hasFailedRecords: run.records_failed > 0 || run._count.failed_records > 0,
    id: run.id,
    recordsFailed: run.records_failed,
    recordsFetched: run.records_fetched,
    recordsSkipped: run.records_skipped,
    recordsUpserted: run.records_upserted,
    runType: run.run_type,
    startedAt: run.started_at,
    status: run.status,
    tenantName:
      run.xero_tenant?.tenant_name ?? run.xero_tenant_id ?? "Unknown tenant",
    triggeredByUserDisplay:
      run.trigger_type === "scheduled"
        ? "System"
        : (people.get(run.triggered_by_user_id ?? "") ?? "User"),
    triggerType: run.trigger_type,
    xeroTenantId: run.xero_tenant_id,
  };
}

async function runNotFound(
  input: GetRunDetailInput | ExportFailedRecordsCsvInput | CancelRunInput
): Promise<Result<never, SyncMonitorError>> {
  const existing = await database.syncRun.findUnique({
    select: {
      clerk_org_id: true,
      organisation_id: true,
    },
    where: { id: input.runId },
  });
  if (
    existing &&
    (existing.clerk_org_id !== input.clerkOrgId ||
      existing.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
      actingOrganisationId: input.organisationId,
      resourceId: input.runId,
      resourceType: "sync_run",
    });
  }
  return {
    error: { code: "run_not_found", message: "Sync run not found." },
    ok: false,
  };
}

async function tenantNotFound(
  input: DispatchManualSyncInput
): Promise<Result<never, SyncMonitorError>> {
  const existing = await database.xeroTenant.findUnique({
    select: {
      clerk_org_id: true,
      organisation_id: true,
    },
    where: { id: input.xeroTenantId },
  });
  if (
    existing &&
    (existing.clerk_org_id !== input.clerkOrgId ||
      existing.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
      actingOrganisationId: input.organisationId,
      resourceId: input.xeroTenantId,
      resourceType: "xero_tenant",
    });
  }
  return {
    error: { code: "tenant_not_found", message: "Xero tenant not found." },
    ok: false,
  };
}

function toCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n")}\r\n`;
}

function escapeCsvField(value: string): string {
  if (CSV_ESCAPE_PATTERN.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function validationError(error: z.ZodError): Result<never, SyncMonitorError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid sync monitor input.",
    },
    ok: false,
  };
}

function validationErrorMessage(
  message: string
): Result<never, SyncMonitorError> {
  return { error: { code: "validation_error", message }, ok: false };
}

function runNotFoundResult(): Result<never, SyncMonitorError> {
  return {
    error: { code: "run_not_found", message: "Sync run not found." },
    ok: false,
  };
}

function notAuthorised(): Result<never, SyncMonitorError> {
  return {
    error: {
      code: "not_authorised",
      message: "Only admins and owners can use sync health.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, SyncMonitorError> {
  return {
    error: { code: "unknown_error", message },
    ok: false,
  };
}
