import "server-only";

import type { Result } from "@repo/core";
import { database, scopedTo as scoped } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import { publishOrganisationNotificationEvent } from "@repo/notifications";
import { log } from "@repo/observability/log";
import {
  ensureFreshXeroConnection,
  fetchLeaveBalancesForRegion,
  isSupportedCurrencyCode,
  mapXeroLeaveType,
  toPlainLanguageMessage,
  toValidatedLeaveBalanceRawPayload,
  type XeroLeaveBalance,
  type XeroLeaveBalanceFetchFailure,
  type XeroPayrollRegion,
  type XeroWriteError,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { captureInitialSyncCompleted } from "../activation";
import { inngest } from "../client";

const SyncXeroLeaveBalancesInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  xeroTenantId: z.string().uuid(),
});

export type SyncXeroLeaveBalancesInput = z.infer<
  typeof SyncXeroLeaveBalancesInputSchema
>;

export type SyncXeroLeaveBalancesError =
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface Counts {
  failed: number;
  fetched: number;
  skipped: number;
  upserted: number;
}

type SyncStatus = "cancelled" | "failed" | "partial_success" | "succeeded";
type SyncXeroLeaveBalancesResult = Result<
  Counts & {
    runId: string;
    status: SyncStatus;
  },
  SyncXeroLeaveBalancesError
>;
type XeroTenant = NonNullable<Awaited<ReturnType<typeof loadXeroTenant>>>;

const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;
const BALANCE_PAGE_SIZE = 40;
const PROBE_PAGE_SIZE = BALANCE_PAGE_SIZE + 1;
const BALANCE_BATCH_SIZE = 50;
// A running balance sync is treated as abandoned once its last heartbeat is this
// old. Balance fetches read one employee per second, so a live run keeps
// touching `updated_at`; only a crashed run lets the heartbeat go stale.
const STALE_RUN_WINDOW_MS = 30 * 60 * 1000;
// How often the fetch loop refreshes the run heartbeat. Kept well below the
// stale window so a healthy run is never mistaken for an abandoned one.
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export const syncXeroLeaveBalancesFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      cancelOn: [
        {
          event: "cancel-sync-run",
          if: "async.data.runId == event.data.runId",
        },
      ],
      concurrency: {
        key: "event.data.xeroTenantId",
        limit: 1,
      },
      id: "sync-xero-leave-balances",
      triggers: { event: "sync-xero-leave-balances" },
    },
    async ({ event, step }) =>
      await step.run("sync-leave-balances", async () =>
        syncXeroLeaveBalances(event.data)
      )
  );

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This handler coordinates balance sync paging, cursor compare-and-swap, and lifecycle updates.
export async function syncXeroLeaveBalances(
  input: unknown
): Promise<SyncXeroLeaveBalancesResult> {
  const parsed = SyncXeroLeaveBalancesInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const context = parsed.data;
  const startedAt = new Date();
  let runId: string | null = null;

  try {
    const duplicateRun = await cancelDuplicateRun(context, startedAt);
    if (duplicateRun) {
      return { ok: true, value: emptyResult(duplicateRun.id, "cancelled") };
    }

    const run = await createRun(context, startedAt);
    runId = run.id;
    await publishRunStatusChanged(context, run.id, "running");

    const tenantReadiness = await ensureTenantReady(context, run.id);
    if (!tenantReadiness.ready) {
      return tenantReadiness.result;
    }
    const { xeroTenant } = tenantReadiness;

    const counts = emptyCounts();

    const isTargetedPerson = Boolean(context.personId);
    let peopleToProcess: Array<{ id: string; xero_employee_id: string | null }>;
    let isLastPage = true;
    let cursorRecord: { cursor_value: string | null; id: string } | null = null;
    let initialCursorValue: string | null = null;
    let nextCursorValue: string | null = null;

    if (isTargetedPerson) {
      peopleToProcess = await database.person.findMany({
        select: { id: true, xero_employee_id: true },
        where: {
          ...scoped(context),
          archived_at: null,
          id: context.personId,
          xero_employee_id: { not: null },
        },
      });
    } else {
      cursorRecord = await database.xeroSyncCursor.findFirst({
        select: { cursor_value: true, id: true },
        where: {
          ...scoped(context),
          entity_type: "leave_balances",
          xero_tenant_id: context.xeroTenantId,
        },
      });
      initialCursorValue = cursorRecord?.cursor_value ?? null;

      const candidatePeople = await database.person.findMany({
        orderBy: { id: "asc" },
        select: { id: true, xero_employee_id: true },
        take: PROBE_PAGE_SIZE,
        where: {
          ...scoped(context),
          archived_at: null,
          ...(initialCursorValue ? { id: { gt: initialCursorValue } } : {}),
          xero_employee_id: { not: null },
        },
      });

      const hasMoreAfterPage = candidatePeople.length > BALANCE_PAGE_SIZE;
      peopleToProcess = candidatePeople.slice(0, BALANCE_PAGE_SIZE);
      isLastPage = !hasMoreAfterPage;
      nextCursorValue = hasMoreAfterPage
        ? (peopleToProcess[BALANCE_PAGE_SIZE - 1]?.id ?? null)
        : null;
    }

    const employeeIds = peopleToProcess
      .map((person) => person.xero_employee_id)
      .filter((employeeId): employeeId is string => Boolean(employeeId));
    const personIdByEmployeeId = new Map<string, string>();
    for (const person of peopleToProcess) {
      if (person.xero_employee_id) {
        personIdByEmployeeId.set(person.xero_employee_id, person.id);
      }
    }

    const balancesResult = await fetchLeaveBalancesForRegion(
      xeroTenant.payroll_region,
      { employeeIds, onProgress: makeHeartbeat(context, run.id), xeroTenant }
    );
    if (!balancesResult.ok) {
      await completeRun(context, run.id, {
        counts,
        errorSummary: isBlanketFailure(balancesResult.error)
          ? toPlainLanguageMessage(balancesResult.error)
          : balancesResult.error.message,
        status: "failed",
      });
      return {
        ok: true,
        value: { ...counts, runId: run.id, status: "failed" },
      };
    }

    counts.fetched = balancesResult.value.leaveBalances.length;
    await recordFetchFailures(
      context,
      run.id,
      balancesResult.value.failures,
      counts
    );

    const cancelled = await processBalances(
      context,
      run.id,
      xeroTenant.id,
      xeroTenant.payroll_region,
      balancesResult.value.leaveBalances,
      personIdByEmployeeId,
      counts
    );
    if (cancelled) {
      await completeRun(context, run.id, { counts, status: "cancelled" });
      return {
        ok: true,
        value: { ...counts, runId: run.id, status: "cancelled" },
      };
    }

    if (!isTargetedPerson) {
      const casSuccess = await advanceCursor({
        context,
        cursorRecord,
        initialCursorValue,
        nextCursorValue,
      });
      if (!casSuccess) {
        await completeRun(context, run.id, {
          counts,
          errorSummary:
            "Cursor update lost compare-and-swap race; run superseded",
          status: "cancelled",
        });
        return {
          ok: true,
          value: { ...counts, runId: run.id, status: "cancelled" },
        };
      }

      let staleSinceData: { leave_balances_stale_since?: Date | null } = {};
      if (isLastPage) {
        staleSinceData = { leave_balances_stale_since: null };
      } else if (!xeroTenant.leave_balances_stale_since) {
        staleSinceData = { leave_balances_stale_since: startedAt };
      }

      await database.xeroTenant.updateMany({
        data: {
          last_leave_balances_sync_at: new Date(),
          last_sync_error_code: null,
          last_sync_error_message: null,
          ...staleSinceData,
        },
        where: { ...scoped(context), id: context.xeroTenantId },
      });
    }

    const finalStatus = counts.failed > 0 ? "partial_success" : "succeeded";
    await completeRun(context, run.id, {
      counts,
      status: finalStatus,
    });
    if (finalStatus === "succeeded") {
      await captureInitialSyncCompleted(context);
    }

    return {
      ok: true,
      value: { ...counts, runId: run.id, status: finalStatus },
    };
  } catch (error) {
    log.error("Unhandled exception in syncXeroLeaveBalances:", { error });
    if (runId) {
      await completeRun(context, runId, {
        counts: emptyCounts(),
        errorSummary:
          error instanceof Error ? error.message : "Unhandled exception",
        status: "failed",
      });
    }
    return {
      error: {
        code: "unknown_error",
        message: "Failed to sync Xero leave balances.",
      },
      ok: false,
    };
  }
}

async function processBalance(
  context: SyncXeroLeaveBalancesInput,
  runId: string,
  xeroTenantId: string,
  payrollRegion: XeroPayrollRegion,
  balance: XeroLeaveBalance,
  personIdByEmployeeId: Map<string, string>
): Promise<boolean> {
  const validation = validateBalance(balance);
  if (!validation.valid) {
    await recordFailure(context, {
      errorCode: "validation_error",
      errorMessage: validation.message,
      rawPayload: balance.rawPayload,
      runId,
      sourceId: balance.leaveTypeId || "unknown",
    });
    return false;
  }

  try {
    const personId = personIdByEmployeeId.get(balance.employeeId);
    if (!personId) {
      await recordFailure(context, {
        errorCode: "person_not_found",
        errorMessage: "No scoped person exists for the Xero employee.",
        rawPayload: balance.rawPayload,
        runId,
        sourceId: balance.leaveTypeId,
      });
      return false;
    }

    const { recordType } = mapXeroLeaveType({
      leaveTypeName: balance.leaveTypeName,
      payrollRegion,
    });

    const sourcePayloadJson =
      toValidatedLeaveBalanceRawPayload(balance.rawPayload) ?? Prisma.DbNull;

    await database.leaveBalance.upsert({
      create: {
        ...scoped(context),
        as_at: new Date(),
        balance: balance.balance.toFixed(4),
        balance_unit: balance.unitType,
        currency_code: balance.currencyCode,
        last_fetched_at: new Date(),
        leave_type_name: balance.leaveTypeName,
        leave_type_xero_id: balance.leaveTypeId,
        person_id: personId,
        record_type: recordType,
        source_payload_json: sourcePayloadJson,
        xero_tenant_id: xeroTenantId,
      },
      update: {
        as_at: new Date(),
        balance: balance.balance.toFixed(4),
        balance_unit: balance.unitType,
        currency_code: balance.currencyCode,
        last_fetched_at: new Date(),
        leave_type_name: balance.leaveTypeName,
        record_type: recordType,
        source_payload_json: sourcePayloadJson,
        updated_at: new Date(),
      },
      where: {
        person_id_xero_tenant_id_leave_type_xero_id: {
          leave_type_xero_id: balance.leaveTypeId,
          person_id: personId,
          xero_tenant_id: xeroTenantId,
        },
      },
    });
    return true;
  } catch (error) {
    await recordFailure(context, {
      errorCode: "db_error",
      errorMessage:
        error instanceof Error ? error.message : "Failed to upsert balance.",
      rawPayload: balance.rawPayload,
      runId,
      sourceId: balance.leaveTypeId || "unknown",
    });
    return false;
  }
}

async function processBalances(
  context: SyncXeroLeaveBalancesInput,
  runId: string,
  xeroTenantId: string,
  payrollRegion: XeroPayrollRegion,
  balances: XeroLeaveBalance[],
  personIdByEmployeeId: Map<string, string>,
  counts: Counts
): Promise<boolean> {
  for (let index = 0; index < balances.length; index += BALANCE_BATCH_SIZE) {
    if (await cancellationRequested(context, runId)) {
      return true;
    }

    const batch = balances.slice(index, index + BALANCE_BATCH_SIZE);
    for (const balance of batch) {
      const result = await processBalance(
        context,
        runId,
        xeroTenantId,
        payrollRegion,
        balance,
        personIdByEmployeeId
      );
      if (result) {
        counts.upserted += 1;
      } else {
        counts.failed += 1;
      }
    }
  }
  return false;
}

// Returns a throttled progress callback that refreshes the run's heartbeat
// (updated_at) while a long fetch is in flight, so the duplicate-run guard can
// tell a live run from a crashed one. The final tick always flushes.
function makeHeartbeat(
  context: SyncXeroLeaveBalancesInput,
  runId: string
): (processed: number, total: number) => Promise<void> {
  let lastBeatAt = Date.now();
  return async (processed, total) => {
    const now = Date.now();
    if (now - lastBeatAt < HEARTBEAT_INTERVAL_MS && processed < total) {
      return;
    }
    lastBeatAt = now;
    await database.syncRun.updateMany({
      data: { updated_at: new Date() },
      where: { ...scoped(context), id: runId, status: "running" },
    });
  };
}

async function cancellationRequested(
  context: SyncXeroLeaveBalancesInput,
  runId: string
): Promise<boolean> {
  const runState = await database.syncRun.findFirst({
    select: { cancel_requested_at: true },
    where: { ...scoped(context), id: runId },
  });
  return Boolean(runState?.cancel_requested_at);
}

async function recordFetchFailures(
  context: SyncXeroLeaveBalancesInput,
  runId: string,
  failures: XeroLeaveBalanceFetchFailure[],
  counts: Counts
): Promise<void> {
  for (const failure of failures) {
    await recordFailure(context, {
      errorCode: failure.error.code,
      errorMessage: failure.error.message,
      rawPayload: failure.error.rawPayload ?? null,
      runId,
      sourceId: failure.employeeId,
    });
    counts.failed += 1;
  }
}

async function cancelDuplicateRun(
  context: SyncXeroLeaveBalancesInput,
  startedAt: Date
): Promise<{ id: string } | null> {
  const existingRun = await database.syncRun.findFirst({
    select: { id: true },
    where: {
      ...scoped(context),
      run_type: "leave_balances",
      status: "running",
      // Use the heartbeat (updated_at), not started_at: a large tenant can take
      // well over the window to fetch, so anchoring on start would wrongly free
      // a still-running sync and let a duplicate race the same balance writes.
      updated_at: { gte: new Date(Date.now() - STALE_RUN_WINDOW_MS) },
      xero_tenant_id: context.xeroTenantId,
    },
  });
  if (!existingRun) {
    return null;
  }

  return await database.syncRun.create({
    data: {
      ...scoped(context),
      completed_at: new Date(),
      error_summary: "Another leave balances sync run is already in progress",
      run_type: "leave_balances",
      started_at: startedAt,
      status: "cancelled",
      trigger_type: context.triggerType,
      triggered_by_user_id: context.triggeredByUserId ?? null,
      xero_tenant_id: context.xeroTenantId,
    },
    select: { id: true },
  });
}

function createRun(context: SyncXeroLeaveBalancesInput, startedAt: Date) {
  return database.syncRun.create({
    data: {
      ...scoped(context),
      entity_type: "leave_balances",
      run_type: "leave_balances",
      started_at: startedAt,
      status: "running",
      trigger_type: context.triggerType,
      triggered_by_user_id: context.triggeredByUserId ?? null,
      xero_tenant_id: context.xeroTenantId,
    },
    select: { id: true },
  });
}

async function ensureTenantReady(
  context: SyncXeroLeaveBalancesInput,
  runId: string
): Promise<
  | { ready: true; xeroTenant: XeroTenant }
  | { ready: false; result: SyncXeroLeaveBalancesResult }
> {
  const loadedTenant = await loadXeroTenant(context);
  if (loadedTenant?.sync_paused_at) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: "Tenant sync is paused for this Xero connection",
      status: "cancelled",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "cancelled") },
    };
  }
  if (!loadedTenant) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: "Xero connection not active",
      status: "failed",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  }
  const freshness = await ensureFreshXeroConnection({
    clerkOrgId: context.clerkOrgId,
    connectionId: loadedTenant.xero_connection_id,
    organisationId: context.organisationId,
  });
  if (!freshness.ok) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: freshness.error.message,
      status: "failed",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  }
  // Reload so the run uses the freshly persisted access token, not the stale one.
  const xeroTenant = freshness.value.refreshed
    ? await loadXeroTenant(context)
    : loadedTenant;
  if (!xeroTenant) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: "Xero connection not active",
      status: "failed",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  }
  return { ready: true, xeroTenant };
}

function validateBalance(
  balance: XeroLeaveBalance
): { valid: true } | { message: string; valid: false } {
  if (!(balance.employeeId && UUID_REGEX.test(balance.employeeId))) {
    return { message: "Invalid or missing Employee ID", valid: false };
  }
  if (!balance.leaveTypeId.trim()) {
    return { message: "Leave type is required", valid: false };
  }
  if (!Number.isFinite(balance.balance)) {
    return { message: "Leave balance must be numeric", valid: false };
  }
  // The unit/currency-code pairing is application-enforced, not a DB constraint:
  // a currency balance requires a supported ISO 4217 code, and an hours/days
  // balance must never carry one.
  if (balance.unitType === "currency") {
    if (
      !(balance.currencyCode && isSupportedCurrencyCode(balance.currencyCode))
    ) {
      return {
        message: "Currency leave balances require a supported currency code",
        valid: false,
      };
    }
  } else if (balance.currencyCode) {
    return {
      message: "Only currency leave balances may carry a currency code",
      valid: false,
    };
  }
  return { valid: true };
}

async function recordFailure(
  context: SyncXeroLeaveBalancesInput,
  input: {
    errorCode: string;
    errorMessage: string;
    rawPayload: unknown;
    runId: string;
    sourceId: string;
  }
) {
  await database.failedRecord.create({
    data: {
      ...scoped(context),
      entity_type: "leave_balances",
      error_code: input.errorCode,
      error_message: input.errorMessage,
      raw_payload: toPrismaJsonValue(input.rawPayload),
      record_type: "leave_balances",
      source_id: input.sourceId,
      source_remote_id: input.sourceId,
      sync_run_id: input.runId,
    },
  });
}

async function completeRun(
  context: SyncXeroLeaveBalancesInput,
  runId: string,
  input: {
    counts: Counts;
    errorSummary?: string;
    status: "cancelled" | "failed" | "partial_success" | "succeeded";
  }
) {
  await database.syncRun.updateMany({
    data: {
      completed_at: new Date(),
      error_summary: input.errorSummary ?? null,
      records_failed: input.counts.failed,
      records_fetched: input.counts.fetched,
      records_skipped: input.counts.skipped,
      records_synced: input.counts.upserted,
      records_upserted: input.counts.upserted,
      status: input.status,
    },
    where: { ...scoped(context), id: runId },
  });
  await publishRunStatusChanged(context, runId, input.status);
}

function loadXeroTenant(context: SyncXeroLeaveBalancesInput) {
  return database.xeroTenant.findFirst({
    include: {
      xero_connection: {
        select: {
          access_token_auth_tag: true,
          access_token_encrypted: true,
          access_token_iv: true,
          expires_at: true,
          last_refreshed_at: true,
          revoked_at: true,
          status: true,
        },
      },
    },
    where: {
      ...scoped(context),
      id: context.xeroTenantId,
      organisation_id: context.organisationId,
    },
  });
}

async function advanceCursor(params: {
  context: SyncXeroLeaveBalancesInput;
  cursorRecord: { cursor_value: string | null; id: string } | null;
  initialCursorValue: string | null;
  nextCursorValue: string | null;
}): Promise<boolean> {
  const { context, cursorRecord, initialCursorValue, nextCursorValue } = params;

  if (cursorRecord) {
    const updated = await database.xeroSyncCursor.updateMany({
      data: {
        cursor_value: nextCursorValue,
        updated_at: new Date(),
      },
      where: {
        ...scoped(context),
        cursor_value: initialCursorValue,
        entity_type: "leave_balances",
        id: cursorRecord.id,
        xero_tenant_id: context.xeroTenantId,
      },
    });
    return updated.count > 0;
  }

  try {
    await database.xeroSyncCursor.create({
      data: {
        ...scoped(context),
        cursor_value: nextCursorValue,
        entity_type: "leave_balances",
        xero_tenant_id: context.xeroTenantId,
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

function emptyCounts(): Counts {
  return {
    failed: 0,
    fetched: 0,
    skipped: 0,
    upserted: 0,
  };
}

function emptyResult(runId: string, status: SyncStatus) {
  return {
    ...emptyCounts(),
    runId,
    status,
  };
}

function validationError(
  error: z.ZodError
): Result<never, SyncXeroLeaveBalancesError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid Xero leave balance sync.",
    },
    ok: false,
  };
}

function isBlanketFailure(error: XeroWriteError): boolean {
  return (
    error.code === "auth_error" ||
    error.code === "rate_limit_error" ||
    error.code === "permission_error" ||
    error.code === "network_error" ||
    error.code === "validation_error"
  );
}

async function publishRunStatusChanged(
  context: SyncXeroLeaveBalancesInput,
  runId: string,
  status: "cancelled" | "failed" | "partial_success" | "running" | "succeeded"
) {
  try {
    await publishOrganisationNotificationEvent(
      {
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
      },
      {
        payload: {
          organisationId: context.organisationId,
          runId,
          runType: "leave_balances",
          status,
          xeroTenantId: context.xeroTenantId,
        },
        type: "sync.run_status_changed",
      }
    );
  } catch (error) {
    log.error("Failed to publish sync run status notification", {
      error,
      organisationId: context.organisationId,
      runId,
    });
  }
}

function toPrismaJsonValue(
  value: unknown
): Exclude<JsonValue, null> | typeof Prisma.JsonNull {
  const jsonValue = toJsonValue(value);
  return jsonValue === null ? Prisma.JsonNull : jsonValue;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    const output = Object.create(null) as Record<string, JsonValue>;
    for (const [key, item] of Object.entries(value)) {
      if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
        Reflect.set(output, key, toJsonValue(item));
      }
    }
    return output;
  }
  return String(value);
}
