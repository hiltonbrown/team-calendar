import "server-only";
import { database, scopedTo as scoped } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { log } from "@repo/observability/log";
export const STALE_RUN_WINDOW_MS = 30 * 60 * 1000;
export class XeroSyncRunFencedError extends Error {
  constructor(message = "sync_run_fenced") {
    super(message);
    this.name = "XeroSyncRunFencedError";
  }
}
export interface AcquireSyncRunInput {
  clerkOrgId: string;
  connectionId: string;
  organisationId: string;
  runId?: string;
  triggeredByUserId?: string | null;
  triggerType: "scheduled" | "manual" | "webhook";
}
export type SyncRunType =
  | "people"
  | "leave_records"
  | "leave_balances"
  | "approval_state_reconciliation";
export type SyncRunStatus =
  | "running"
  | "succeeded"
  | "partial_success"
  | "failed"
  | "cancelled";
export type TerminalSyncRunStatus =
  | "succeeded"
  | "partial_success"
  | "failed"
  | "cancelled";
export interface TerminalRunSnapshot {
  id: string;
  records_failed: number;
  records_fetched: number;
  records_skipped: number;
  records_synced: number;
  records_upserted: number;
  status: TerminalSyncRunStatus;
}
export type AcquireRunResult =
  | {
      kind: "active";
      run: {
        id: string;
      };
    }
  | {
      kind: "cancelled_competing";
      run: {
        id: string;
      };
    }
  | {
      kind: "terminal";
      run: TerminalRunSnapshot;
    };
/**
 * Atomically acquires ownership of a sync run.
 * 1. If runId is provided and already terminal: preserves terminal outcome (idempotent duplicate delivery).
 * 2. If runId is provided and currently running: resumes same logical execution.
 * 3. Checks for any active competing run within the stale window. If active: records this run as cancelled.
 * 4. Reclaims any expired running runs (>30m) by marking them failed.
 */
function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    Boolean(error) &&
    "code" in (error as Record<string, unknown>) &&
    (error as Record<string, unknown>).code === "P2002"
  );
}
function toAcquireResult(existing: {
  id: string;
  records_failed: number | null;
  records_fetched: number | null;
  records_skipped: number | null;
  records_synced: number | null;
  records_upserted: number | null;
  status: string;
}): AcquireRunResult {
  if (existing.status !== "running") {
    return {
      kind: "terminal",
      run: {
        id: existing.id,
        records_failed: existing.records_failed ?? 0,
        records_fetched: existing.records_fetched ?? 0,
        records_skipped: existing.records_skipped ?? 0,
        records_synced: existing.records_synced ?? 0,
        records_upserted: existing.records_upserted ?? 0,
        status: existing.status as TerminalSyncRunStatus,
      },
    };
  }
  return { kind: "active", run: { id: existing.id } };
}
async function findExistingRun(
  context: AcquireSyncRunInput
): Promise<AcquireRunResult | null> {
  if (!context.runId) {
    return null;
  }
  const existing = await database.syncRun.findFirst({
    select: {
      id: true,
      records_failed: true,
      records_fetched: true,
      records_skipped: true,
      records_synced: true,
      records_upserted: true,
      status: true,
    },
    where: {
      ...scoped(context),
      id: context.runId,
      xero_connection_id: context.connectionId,
    },
  });
  return existing ? toAcquireResult(existing) : null;
}
async function checkCompetingRun(
  context: AcquireSyncRunInput,
  runType: SyncRunType,
  startedAt: Date,
  stalenessFloor: Date
): Promise<AcquireRunResult | null> {
  const stalenessFilter =
    runType === "leave_balances"
      ? { updated_at: { gte: stalenessFloor } }
      : { started_at: { gte: stalenessFloor } };
  const competingRun = await database.syncRun.findFirst({
    select: { id: true, started_at: true },
    where: {
      ...scoped(context),
      ...(context.runId ? { id: { not: context.runId } } : {}),
      run_type: runType,
      status: "running",
      xero_connection_id: context.connectionId,
      ...stalenessFilter,
    },
  });
  if (!competingRun) {
    return null;
  }
  const label = runType.replace(/_/g, " ");
  const cancelled = await database.syncRun.create({
    data: {
      ...scoped(context),
      completed_at: new Date(),
      error_summary: `Another ${label} sync run is already in progress`,
      ...(context.runId ? { id: context.runId } : {}),
      run_type: runType,
      started_at: startedAt,
      status: "cancelled",
      trigger_type: context.triggerType,
      triggered_by_user_id: context.triggeredByUserId ?? null,
      xero_connection_id: context.connectionId,
    },
    select: { id: true },
  });
  return { kind: "cancelled_competing", run: cancelled };
}
async function reclaimExpiredRuns(
  context: AcquireSyncRunInput,
  runType: SyncRunType,
  stalenessFloor: Date
): Promise<void> {
  const expiredFilter =
    runType === "leave_balances"
      ? { updated_at: { lt: stalenessFloor } }
      : { started_at: { lt: stalenessFloor } };
  try {
    await database.syncRun.updateMany({
      data: {
        completed_at: new Date(),
        error_summary: "lease_expired",
        status: "failed",
      },
      where: {
        ...scoped(context),
        run_type: runType,
        status: "running",
        xero_connection_id: context.connectionId,
        ...expiredFilter,
      },
    });
  } catch (err) {
    log.warn("Failed to reclaim expired sync runs", { err });
  }
}
/**
 * Atomically acquires or claims an execution lease for a sync run.
 * 1. If runId already completed, returns terminal outcome (idempotent duplicate).
 * 2. If runId is currently running, resumes active lease.
 * 3. If a competing run is running, cancels the competing attempt honestly.
 * 4. Reclaims expired leases older than 15 minutes.
 * 5. Creates and claims the new running run.
 */
export async function acquireSyncRun(
  context: AcquireSyncRunInput,
  runType: SyncRunType,
  startedAt: Date
): Promise<AcquireRunResult> {
  const existing = await findExistingRun(context);
  if (existing) {
    return existing;
  }
  const stalenessFloor = new Date(Date.now() - STALE_RUN_WINDOW_MS);
  const competing = await checkCompetingRun(
    context,
    runType,
    startedAt,
    stalenessFloor
  );
  if (competing) {
    return competing;
  }
  await reclaimExpiredRuns(context, runType, stalenessFloor);
  const entityType =
    runType === "approval_state_reconciliation" ? null : runType;
  try {
    const run = await database.syncRun.create({
      data: {
        ...scoped(context),
        ...(context.runId ? { id: context.runId } : {}),
        entity_type: entityType,
        run_type: runType,
        started_at: startedAt,
        status: "running",
        trigger_type: context.triggerType,
        triggered_by_user_id: context.triggeredByUserId ?? null,
        xero_connection_id: context.connectionId,
      },
      select: { id: true },
    });
    return { kind: "active", run };
  } catch (error) {
    if (context.runId && isPrismaUniqueConstraintError(error)) {
      const recovered = await findExistingRun(context);
      if (recovered) {
        return recovered;
      }
    }
    throw error;
  }
}
/**
 * Asserts that the run has not been cancelled or superseded.
 * Throws XeroSyncRunFencedError if the run is no longer running or cancel was requested.
 */
export async function assertRunActive(
  context: {
    clerkOrgId: string;
    organisationId: string;
  },
  runId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? database;
  const runState = await client.syncRun.findFirst({
    select: { cancel_requested_at: true, status: true },
    where: { ...scoped(context), id: runId },
  });
  if (runState?.status !== "running" || runState?.cancel_requested_at) {
    throw new XeroSyncRunFencedError();
  }
}
export async function isRunCancelled(
  context: {
    clerkOrgId: string;
    organisationId: string;
  },
  runId: string
): Promise<boolean> {
  const runState = await database.syncRun.findFirst({
    select: { cancel_requested_at: true },
    where: { ...scoped(context), id: runId },
  });
  return Boolean(runState?.cancel_requested_at);
}
