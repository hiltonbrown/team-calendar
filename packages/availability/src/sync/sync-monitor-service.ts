import { hasPermission } from "@repo/auth/permissions";
import { getScopedXeroAuthorisationMetadata } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { log } from "@repo/observability/log";
import { sanitizeObject } from "@repo/observability/scrubber";
import "server-only";
import type { Result } from "@repo/core";
import { xeroRecoveryMessage, xeroRecoveryMessageFromCode } from "@repo/core";
import {
  assertTenantDb,
  scopedTo as scoped,
  type TenantDb,
  withTenantDb,
} from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";
import { scrubXeroWriteErrorRaw } from "../settings/shared";
import { getXeroConnectionStateForScope } from "../xero-connection-state";
import {
  dispatchCancelSyncRun,
  dispatchSyncEvent,
  getRegisteredSyncEventName,
  syncEventNames,
} from "./sync-events";
export type SyncMonitorError =
  | {
      code: "connection_not_active";
      message: string;
    }
  | {
      code: "dispatch_failed";
      message: string;
    }
  | {
      code: "invalid_run_type";
      message: string;
    }
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "tenant_sync_paused";
      message: string;
    }
  | {
      code: "run_not_found";
      message: string;
    }
  | {
      code: "tenant_not_found";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    };
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
  connectionId: string;
  connectionStatus:
    | "active"
    | "reconnect_required"
    | "disconnected"
    | "not_configured"
    | "unavailable";
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
}
export interface RunListItem {
  completedAt: Date | null;
  connectionId: string | null;
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
  connectionId?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  runType?: SyncRunType[];
  status?: SyncRunStatus[];
  triggerType?: SyncTriggerType[];
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
  accountId: z.string().min(1),
  actingRole: RoleSchema,
  actingUserId: z.string().min(1).optional(),
  organisationId: z.string().uuid(),
});
const ListTenantSummariesSchema = BaseSchema;
const ListRunsSchema = BaseSchema.extend({
  filters: z
    .object({
      connectionId: z.array(z.string().uuid()).optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      runType: z.array(RunTypeSchema).optional(),
      status: z.array(RunStatusSchema).optional(),
      triggerType: z.array(TriggerTypeSchema).optional(),
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
  connectionId: z.string().uuid(),
  runType: RunTypeSchema,
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
  input: z.input<typeof ListTenantSummariesSchema>,
  db: TenantDb
): Promise<Result<TenantSummary[], SyncMonitorError>> {
  assertTenantDb(db, input.accountId);

  const parsed = ListTenantSummariesSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const run = async (
    client: TenantDb
  ): ReturnType<typeof listTenantSummaries> => {
    const tenants = await client.xeroConnection.findMany({
      orderBy: { tenant_name: "asc" },
      where: scoped(parsed.data),
    });
    const stateResult = await getXeroConnectionStateForScope(
      parsed.data,
      client
    );
    const displayState = stateResult.ok
      ? stateResult.value.state
      : "unavailable";
    const tenantIds = tenants.map((tenant) => tenant.id);
    if (tenantIds.length === 0) {
      return { ok: true, value: [] };
    }
    const metadataByConnection = new Map<
      string,
      Awaited<ReturnType<typeof getScopedXeroAuthorisationMetadata>>
    >();
    for (const tenant of tenants) {
      metadataByConnection.set(
        tenant.id,
        await getScopedXeroAuthorisationMetadata(
          {
            accountId: parsed.data.accountId,
            connectionId: tenant.id,
            organisationId: parsed.data.organisationId,
          },
          client
        )
      );
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
      xero_connection_id: true,
    } as const;
    const completedRows: Array<Prisma.SyncRunGetPayload<{
      select: typeof summarySelect;
    }> | null> = [];
    const successfulRows: Array<Prisma.SyncRunGetPayload<{
      select: typeof summarySelect;
    }> | null> = [];
    const currentRows: Array<Prisma.SyncRunGetPayload<{
      select: typeof summarySelect;
    }> | null> = [];
    for (const tenant of tenants) {
      for (const runType of syncRunTypes) {
        completedRows.push(
          await client.syncRun.findFirst({
            orderBy: [{ started_at: "desc" }, { id: "desc" }],
            select: summarySelect,
            where: {
              ...scoped(parsed.data),
              run_type: runType,
              status: { not: "running" },
              xero_connection_id: tenant.id,
            },
          })
        );
        successfulRows.push(
          await client.syncRun.findFirst({
            orderBy: [{ started_at: "desc" }, { id: "desc" }],
            select: summarySelect,
            where: {
              ...scoped(parsed.data),
              run_type: runType,
              status: { in: SUCCESS_STATUSES },
              xero_connection_id: tenant.id,
            },
          })
        );
      }
      currentRows.push(
        await client.syncRun.findFirst({
          orderBy: [{ started_at: "desc" }, { id: "desc" }],
          select: summarySelect,
          where: {
            ...scoped(parsed.data),
            status: "running",
            xero_connection_id: tenant.id,
          },
        })
      );
    }
    const latestCompleted = nonNullRows(completedRows);
    const latestSuccessful = nonNullRows(successfulRows);
    const currentRuns = nonNullRows(currentRows);
    const runCounts = await client.syncRun.groupBy({
      _count: { _all: true },
      by: ["xero_connection_id", "status"],
      where: {
        ...scoped(parsed.data),
        started_at: { gte: since },
        xero_connection_id: { in: tenantIds },
      },
    });
    const pendingCounts: Array<{ count: number; tenantId: string }> = [];
    for (const tenant of tenants) {
      for (const runType of syncRunTypes) {
        const success = latestSuccessful.find(
          (executeTransaction) =>
            executeTransaction.xero_connection_id === tenant.id &&
            executeTransaction.run_type === runType
        );
        const count = await client.failedRecord.count({
          where: {
            ...scoped(parsed.data),
            ...(success ? { created_at: { gt: success.started_at } } : {}),
            sync_run: { run_type: runType, xero_connection_id: tenant.id },
          },
        });
        pendingCounts.push({ count, tenantId: tenant.id });
      }
    }
    return {
      ok: true,
      value: tenants.map((tenant) => {
        const completedRuns = latestCompletedRunsByType(
          latestCompleted.filter(
            (executeTransaction2) =>
              executeTransaction2.xero_connection_id === tenant.id
          )
        );
        const currentRun = currentRuns.find(
          (executeTransaction3) =>
            executeTransaction3.xero_connection_id === tenant.id
        );
        const lastRun = completedRuns.reduce<
          (typeof completedRuns)[number] | undefined
        >(
          (latest, executeTransaction4) =>
            !latest || executeTransaction4.started_at > latest.started_at
              ? executeTransaction4
              : latest,
          undefined
        );
        const counts = runCounts.filter(
          (row) => row.xero_connection_id === tenant.id
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
          connectionId: tenant.id,
          connectionStatus: connectionStatus(tenant, displayState),
          currentFailedRuns: completedRuns.filter(
            (executeTransaction5) => executeTransaction5.status === "failed"
          ).length,
          currentPartialSuccessRuns: completedRuns.filter(
            (executeTransaction6) =>
              executeTransaction6.status === "partial_success"
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
          lastRefreshedAt:
            metadataByConnection.get(tenant.id)?.last_refreshed_at ?? null,
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
          tenantName: tenant.tenant_name ?? tenant.id,
          totalRunsLast30Days,
        };
      }),
    };
  };
  assertTenantDb(db, input.accountId);
  return await run(db);
}
export async function listRuns(
  input: z.input<typeof ListRunsSchema>,
  db: TenantDb
): Promise<
  Result<
    {
      nextCursor: string | null;
      runs: RunListItem[];
    },
    SyncMonitorError
  >
> {
  assertTenantDb(db, input.accountId);

  const parsed = ListRunsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const run = async (client: TenantDb): ReturnType<typeof listRuns> => {
    const pageSize = parsed.data.pagination?.pageSize ?? 50;
    const cursor = decodeCursor(parsed.data.pagination?.cursor ?? null);
    const where = runWhere(parsed.data, cursor);
    const rows = await client.syncRun.findMany({
      include: {
        _count: { select: { failed_records: true } },
        xero_connection: { select: { id: true, tenant_name: true } },
      },
      orderBy: [{ started_at: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      where,
    });
    const page = rows.slice(0, pageSize);
    const people = await loadTriggeredByPeople(parsed.data, page, client);
    const runs = page.map((executeTransaction7) =>
      toRunListItem(executeTransaction7, people)
    );
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
  };
  assertTenantDb(db, input.accountId);
  return await run(db);
}
export async function getRunDetail(
  input: z.input<typeof GetRunDetailSchema>,
  db: TenantDb
): Promise<Result<RunDetail, SyncMonitorError>> {
  assertTenantDb(db, input.accountId);

  const parsed = GetRunDetailSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const run = async (client: TenantDb): ReturnType<typeof getRunDetail> => {
    const executeTransaction8 = await client.syncRun.findFirst({
      include: {
        _count: { select: { failed_records: true } },
        xero_connection: { select: { id: true, tenant_name: true } },
      },
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
      },
    });
    if (!executeTransaction8) {
      return await runNotFound(parsed.data, client);
    }
    const [people, failedRecords, timeline] = [
      await loadTriggeredByPeople(parsed.data, [executeTransaction8], client),
      await client.failedRecord.findMany({
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
          sync_run_id: executeTransaction8.id,
        },
      }),
      await client.auditEvent.findMany({
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
            { resource_id: executeTransaction8.id, resource_type: "sync_run" },
            {
              action: { startsWith: "sync." },
              resource_id: executeTransaction8.id,
            },
          ],
        },
      }),
    ];
    const failurePage = failedRecords.slice(0, DETAIL_PAGE_SIZE);
    const timelinePage = timeline.slice(0, DETAIL_PAGE_SIZE);
    return {
      ok: true,
      value: {
        failedRecords: failurePage.map((record) => ({
          createdAt: record.created_at,
          errorCode: record.error_code,
          errorMessage: xeroRecoveryMessageFromCode(record.error_message),
          id: record.id,
          recordType: record.record_type,
          sourceRemoteId: record.source_remote_id,
        })),
        failedRecordsNextCursor: pageCursor(failedRecords, DETAIL_PAGE_SIZE),
        run: toRunListItem(executeTransaction8, people),
        timeline: timelinePage.map((event) => ({
          action: event.action,
          actorUserId: event.actor_user_id,
          createdAt: event.created_at,
          id: event.id,
        })),
        timelineNextCursor: pageCursor(timeline, DETAIL_PAGE_SIZE),
      },
    };
  };
  assertTenantDb(db, input.accountId);
  return await run(db);
}
export async function listRunFailedRecords(
  input: z.input<typeof DetailPageSchema>,
  db: TenantDb
): Promise<Result<RunDetailPage, SyncMonitorError>> {
  assertTenantDb(db, input.accountId);

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
  const run = async (
    client: TenantDb
  ): ReturnType<typeof listRunFailedRecords> => {
    const runExists = await client.syncRun.findFirst({
      select: { id: true },
      where: { ...scoped(parsed.data), id: parsed.data.runId },
    });
    if (!runExists) {
      return await runNotFound(parsed.data, client);
    }
    const rows = await client.failedRecord.findMany({
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
          errorMessage: xeroRecoveryMessageFromCode(row.error_message),
          id: row.id,
          recordType: row.record_type,
          sourceRemoteId: row.source_remote_id,
        })),
      },
    };
  };
  assertTenantDb(db, input.accountId);
  return await run(db);
}
export async function listRunTimeline(
  input: z.input<typeof DetailPageSchema>,
  db: TenantDb
): Promise<Result<TimelinePage, SyncMonitorError>> {
  assertTenantDb(db, input.accountId);

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
  const run = async (client: TenantDb): ReturnType<typeof listRunTimeline> => {
    const runExists = await client.syncRun.findFirst({
      select: { id: true },
      where: { ...scoped(parsed.data), id: parsed.data.runId },
    });
    if (!runExists) {
      return await runNotFound(parsed.data, client);
    }
    const rows = await client.auditEvent.findMany({
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
  };
  assertTenantDb(db, input.accountId);
  return await run(db);
}
export async function getRedactedFailedRecordPayload(
  input: z.input<typeof GetRawFailureSchema>,
  db: TenantDb
): Promise<
  Result<
    {
      payload: unknown;
    },
    SyncMonitorError
  >
> {
  assertTenantDb(db, input.accountId);

  const parsed = GetRawFailureSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!hasPermission(parsed.data.actingRole, { xero: ["sync"] })) {
    return notAuthorised();
  }
  const run = async (
    client: TenantDb
  ): ReturnType<typeof getRedactedFailedRecordPayload> => {
    const failure = await client.failedRecord.findFirst({
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
    await client.auditEvent.create({
      data: {
        account_id: parsed.data.accountId,
        action: "sync.failed_record_payload_viewed",
        actor_user_id: parsed.data.actingUserId,
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
  };
  return await (async () => {
    assertTenantDb(db, input.accountId);
    return await run(db);
  })();
}
interface ManualSyncOutcome {
  eventName: string;
  queued: boolean;
  reason?: string;
}
export type PreparedManualSync =
  | { kind: "skip"; outcome: ManualSyncOutcome }
  | { kind: "send"; input: DispatchManualSyncInput; eventName: string };

export async function dispatchManualSync(
  input: z.input<typeof DispatchManualSyncSchema>
): Promise<Result<ManualSyncOutcome, SyncMonitorError>> {
  assertNoTenantTransaction("dispatchManualSync");
  try {
    const prepared = await withTenantDb(input.accountId, (db) =>
      prepareManualSync(input, db)
    );
    if (!prepared.ok) {
      return prepared;
    }
    const sent = await sendPreparedManualSync(prepared.value);
    if (!(sent.ok && sent.value.queued) || prepared.value.kind !== "send") {
      return sent;
    }
    const { input: dispatchInput } = prepared.value;
    const audited = await withTenantDb(input.accountId, (db) =>
      recordManualSyncDispatch(dispatchInput, db)
    );
    return audited.ok ? sent : audited;
  } catch {
    return unknownError("Failed to dispatch the manual sync.");
  }
}

export async function prepareManualSync(
  input: z.input<typeof DispatchManualSyncSchema>,
  db: TenantDb
): Promise<Result<PreparedManualSync, SyncMonitorError>> {
  assertTenantDb(db, input.accountId);
  const parsed = DispatchManualSyncSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const tenant = await db.xeroConnection.findFirst({
    where: {
      ...scoped(parsed.data),
      id: parsed.data.connectionId,
    },
  });
  if (!tenant) {
    return await tenantNotFound(parsed.data, db);
  }
  const eventName = syncEventNames[parsed.data.runType];
  if (tenant.sync_paused_at) {
    return {
      ok: true,
      value: {
        kind: "skip",
        outcome: {
          eventName,
          queued: false,
          reason: "tenant_sync_paused",
        },
      },
    };
  }
  if (!getRegisteredSyncEventName(parsed.data.runType)) {
    return {
      ok: true,
      value: {
        kind: "skip",
        outcome: {
          eventName,
          queued: false,
          reason: "dispatch_not_wired",
        },
      },
    };
  }
  const stateResult = await getXeroConnectionStateForScope(parsed.data, db);
  if (!stateResult.ok) {
    return {
      error: {
        code: "unknown_error",
        message:
          "We cannot reach Xero right now. Try again later or contact support.",
      },
      ok: false,
    };
  }
  if (stateResult.value.state === "reauthorisation_required") {
    return {
      error: {
        code: "connection_not_active",
        message: xeroRecoveryMessage(stateResult.value.state),
      },
      ok: false,
    };
  }
  if (stateResult.value.state !== "connected") {
    return {
      ok: true,
      value: {
        kind: "skip",
        outcome: {
          eventName,
          queued: false,
          reason: "connection_not_active",
        },
      },
    };
  }
  return { ok: true, value: { eventName, input: parsed.data, kind: "send" } };
}

export async function sendPreparedManualSync(
  prepared: PreparedManualSync
): Promise<Result<ManualSyncOutcome, SyncMonitorError>> {
  assertNoTenantTransaction("sendPreparedManualSync");
  if (prepared.kind === "skip") {
    return { ok: true, value: prepared.outcome };
  }
  try {
    const { input } = prepared;
    const dispatched = await dispatchSyncEvent({
      accountId: input.accountId,
      connectionId: input.connectionId,
      organisationId: input.organisationId,
      runType: input.runType,
      triggeredByUserId: input.actingUserId,
      triggerType: "manual",
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
    return { ok: true, value: { eventName: prepared.eventName, queued: true } };
  } catch {
    return unknownError("Failed to dispatch the manual sync.");
  }
}

export async function recordManualSyncDispatch(
  input: z.input<typeof DispatchManualSyncSchema>,
  db: TenantDb
): Promise<Result<void, SyncMonitorError>> {
  assertTenantDb(db, input.accountId);
  const parsed = DispatchManualSyncSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  await db.auditEvent.create({
    data: {
      ...auditBase(parsed.data, parsed.data.actingUserId),
      action: "sync.manual_dispatched",
      payload: {
        actingUserId: parsed.data.actingUserId,
        connectionId: parsed.data.connectionId,
        eventName: syncEventNames[parsed.data.runType],
        runType: parsed.data.runType,
      },
      resource_id: parsed.data.connectionId,
      resource_type: "xero_tenant",
    },
  });
  return { ok: true, value: undefined };
}
export async function exportFailedRecordsCsv(
  input: z.input<typeof ExportFailedRecordsCsvSchema>,
  db: TenantDb
): Promise<
  Result<
    {
      csvContent: string;
      filename: string;
    },
    SyncMonitorError
  >
> {
  assertTenantDb(db, input.accountId);

  const parsed = ExportFailedRecordsCsvSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const run = async (
    client: TenantDb
  ): ReturnType<typeof exportFailedRecordsCsv> => {
    const executeTransaction9 = await client.syncRun.findFirst({
      select: { id: true },
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
      },
    });
    if (!executeTransaction9) {
      return await runNotFound(parsed.data, client);
    }
    const failedRecords = await client.failedRecord.findMany({
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
        sync_run_id: executeTransaction9.id,
      },
    });
    const truncated = failedRecords.length > CSV_EXPORT_LIMIT;
    const rows = failedRecords
      .slice(0, CSV_EXPORT_LIMIT)
      .map((record) => [
        record.record_type,
        record.source_remote_id ?? "",
        record.error_code,
        xeroRecoveryMessageFromCode(record.error_message),
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
    await client.auditEvent.create({
      data: {
        ...auditBase(parsed.data, parsed.data.actingUserId),
        action: "sync.failed_records_exported",
        payload: {
          actingUserId: parsed.data.actingUserId,
          rowCount: Math.min(failedRecords.length, CSV_EXPORT_LIMIT),
          runId: executeTransaction9.id,
        },
        resource_id: executeTransaction9.id,
        resource_type: "sync_run",
      },
    });
    return {
      ok: true,
      value: {
        csvContent,
        filename: `sync-failed-records-${executeTransaction9.id}-${dateStamp(new Date())}.csv`,
      },
    };
  };
  return await (async () => {
    assertTenantDb(db, input.accountId);
    return await run(db);
  })();
}
export type PreparedSyncCancellation = CancelRunInput;

export async function cancelRun(
  input: z.input<typeof CancelRunSchema>
): Promise<
  Result<
    { cancellationRequested: true; eventQueued: boolean },
    SyncMonitorError
  >
> {
  assertNoTenantTransaction("cancelRun");
  try {
    const prepared = await withTenantDb(input.accountId, (db) =>
      prepareSyncCancellation(input, db)
    );
    if (!prepared.ok) {
      return prepared;
    }
    const sent = await sendPreparedSyncCancellation(prepared.value);
    if (!sent.ok) {
      return sent;
    }
    const { value: cancellationInput } = prepared;
    const { eventQueued } = sent.value;
    const audited = await withTenantDb(input.accountId, (db) =>
      recordSyncCancellation(cancellationInput, eventQueued, db)
    );
    return audited.ok ? sent : audited;
  } catch {
    return unknownError("Failed to request sync cancellation.");
  }
}

export async function prepareSyncCancellation(
  input: z.input<typeof CancelRunSchema>,
  db: TenantDb
): Promise<Result<PreparedSyncCancellation, SyncMonitorError>> {
  assertTenantDb(db, input.accountId);
  const parsed = CancelRunSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!canUseSyncMonitor(parsed.data.actingRole)) {
    return notAuthorised();
  }
  const run = await db.syncRun.findFirst({
    select: { id: true },
    where: {
      ...scoped(parsed.data),
      id: parsed.data.runId,
      status: "running",
    },
  });
  if (!run) {
    return await runNotFound(parsed.data, db);
  }
  await db.syncRun.update({
    data: { cancel_requested_at: new Date() },
    where: { id: run.id },
  });
  return { ok: true, value: { ...parsed.data, runId: run.id } };
}

export async function sendPreparedSyncCancellation(
  input: PreparedSyncCancellation
): Promise<
  Result<
    { cancellationRequested: true; eventQueued: boolean },
    SyncMonitorError
  >
> {
  assertNoTenantTransaction("sendPreparedSyncCancellation");
  try {
    const queued = await dispatchCancelSyncRun({
      accountId: input.accountId,
      organisationId: input.organisationId,
      runId: input.runId,
    });
    return {
      ok: true,
      value: { cancellationRequested: true, eventQueued: queued.ok },
    };
  } catch {
    return unknownError("Failed to request sync cancellation.");
  }
}

export async function recordSyncCancellation(
  input: PreparedSyncCancellation,
  eventQueued: boolean,
  db: TenantDb
): Promise<Result<void, SyncMonitorError>> {
  assertTenantDb(db, input.accountId);
  await db.auditEvent.create({
    data: {
      ...auditBase(input, input.actingUserId),
      action: "sync.cancel_requested",
      payload: {
        actingUserId: input.actingUserId,
        eventQueued,
        runId: input.runId,
      },
      resource_id: input.runId,
      resource_type: "sync_run",
    },
  });
  return { ok: true, value: undefined };
}
function canUseSyncMonitor(role: SyncMonitorRole): boolean {
  return hasPermission(role, { xero: ["sync"] });
}
function auditBase(input: BaseInput, actingUserId: string) {
  return {
    account_id: input.accountId,
    actor_user_id: actingUserId,
    organisation_id: input.organisationId,
  };
}
function connectionStatus(
  connection: {
    disconnected_at: Date | null;
    status?: string;
  },
  state: import("@repo/core").XeroConnectionDisplayState
): TenantSummary["connectionStatus"] {
  if (state === "unavailable") {
    return state;
  }

  if (
    state === "reauthorisation_required" ||
    connection.status === "reconnect_required"
  ) {
    return "reconnect_required";
  }
  if (connection.status === "disconnected") {
    return "disconnected";
  }
  return state === "connected" ? "active" : "not_configured";
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
function decodeCursor(cursor: string | null): {
  id: string;
  startedAt: Date;
} | null {
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
function decodeCreatedCursor(cursor: string | null): {
  createdAt: Date;
  id: string;
} | null {
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
function createdCursorWhere(
  cursor: {
    createdAt: Date;
    id: string;
  } | null
) {
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
  rows: Array<{
    created_at: Date;
    id: string;
  }>,
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
  cursor: {
    id: string;
    startedAt: Date;
  } | null
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
    ...(filters.connectionId?.length
      ? { xero_connection_id: { in: filters.connectionId } }
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
  input: {
    accountId: string;
    organisationId: string;
  },
  runs: Array<{
    trigger_type: SyncTriggerType;
    triggered_by_user_id: string | null;
  }>,
  db: TenantDb
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
  const people = await db.person.findMany({
    select: {
      first_name: true,
      last_name: true,
      user_id: true,
    },
    where: {
      ...scoped(input),
      user_id: { in: userIds },
    },
  });
  return new Map(
    people.flatMap((person) =>
      person.user_id
        ? [
            [
              person.user_id,
              `${person.first_name} ${person.last_name.charAt(0)}.`,
            ],
          ]
        : []
    )
  );
}
function toRunListItem(
  run: {
    _count: {
      failed_records: number;
    };
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
    xero_connection: {
      id: string;
      tenant_name: string | null;
    } | null;
    xero_connection_id: string | null;
  },
  people: Map<string, string>
): RunListItem {
  return {
    completedAt: run.completed_at,
    connectionId: run.xero_connection_id,
    durationSeconds: run.completed_at
      ? Math.max(
          0,
          Math.round(
            (run.completed_at.getTime() - run.started_at.getTime()) / 1000
          )
        )
      : null,
    errorSummary: xeroRecoveryMessageFromCode(run.error_summary),
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
      run.xero_connection?.tenant_name ??
      run.xero_connection_id ??
      "Unknown tenant",
    triggeredByUserDisplay:
      run.trigger_type === "scheduled"
        ? "System"
        : (people.get(run.triggered_by_user_id ?? "") ?? "User"),
    triggerType: run.trigger_type,
  };
}
async function runNotFound(
  input: GetRunDetailInput | ExportFailedRecordsCsvInput | CancelRunInput,
  db: TenantDb
): Promise<Result<never, SyncMonitorError>> {
  const existing = await db.syncRun.findUnique({
    select: {
      account_id: true,
      organisation_id: true,
    },
    where: { id: input.runId },
  });
  if (
    existing &&
    (existing.account_id !== input.accountId ||
      existing.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingAccountId: input.accountId,
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
  input: DispatchManualSyncInput,
  db: TenantDb
): Promise<Result<never, SyncMonitorError>> {
  const existing = await db.xeroConnection.findUnique({
    select: {
      account_id: true,
      organisation_id: true,
    },
    where: { id: input.connectionId },
  });
  if (
    existing &&
    (existing.account_id !== input.accountId ||
      existing.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingAccountId: input.accountId,
      actingOrganisationId: input.organisationId,
      resourceId: input.connectionId,
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
