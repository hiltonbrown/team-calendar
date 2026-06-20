import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { z } from "zod";
import {
  dispatchCancelSyncRun,
  dispatchSyncEvent,
  getRegisteredSyncEventName,
  syncEventNames,
} from "./sync-events";

export type SyncMonitorError =
  | { code: "connection_not_active"; message: string }
  | { code: "cross_org_leak"; message: string }
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
  failedRecords: Array<{
    createdAt: Date;
    errorCode: string;
    errorMessage: string;
    id: string;
    rawPayload: Record<string, unknown> | null;
    recordType: string;
    sourceRemoteId: string | null;
  }>;
  run: RunListItem;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  action: string;
  actorUserId: string | null;
  createdAt: Date;
  id: string;
  payload: unknown;
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
const FAILURE_STATUSES: SyncRunStatus[] = ["failed", "partial_success"];

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
      where: scoped(parsed.data),
      include: { xero_connection: true },
      orderBy: { tenant_name: "asc" },
    });
    const tenantIds = tenants.map((tenant) => tenant.id);
    if (tenantIds.length === 0) {
      return { ok: true, value: [] };
    }

    const since = daysAgo(30);
    const [runs, failedRecords] = await Promise.all([
      database.syncRun.findMany({
        where: {
          ...scoped(parsed.data),
          started_at: { gte: since },
          xero_tenant_id: { in: tenantIds },
        },
        orderBy: [{ started_at: "desc" }, { id: "desc" }],
        include: { failed_records: { select: { id: true } } },
      }),
      database.failedRecord.findMany({
        where: {
          ...scoped(parsed.data),
          sync_run: {
            started_at: { gte: since },
            xero_tenant_id: { in: tenantIds },
          },
        },
        include: {
          sync_run: {
            select: {
              run_type: true,
              started_at: true,
              xero_tenant_id: true,
            },
          },
        },
      }),
    ]);

    const latestSuccessByTenantAndType = new Map<string, Date>();
    for (const run of runs) {
      if (!(run.xero_tenant_id && isSuccessStatus(run.status))) {
        continue;
      }
      const key = tenantRunTypeKey(run.xero_tenant_id, run.run_type);
      const existing = latestSuccessByTenantAndType.get(key);
      if (!existing || run.started_at > existing) {
        latestSuccessByTenantAndType.set(key, run.started_at);
      }
    }

    return {
      ok: true,
      value: tenants.map((tenant) => {
        const tenantRuns = runs.filter(
          (run) => run.xero_tenant_id === tenant.id
        );
        const currentRun = tenantRuns.find((run) => run.status === "running");
        const lastRun = tenantRuns.find((run) => run.status !== "running");
        const runsLast30Days = tenantRuns.filter(
          (run) => run.started_at >= since
        );
        const pendingFailedRecords = failedRecords.filter((record) => {
          const syncRun = record.sync_run;
          if (!syncRun.xero_tenant_id || syncRun.xero_tenant_id !== tenant.id) {
            return false;
          }
          const key = tenantRunTypeKey(
            syncRun.xero_tenant_id,
            syncRun.run_type
          );
          const latestSuccess = latestSuccessByTenantAndType.get(key);
          return !latestSuccess || latestSuccess <= record.created_at;
        }).length;

        return {
          connectionStatus: connectionStatus(tenant.xero_connection),
          currentRun: currentRun
            ? {
                id: currentRun.id,
                runType: currentRun.run_type,
                startedAt: currentRun.started_at,
              }
            : null,
          failedRunsLast30Days: runsLast30Days.filter((run) =>
            isFailureStatus(run.status)
          ).length,
          lastApprovalReconciliation: latestCompletedRunAt(
            tenantRuns,
            "approval_state_reconciliation"
          ),
          lastLeaveBalancesSync: latestCompletedRunAt(
            tenantRuns,
            "leave_balances"
          ),
          lastLeaveRecordsSync: latestCompletedRunAt(
            tenantRuns,
            "leave_records"
          ),
          lastPeopleSync: latestCompletedRunAt(tenantRuns, "people"),
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
          totalRunsLast30Days: runsLast30Days.length,
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
      where,
      include: {
        _count: { select: { failed_records: true } },
        xero_tenant: { select: { id: true, tenant_name: true } },
      },
      orderBy: [{ started_at: "desc" }, { id: "desc" }],
      take: pageSize + 1,
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
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
      },
      include: {
        _count: { select: { failed_records: true } },
        xero_tenant: { select: { id: true, tenant_name: true } },
      },
    });
    if (!run) {
      return await runNotFoundOrCrossOrg(parsed.data);
    }

    const [people, failedRecords, timeline] = await Promise.all([
      loadTriggeredByPeople(parsed.data, [run]),
      database.failedRecord.findMany({
        where: {
          ...scoped(parsed.data),
          sync_run_id: run.id,
        },
        orderBy: { created_at: "asc" },
      }),
      database.auditEvent.findMany({
        where: {
          ...scoped(parsed.data),
          OR: [
            { resource_type: "sync_run", resource_id: run.id },
            { action: { startsWith: "sync." }, resource_id: run.id },
          ],
        },
        orderBy: { created_at: "asc" },
      }),
    ]);

    return {
      ok: true,
      value: {
        failedRecords: failedRecords.map((record) => ({
          createdAt: record.created_at,
          errorCode: record.error_code,
          errorMessage: record.error_message,
          id: record.id,
          rawPayload: jsonObjectOrNull(record.raw_payload),
          recordType: record.record_type,
          sourceRemoteId: record.source_remote_id,
        })),
        run: toRunListItem(run, people),
        timeline: timeline.map((event) => ({
          action: event.action,
          actorUserId: event.actor_user_id,
          createdAt: event.created_at,
          id: event.id,
          payload: event.payload,
        })),
      },
    };
  } catch {
    return unknownError("Failed to load sync run detail.");
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
      where: {
        ...scoped(parsed.data),
        id: parsed.data.xeroTenantId,
      },
      include: { xero_connection: true },
    });
    if (!tenant) {
      return await tenantNotFoundOrCrossOrg(parsed.data);
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
      triggerType: "manual",
      triggeredByUserId: parsed.data.actingUserId,
      xeroTenantId: parsed.data.xeroTenantId,
    });
    if (!dispatched.ok) {
      return {
        ok: false,
        error: {
          code:
            dispatched.error.code === "dispatch_not_wired"
              ? "invalid_run_type"
              : dispatched.error.code,
          message: dispatched.error.message,
        },
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
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
      },
      select: { id: true },
    });
    if (!run) {
      return await runNotFoundOrCrossOrg(parsed.data);
    }

    const failedRecords = await database.failedRecord.findMany({
      where: {
        ...scoped(parsed.data),
        sync_run_id: run.id,
      },
      orderBy: { created_at: "asc" },
      take: CSV_EXPORT_LIMIT + 1,
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
      where: {
        ...scoped(parsed.data),
        id: parsed.data.runId,
        status: "running",
      },
      select: { id: true },
    });
    if (!run) {
      return await runNotFoundOrCrossOrg(parsed.data);
    }

    await database.syncRun.update({
      where: { id: run.id },
      data: { cancel_requested_at: new Date() },
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

function scoped(input: { clerkOrgId: string; organisationId: string }) {
  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
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
  if (connection.expires_at <= new Date()) {
    return "expired";
  }
  return "active";
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

function isSuccessStatus(status: SyncRunStatus): boolean {
  return SUCCESS_STATUSES.includes(status);
}

function isFailureStatus(status: SyncRunStatus): boolean {
  return FAILURE_STATUSES.includes(status);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function tenantRunTypeKey(xeroTenantId: string, runType: SyncRunType): string {
  return `${xeroTenantId}:${runType}`;
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
            { started_at: cursor.startedAt, id: { lt: cursor.id } },
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
    where: {
      ...scoped(input),
      clerk_user_id: { in: userIds },
    },
    select: {
      clerk_user_id: true,
      first_name: true,
      last_name: true,
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
    triggerType: run.trigger_type,
    triggeredByUserDisplay:
      run.trigger_type === "scheduled"
        ? "System"
        : (people.get(run.triggered_by_user_id ?? "") ?? "User"),
    xeroTenantId: run.xero_tenant_id,
  };
}

async function runNotFoundOrCrossOrg(
  input: GetRunDetailInput | ExportFailedRecordsCsvInput | CancelRunInput
): Promise<Result<never, SyncMonitorError>> {
  const existing = await database.syncRun.findUnique({
    where: { id: input.runId },
    select: {
      clerk_org_id: true,
      organisation_id: true,
    },
  });
  if (existing) {
    return {
      ok: false,
      error: {
        code: "cross_org_leak",
        message: "This sync run belongs to another organisation.",
      },
    };
  }
  return {
    ok: false,
    error: { code: "run_not_found", message: "Sync run not found." },
  };
}

async function tenantNotFoundOrCrossOrg(
  input: DispatchManualSyncInput
): Promise<Result<never, SyncMonitorError>> {
  const existing = await database.xeroTenant.findUnique({
    where: { id: input.xeroTenantId },
    select: {
      clerk_org_id: true,
      organisation_id: true,
    },
  });
  if (existing) {
    return {
      ok: false,
      error: {
        code: "cross_org_leak",
        message: "This Xero tenant belongs to another organisation.",
      },
    };
  }
  return {
    ok: false,
    error: { code: "tenant_not_found", message: "Xero tenant not found." },
  };
}

function jsonObjectOrNull(
  value: Prisma.JsonValue
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, nestedValue])
  );
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
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid sync monitor input.",
    },
  };
}

function notAuthorised(): Result<never, SyncMonitorError> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "Only admins and owners can use sync health.",
    },
  };
}

function unknownError(message: string): Result<never, SyncMonitorError> {
  return {
    ok: false,
    error: { code: "unknown_error", message },
  };
}
