import "server-only";
import {
  type InboundLeaveApprovalStatus,
  materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord,
  unclaimedOrExpiredXeroWriteWhere,
} from "@repo/availability";
import type { Result } from "@repo/core";
import {
  scopedTo as scoped,
  tenantDatabase,
  tenantTransaction,
} from "@repo/database";
import {
  type availability_privacy_mode,
  Prisma,
} from "@repo/database/generated/client";
import { advanceXeroSyncCursor } from "@repo/database/queries/xero-sync-cursors";
import { feedIdsForPeople } from "@repo/feeds";
import { publishOrganisationNotificationEvent } from "@repo/notifications";
import { log } from "@repo/observability/log";
import {
  deriveXeroStableSourceKey,
  fetchLeaveForEmployeeForRegion,
  fetchLeaveRecordsForRegion,
  mapXeroLeaveType,
  type XeroLeaveRecord,
  type XeroLeaveRecordStatus,
  type XeroPayrollRegion,
  type XeroWriteError,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { captureInitialSyncCompleted } from "../activation";
import { inngest } from "../client";
import {
  acquireSyncRun,
  assertRunActive,
  type SyncRunStatus,
  XeroSyncRunFencedError,
} from "./sync-run-lifecycle";
import {
  afterXeroBindingCommit,
  isCurrentXeroSyncBinding,
  rejectRetryableSyncResult,
  resolveSyncTenant,
  syncFailureReason,
  throwRetryableXeroFailure,
  withXeroBinding,
  XeroBindingChangedError,
  XeroSyncRetryError,
} from "./xero-sync-access";

const noUnresolvedSubmitOperationWhere =
  (): Prisma.AvailabilityRecordWhereInput => ({
    outbound_operations: {
      none: {
        action: { in: ["approve", "decline", "withdraw"] },
        status: {
          in: ["prepared", "outcome_unknown", "provider_accepted"],
        },
      },
    },
  });
const SyncXeroLeaveRecordsInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  connectionId: z.string().uuid(),
  mode: z.enum(["full", "incremental"]).optional(),
  organisationId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  requestedAt: z.string().datetime().optional(),
  runId: z.string().uuid().optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
});
export type SyncXeroLeaveRecordsInput = z.infer<
  typeof SyncXeroLeaveRecordsInputSchema
>;
export type SyncXeroLeaveRecordsError =
  | {
      code: "validation_error";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    };
type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };
const BATCH_SIZE = 50;
const LEAVE_PAGE_SIZE = 20;
const PROBE_PAGE_SIZE = 21;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;
const FailedRecordTypeSchema = z.enum([
  "people",
  "leave_records",
  "leave_balances",
  "approval_state_reconciliation",
  "leave",
  "annual_leave",
  "personal_leave",
  "holiday",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
  "public_holiday",
  "wfh",
  "travel",
  "travelling",
  "training",
  "client_site",
  "another_office",
  "offsite_meeting",
  "contractor_unavailable",
  "limited_availability",
  "alternative_contact",
  "other",
  "leave_request",
]);
interface Counts {
  archived: number;
  failed: number;
  fetched: number;
  skipped: number;
  upserted: number;
}
interface AppliedLeaveRecord {
  changed: boolean;
  personId: string;
  sourceRemoteId: string;
}
type ProcessLeaveRecordOutcome =
  | {
      flagged: boolean;
      kind: "applied";
      record: AppliedLeaveRecord;
    }
  | {
      kind: "failed";
    }
  | {
      flagged: boolean;
      kind: "skipped";
      reason: RemoteSnapshotSkipReason;
    };
type RemoteSnapshotSkipReason =
  | "duplicate_remote_snapshot"
  | "local_changed_after_run_started"
  | "older_remote_snapshot"
  | "stale_local_snapshot";

function requiresSnapshotRetry(outcome: ProcessLeaveRecordOutcome): boolean {
  return (
    outcome.kind === "skipped" &&
    (outcome.reason === "local_changed_after_run_started" ||
      outcome.reason === "stale_local_snapshot")
  );
}
type SyncStatus =
  | "ignored"
  | "cancelled"
  | "failed"
  | "partial_success"
  | "succeeded";
type SyncXeroLeaveRecordsResult = Result<
  Counts & {
    runId: string | null;
    status: SyncStatus;
  },
  SyncXeroLeaveRecordsError
>;
type ScopedXeroConnection = Extract<
  Awaited<ReturnType<typeof resolveSyncTenant>>,
  {
    ok: true;
  }
>["value"];
export const syncXeroLeaveRecordsFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      cancelOn: [
        {
          event: "cancel-sync-run",
          if: "async.data.runId == event.data.runId",
        },
      ],
      id: "sync-xero-leave-records",
      triggers: { event: "sync-xero-leave-records" },
    },
    async ({ event, step }) =>
      await step.run("sync-leave-records", async () =>
        rejectRetryableSyncResult(syncXeroLeaveRecords(event.data))
      )
  );
export function syncXeroLeaveRecords(input: unknown) {
  const parsed = SyncXeroLeaveRecordsInputSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve(validationError(parsed.error));
  }
  return syncXeroLeaveRecordsInternal(input);
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This handler coordinates run lifecycle, tenant readiness, batching, publication updates and finalisation.
async function syncXeroLeaveRecordsInternal(
  input: unknown
): Promise<SyncXeroLeaveRecordsResult> {
  const parsed = SyncXeroLeaveRecordsInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const context: typeof parsed.data & { expectedXeroTenantId?: string } = {
    ...parsed.data,
    mode:
      parsed.data.mode ??
      (parsed.data.triggerType === "scheduled" ? "incremental" : "full"),
  };
  const startedAt = new Date();
  let runId: string | null = null;
  try {
    if (!(await isCurrentXeroSyncBinding(context))) {
      return { ok: true, value: emptyResult(null, "ignored") };
    }
    const runAcquisition = await acquireSyncRun(
      context,
      "leave_records",
      startedAt
    );
    if (runAcquisition.kind === "terminal") {
      const term = runAcquisition.run;
      return {
        ok: true,
        value: {
          archived: term.records_synced - term.records_upserted,
          failed: term.records_failed,
          fetched: term.records_fetched,
          runId: term.id,
          skipped: term.records_skipped,
          status: term.status,
          upserted: term.records_upserted,
        },
      };
    }
    if (runAcquisition.kind === "cancelled_competing") {
      return {
        ok: true,
        value: emptyResult(runAcquisition.run.id, "cancelled"),
      };
    }
    const { run } = runAcquisition;
    runId = run.id;
    await publishRunStatusChanged(context, run.id, "running");
    const tenantReadiness = await ensureTenantReady(context, run.id);
    if (!tenantReadiness.ready) {
      return tenantReadiness.result;
    }
    const { xeroConnection } = tenantReadiness;
    context.expectedXeroTenantId = xeroConnection.xero_tenant_id;
    const modifiedSince =
      xeroConnection.sync_cursors?.find(
        (cursor) => cursor.entity_type === "leave_records"
      )?.modified_since ?? null;
    const counts = emptyCounts();
    let hasDeferredRecords = false;
    if (xeroConnection.payroll_region === "AU") {
      const leaveRecordsResult = await fetchLeaveRecordsForRegion("AU", {
        mode: context.mode,
        modifiedSince,
        xeroConnection,
      });
      if (!leaveRecordsResult.ok) {
        await completeRun(context, run.id, {
          counts,
          errorSummary: syncFailureReason(leaveRecordsResult.error),
          status: "failed",
        });
        throwRetryableXeroFailure(leaveRecordsResult.error);
        return {
          ok: true,
          value: { ...counts, runId: run.id, status: "failed" },
        };
      }
      const {
        complete,
        failures = [],
        hasInvalidRecords = false,
        leaveRecords: fetched,
        traversalOutcome = "completed",
      } = leaveRecordsResult.value;
      counts.fetched = fetched.length + failures.length;
      const processed: AppliedLeaveRecord[] = [];
      for (const mapFailure of failures) {
        counts.failed += 1;
        await recordFailure(context, {
          errorCode: "validation_error",
          errorMessage: mapFailure.reason,
          rawPayload: mapFailure.rawPayload,
          recordType: "leave_records",
          runId: run.id,
          sourceId: mapFailure.rawLeaveApplicationId ?? "unknown",
        });
      }
      for (let index = 0; index < fetched.length; index += BATCH_SIZE) {
        const runState = await tenantDatabase(
          context.clerkOrgId
        ).syncRun.findFirst({
          select: { cancel_requested_at: true },
          where: { ...scoped(context), id: run.id },
        });
        if (runState?.cancel_requested_at) {
          await completeRun(context, run.id, {
            counts,
            status: "cancelled",
          });
          return {
            ok: true,
            value: { ...counts, runId: run.id, status: "cancelled" },
          };
        }
        const batch = fetched.slice(index, index + BATCH_SIZE);
        const peopleByEmployeeId = await loadPeopleByEmployeeId(
          context,
          batch
            .map((record) => record.employeeId)
            .filter((employeeId): employeeId is string => Boolean(employeeId))
        );
        const existingRecordsBySourceRemoteId =
          await loadExistingRecordsBySourceRemoteId(
            context,
            batch
              .map((record) => record.leaveApplicationId)
              .filter((leaveApplicationId): leaveApplicationId is string =>
                Boolean(leaveApplicationId)
              )
          );
        for (const leaveRecord of batch) {
          const result = await processLeaveRecord(
            context,
            run.id,
            xeroConnection.id,
            "AU",
            leaveRecord,
            peopleByEmployeeId,
            existingRecordsBySourceRemoteId,
            startedAt
          );
          if (result.kind !== "failed" && result.flagged) {
            counts.failed += 1;
          }
          switch (result.kind) {
            case "applied":
              processed.push(result.record);
              counts.upserted += 1;
              break;
            case "skipped":
              counts.skipped += 1;
              hasDeferredRecords ||= requiresSnapshotRetry(result);
              break;
            case "failed":
              counts.failed += 1;
              break;
            default: {
              const exhaustive: never = result;
              throw new Error(`Unexpected leave record outcome: ${exhaustive}`);
            }
          }
        }
        if (index + BATCH_SIZE < fetched.length) {
          await sleep(150);
        }
      }
      const traversalSucceeded =
        complete &&
        counts.failed === 0 &&
        !hasDeferredRecords &&
        !hasInvalidRecords &&
        failures.length === 0 &&
        traversalOutcome === "completed";
      await assertRunActive(context, run.id);
      const canArchiveStale = context.mode === "full" && traversalSucceeded;
      if (context.mode === "full" && !canArchiveStale) {
        log.warn(
          "Skipped stale-archive because the Xero leave fetch was incomplete, truncated, or contained invalid records",
          {
            clerkOrgId: context.clerkOrgId,
            complete,
            connectionId: context.connectionId,
            failuresCount: failures.length,
            organisationId: context.organisationId,
            traversalOutcome,
          }
        );
      }
      let staleSinceData: {
        leave_records_stale_since?: Date | null;
      } = {};
      if (traversalSucceeded && context.mode !== "incremental") {
        staleSinceData = { leave_records_stale_since: null };
      } else if (
        !(traversalSucceeded || xeroConnection.leave_records_stale_since)
      ) {
        staleSinceData = { leave_records_stale_since: startedAt };
      }
      await withXeroBinding(context, async (tx) => {
        await assertRunActive(context, run.id, tx);
        if (
          traversalSucceeded &&
          !(await advanceXeroSyncCursor(
            {
              connectionId: context.connectionId,
              entityType: "leave_records",
              expectedModifiedSince: modifiedSince,
              nextModifiedSince: startedAt,
              scope: context,
            },
            tx
          ))
        ) {
          throw new XeroSyncRunFencedError();
        }
        const stale = canArchiveStale
          ? await archiveStaleRecords(
              context,
              fetched
                .map((record) => record.leaveApplicationId)
                .filter(Boolean),
              startedAt
            )
          : { archived: 0, personIds: [] };
        counts.archived = stale.archived;
        const affectedPersonIds = new Set([
          ...processed
            .filter((record) => record.changed)
            .map((record) => record.personId),
          ...stale.personIds,
        ]);
        await afterXeroBindingCommit(context, () =>
          enqueueFeedRebuilds(context, [...affectedPersonIds])
        );
        await assertRunActive(context, run.id, tx);
        await tx.xeroConnection.updateMany({
          data: {
            last_leave_records_sync_at: new Date(),
            ...(traversalSucceeded && context.mode === "full"
              ? { last_full_leave_records_sync_at: startedAt }
              : {}),
            last_sync_error_code: null,
            last_sync_error_message: null,
            ...staleSinceData,
          },
          where: { ...scoped(context), id: context.connectionId },
        });
      });
      const isFullySuccessful = traversalSucceeded;
      let finalStatus: SyncRunStatus = "partial_success";
      if (isFullySuccessful) {
        finalStatus = "succeeded";
      } else if (
        counts.upserted === 0 &&
        counts.archived === 0 &&
        (!complete || traversalOutcome === "envelope_error") &&
        fetched.length === 0
      ) {
        finalStatus = "failed";
      }
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
    }
    if (
      xeroConnection.payroll_region === "NZ" ||
      xeroConnection.payroll_region === "UK"
    ) {
      const isTargetedPerson = Boolean(context.personId);
      let peopleToProcess: Array<{
        default_privacy_mode: availability_privacy_mode;
        id: string;
        include_in_feeds_by_default: boolean;
        xero_employee_id: string | null;
      }>;
      let isLastPage = true;
      let cursorRecord: {
        leave_sweep_failed?: boolean;
        leave_next_person_id: string | null;
        id: string;
      } | null = null;
      let initialCursorValue: string | null = null;
      let nextCursorValue: string | null = null;
      if (isTargetedPerson) {
        peopleToProcess = await tenantDatabase(
          context.clerkOrgId
        ).person.findMany({
          select: {
            default_privacy_mode: true,
            id: true,
            include_in_feeds_by_default: true,
            xero_employee_id: true,
          },
          where: {
            ...scoped(context),
            archived_at: null,
            id: context.personId,
            xero_employee_id: { not: null },
          },
        });
      } else {
        cursorRecord = await tenantDatabase(
          context.clerkOrgId
        ).xeroConnection.findFirst({
          select: {
            id: true,
            leave_next_person_id: true,
            leave_sweep_failed: true,
          },
          where: {
            ...scoped(context),
            id: context.connectionId,
          },
        });
        initialCursorValue = cursorRecord?.leave_next_person_id ?? null;
        const candidatePeople = await tenantDatabase(
          context.clerkOrgId
        ).person.findMany({
          orderBy: { id: "asc" },
          select: {
            default_privacy_mode: true,
            id: true,
            include_in_feeds_by_default: true,
            xero_employee_id: true,
          },
          take: PROBE_PAGE_SIZE,
          where: {
            ...scoped(context),
            archived_at: null,
            ...(initialCursorValue ? { id: { gt: initialCursorValue } } : {}),
            xero_employee_id: { not: null },
          },
        });
        const hasMoreAfterPage = candidatePeople.length > LEAVE_PAGE_SIZE;
        peopleToProcess = candidatePeople.slice(0, LEAVE_PAGE_SIZE);
        isLastPage = !hasMoreAfterPage;
        nextCursorValue = hasMoreAfterPage
          ? (peopleToProcess[LEAVE_PAGE_SIZE - 1]?.id ?? null)
          : null;
      }
      const affectedPersonIds = new Set<string>();
      for (const person of peopleToProcess) {
        if (!person) {
          continue;
        }
        const runState = await tenantDatabase(
          context.clerkOrgId
        ).syncRun.findFirst({
          select: { cancel_requested_at: true },
          where: { ...scoped(context), id: run.id },
        });
        if (runState?.cancel_requested_at) {
          await completeRun(context, run.id, {
            counts,
            status: "cancelled",
          });
          return {
            ok: true,
            value: { ...counts, runId: run.id, status: "cancelled" },
          };
        }
        if (!person.xero_employee_id) {
          continue;
        }
        const employeeLeave = await fetchLeaveForEmployeeForRegion(
          xeroConnection.payroll_region,
          {
            xeroConnection,
            xeroEmployeeId: person.xero_employee_id,
          }
        );
        if (!employeeLeave.ok) {
          if (isBlanketFailure(employeeLeave.error)) {
            await completeRun(context, run.id, {
              counts,
              errorSummary: syncFailureReason(employeeLeave.error),
              status: "failed",
            });
            await withXeroBinding(context, async (tx) =>
              tx.xeroConnection.updateMany({
                data: {
                  last_sync_error_code: employeeLeave.error.code,
                  last_sync_error_message: employeeLeave.error.message,
                },
                where: { ...scoped(context), id: context.connectionId },
              })
            );
            throwRetryableXeroFailure(employeeLeave.error);
            return {
              ok: true,
              value: { ...counts, runId: run.id, status: "failed" },
            };
          }
          log.warn("Per-employee leave records fetch failed", {
            clerkOrgId: context.clerkOrgId,
            connectionId: context.connectionId,
            errorCode: employeeLeave.error.code,
            errorMessage: employeeLeave.error.message,
            organisationId: context.organisationId,
            personId: person.id,
            xeroEmployeeId: person.xero_employee_id,
          });
          await recordFailure(context, {
            errorCode: employeeLeave.error.code,
            errorMessage: employeeLeave.error.message,
            rawPayload: {
              error: employeeLeave.error,
              personId: person.id,
              xeroEmployeeId: person.xero_employee_id,
            },
            recordType: "leave_records",
            runId: run.id,
            sourceId: person.xero_employee_id,
          });
          counts.failed += 1;
          continue;
        }
        if (!employeeLeave.value.complete) {
          log.warn(
            "Per-employee leave response was malformed or incomplete; skipping stale archival for person",
            {
              clerkOrgId: context.clerkOrgId,
              connectionId: context.connectionId,
              organisationId: context.organisationId,
              personId: person.id,
              xeroEmployeeId: person.xero_employee_id,
            }
          );
          await recordFailure(context, {
            errorCode: "malformed_payload",
            errorMessage:
              "Xero returned an incomplete or unparsable leave payload for employee.",
            rawPayload: employeeLeave.value.rawResponse,
            recordType: "leave_records",
            runId: run.id,
            sourceId: person.xero_employee_id,
          });
          counts.failed += 1;
          continue;
        }
        const failuresBeforePerson = counts.failed;
        let personHasDeferredRecords = false;
        const personLeaveRecords = employeeLeave.value.leaveRecords;
        counts.fetched += personLeaveRecords.length;
        const peopleByEmployeeId = new Map([[person.xero_employee_id, person]]);
        const sourceRemoteIds = personLeaveRecords
          .map((r) => r.leaveApplicationId)
          .filter((id): id is string => Boolean(id));
        const existingRecordsBySourceRemoteId =
          await loadExistingRecordsBySourceRemoteId(context, sourceRemoteIds);
        for (const leaveRecord of personLeaveRecords) {
          const result = await processLeaveRecord(
            context,
            run.id,
            xeroConnection.id,
            xeroConnection.payroll_region,
            leaveRecord,
            peopleByEmployeeId,
            existingRecordsBySourceRemoteId,
            startedAt
          );
          if (result.kind !== "failed" && result.flagged) {
            counts.failed += 1;
          }
          switch (result.kind) {
            case "applied":
              if (result.record.changed) {
                affectedPersonIds.add(result.record.personId);
              }
              counts.upserted += 1;
              break;
            case "skipped":
              counts.skipped += 1;
              personHasDeferredRecords ||= requiresSnapshotRetry(result);
              hasDeferredRecords ||= personHasDeferredRecords;
              break;
            case "failed":
              counts.failed += 1;
              break;
            default: {
              const exhaustive: never = result;
              throw new Error(`Unexpected leave record outcome: ${exhaustive}`);
            }
          }
        }
        // Absence requires every mapped row for this person to have persisted safely.
        if (counts.failed > failuresBeforePerson || personHasDeferredRecords) {
          continue;
        }
        // Person-scoped stale archival
        const staleOutcome = await archiveStaleRecords(
          context,
          sourceRemoteIds,
          startedAt,
          person.id
        );
        counts.archived += staleOutcome.archived;
        for (const personId of staleOutcome.personIds) {
          affectedPersonIds.add(personId);
        }
      }
      await enqueueFeedRebuilds(context, [...affectedPersonIds]);
      const sweepFailed =
        counts.failed > 0 ||
        hasDeferredRecords ||
        Boolean(initialCursorValue && cursorRecord?.leave_sweep_failed);
      if (isTargetedPerson) {
        await withXeroBinding(context, async (tx) =>
          tx.xeroConnection.updateMany({
            data: {
              last_leave_records_sync_at: new Date(),
              last_sync_error_code: null,
              last_sync_error_message: null,
            },
            where: { ...scoped(context), id: context.connectionId },
          })
        );
      } else {
        let staleSinceData: {
          leave_records_stale_since?: Date | null;
        } = {};
        if (isLastPage && !sweepFailed) {
          staleSinceData = { leave_records_stale_since: null };
        } else if (!xeroConnection.leave_records_stale_since) {
          staleSinceData = { leave_records_stale_since: startedAt };
        }
        const casSuccess = await advanceCursor({
          context,
          cursorRecord,
          initialCursorValue,
          nextCursorValue,
          runId: run.id,
          staleSinceData,
          sweepFailed,
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
      }
      const finalStatus =
        counts.failed > 0 ||
        hasDeferredRecords ||
        (!isTargetedPerson && isLastPage && sweepFailed)
          ? "partial_success"
          : "succeeded";
      await completeRun(context, run.id, {
        counts,
        status: finalStatus,
      });
      return {
        ok: true,
        value: { ...counts, runId: run.id, status: finalStatus },
      };
    }
    await completeRun(context, run.id, {
      counts,
      errorSummary: "Unsupported payroll region.",
      status: "failed",
    });
    return {
      ok: true,
      value: { ...counts, runId: run.id, status: "failed" },
    };
  } catch (error) {
    if (
      (error instanceof XeroBindingChangedError ||
        error instanceof XeroSyncRunFencedError) &&
      runId
    ) {
      await completeRun(context, runId, {
        counts: emptyCounts(),
        errorSummary:
          error instanceof XeroSyncRunFencedError
            ? "sync_run_fenced"
            : "connection_changed",
        status: "cancelled",
      });
      return { ok: true, value: emptyResult(runId, "cancelled") };
    }
    log.error("Unhandled exception in syncXeroLeaveRecords:", { error });
    if (runId) {
      await completeRun(context, runId, {
        counts: emptyCounts(),
        errorSummary:
          error instanceof XeroSyncRetryError
            ? error.recoveryReason
            : "retry_later",
        status: "failed",
      });
    }
    return {
      error: {
        code: "unknown_error",
        message: "Failed to sync Xero leave records.",
      },
      ok: false,
    };
  }
}
async function ensureTenantReady(
  context: SyncXeroLeaveRecordsInput,
  runId: string
): Promise<
  | {
      ready: true;
      xeroConnection: ScopedXeroConnection;
    }
  | {
      ready: false;
      result: SyncXeroLeaveRecordsResult;
    }
> {
  const readiness = await resolveSyncTenant(context, [
    "payroll.employees.read",
    "payroll.settings.read",
  ]);
  if (!readiness.ok) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: syncFailureReason(readiness.error),
      status: "failed",
    });
    throwRetryableXeroFailure(readiness.error);
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  }
  return { ready: true, xeroConnection: readiness.value };
}
async function loadPeopleByEmployeeId(
  context: SyncXeroLeaveRecordsInput,
  employeeIds: string[]
) {
  const people = await tenantDatabase(context.clerkOrgId).person.findMany({
    select: {
      default_privacy_mode: true,
      id: true,
      include_in_feeds_by_default: true,
      xero_employee_id: true,
    },
    where: {
      ...scoped(context),
      archived_at: null,
      xero_employee_id: { in: [...new Set(employeeIds)] },
    },
  });
  const peopleByEmployeeId = new Map<string, (typeof people)[number]>();
  for (const person of people) {
    if (person.xero_employee_id) {
      peopleByEmployeeId.set(person.xero_employee_id, person);
    }
  }
  return peopleByEmployeeId;
}
async function loadExistingRecordsBySourceRemoteId(
  context: SyncXeroLeaveRecordsInput,
  sourceRemoteIds: string[]
) {
  const records = await tenantDatabase(
    context.clerkOrgId
  ).availabilityRecord.findMany({
    select: {
      approval_status: true,
      derived_sequence: true,
      failed_action: true,
      id: true,
      source_last_modified_at: true,
      source_remote_hash: true,
      source_remote_id: true,
      source_type: true,
      updated_at: true,
    },
    where: {
      ...scoped(context),
      source_remote_id: { in: [...new Set(sourceRemoteIds)] },
      source_type: { in: ["xero_leave", "team_calendar_leave"] },
    },
  });
  const recordsBySourceRemoteId = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    if (record.source_remote_id) {
      recordsBySourceRemoteId.set(record.source_remote_id, record);
    }
  }
  return recordsBySourceRemoteId;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This function validates, normalises and persists a single inbound Xero leave record, including the failed-withdraw carve-out and write-error clearing; splitting it risks the sync correctness the surrounding logic protects more than the suppression does.
async function processLeaveRecord(
  context: SyncXeroLeaveRecordsInput,
  runId: string,
  connectionId: string,
  payrollRegion: XeroPayrollRegion,
  leaveRecord: XeroLeaveRecord,
  peopleByEmployeeId: Awaited<ReturnType<typeof loadPeopleByEmployeeId>>,
  existingRecordsBySourceRemoteId: Awaited<
    ReturnType<typeof loadExistingRecordsBySourceRemoteId>
  >,
  startedAt: Date
): Promise<ProcessLeaveRecordOutcome> {
  const validation = validateLeaveRecord(leaveRecord);
  if (!validation.valid) {
    await recordFailure(context, {
      errorCode: "validation_error",
      errorMessage: validation.message,
      rawPayload: leaveRecord.rawPayload,
      recordType: "leave_records",
      runId,
      sourceId: leaveRecord.leaveApplicationId || "unknown",
    });
    return { kind: "failed" };
  }
  try {
    const person = peopleByEmployeeId.get(leaveRecord.employeeId);
    if (!person) {
      await recordFailure(context, {
        errorCode: "person_not_found",
        errorMessage: "No scoped person exists for the Xero employee.",
        rawPayload: leaveRecord.rawPayload,
        recordType: "leave_records",
        runId,
        sourceId: leaveRecord.leaveApplicationId,
      });
      return { kind: "failed" };
    }
    const startsAt = parseXeroDate(leaveRecord.startDate);
    const endsAt = parseXeroDate(leaveRecord.endDate);
    const sourceLastModifiedAt = leaveRecord.updatedDateUtc
      ? parseOptionalDateTime(leaveRecord.updatedDateUtc)
      : null;
    const approvalStatus = mapApprovalStatus(leaveRecord.status);
    if (
      !(
        startsAt &&
        endsAt &&
        sourceLastModifiedAt !== undefined &&
        approvalStatus
      )
    ) {
      await recordFailure(context, {
        errorCode: "validation_error",
        errorMessage: "Leave record contains invalid dates or status.",
        rawPayload: leaveRecord.rawPayload,
        recordType: "leave_records",
        runId,
        sourceId: leaveRecord.leaveApplicationId,
      });
      return { kind: "failed" };
    }
    const leaveTypeMapping = mapXeroLeaveType({
      leaveTypeName: leaveRecord.leaveTypeName,
      payrollRegion,
    });
    if (!leaveTypeMapping.mapped) {
      const sourceLeaveType =
        leaveTypeMapping.leaveTypeName ?? leaveRecord.leaveTypeId;
      await recordFailure(context, {
        errorCode: "unmapped_leave_type",
        errorMessage: `Xero leave type "${sourceLeaveType}" has no canonical mapping for ${payrollRegion} payroll.`,
        rawPayload: leaveRecord.rawPayload,
        recordType: "leave_records",
        runId,
        sourceId: leaveRecord.leaveApplicationId,
      });
    }
    const normalised = normaliseInboundLeaveRecord({
      approvalStatus,
      clerkOrgId: context.clerkOrgId,
      endsAt,
      organisationId: context.organisationId,
      personId: person.id,
      rawPayload: leaveRecord.rawPayload,
      recordType: leaveTypeMapping.recordType,
      sourceLastModifiedAt,
      sourceRemoteId: leaveRecord.leaveApplicationId,
      sourceType: "xero_leave",
      stableSourceKey: deriveXeroStableSourceKey({
        connectionId,
        employeeId: leaveRecord.employeeId,
        endsAt,
        leaveTypeId: leaveRecord.leaveTypeId,
        startsAt,
        units: leaveRecord.units,
      }),
      startsAt,
      title: leaveRecord.title,
      units: leaveRecord.units,
    });
    const existing = existingRecordsBySourceRemoteId.get(
      normalised.sourceRemoteId
    );
    const freshness = decideRemoteSnapshot(existing, normalised, startedAt);
    if (freshness.kind === "skip") {
      log.info("Skipped inbound Xero leave snapshot", {
        clerkOrgId: context.clerkOrgId,
        connectionId,
        organisationId: context.organisationId,
        reason: freshness.reason,
        sourceRemoteId: normalised.sourceRemoteId,
      });
      return {
        flagged: !leaveTypeMapping.mapped,
        kind: "skipped",
        reason: freshness.reason,
      };
    }
    let approvalStatusToPersist = normalised.approvalStatus;
    // Xero rejection represents both decline and withdrawal. Preserve the
    // completed local withdrawal intent when the provider confirms rejection.
    if (
      existing?.approval_status === "withdrawn" &&
      normalised.approvalStatus === "declined"
    ) {
      approvalStatusToPersist = "withdrawn";
    }
    if (
      existing?.approval_status === "xero_sync_failed" &&
      existing.failed_action === "withdraw" &&
      normalised.approvalStatus === "approved"
    ) {
      approvalStatusToPersist = "xero_sync_failed";
    }
    const changed =
      existing?.source_remote_hash !== normalised.sourceRemoteHash;
    // The write-error fields describe the last failed outbound write and are
    // only meaningful while the record sits in xero_sync_failed. Any status
    // Xero reports that settles the record must clear them, or the UI keeps
    // showing a sync failure on a record that is fine. The one exception is the
    // failed-withdraw case handled above, which deliberately stays in the
    // failed state.
    const clearedWriteError =
      approvalStatusToPersist === "xero_sync_failed"
        ? {}
        : {
            failed_action: null,
            xero_write_error: null,
            xero_write_error_raw: Prisma.DbNull,
          };
    const updatedAt = new Date();
    const xeroOwned = {
      all_day: normalised.allDay,
      approval_status: approvalStatusToPersist,
      ...clearedWriteError,
      archived_at: normalised.publishStatus === "archived" ? new Date() : null,
      contactability: normalised.contactability,
      derived_uid_key: normalised.derivedUidKey,
      ends_at: normalised.endsAt,
      person_id: normalised.personId,
      publish_status: normalised.publishStatus,
      record_type: normalised.recordType,
      source_last_modified_at: freshness.sourceLastModifiedAt,
      source_payload_json: toPrismaJsonValue(normalised.rawPayload),
      source_remote_hash: normalised.sourceRemoteHash,
      starts_at: normalised.startsAt,
      updated_at: updatedAt,
    };
    // Privacy mode, feed inclusion and title are set by the person who owns the
    // record. Xero is not the source of truth for them, so they are seeded on
    // create and on Xero-sourced records, but never overwritten on a record the
    // user authored in Team Calendar.
    const locallyOwned = {
      include_in_feed:
        normalised.includeInFeed && person.include_in_feeds_by_default,
      privacy_mode: person.default_privacy_mode,
      title: normalised.title,
    };
    const data = { ...xeroOwned, ...locallyOwned };
    const recordId = existing?.id;
    if (recordId) {
      const updateData =
        existing.source_type === "team_calendar_leave"
          ? xeroOwned
          : { ...xeroOwned, ...locallyOwned };
      const updateResult = await withXeroBinding(context, async (tx) =>
        tx.availabilityRecord.updateMany({
          data: updateData,
          where: {
            ...scoped(context),
            approval_status: existing.approval_status,
            derived_sequence: existing.derived_sequence,
            id: recordId,
            source_last_modified_at: existing.source_last_modified_at,
            source_remote_hash: existing.source_remote_hash,
            updated_at: existing.updated_at,
            ...unclaimedOrExpiredXeroWriteWhere(),
            ...noUnresolvedSubmitOperationWhere(),
          },
        })
      );
      if (updateResult.count === 0) {
        log.info("Skipped inbound Xero leave snapshot after concurrent write", {
          clerkOrgId: context.clerkOrgId,
          connectionId,
          organisationId: context.organisationId,
          reason: "stale_local_snapshot",
          sourceRemoteId: normalised.sourceRemoteId,
        });
        return {
          flagged: !leaveTypeMapping.mapped,
          kind: "skipped",
          reason: "stale_local_snapshot",
        };
      }
      existingRecordsBySourceRemoteId.set(normalised.sourceRemoteId, {
        approval_status: approvalStatusToPersist,
        derived_sequence: existing.derived_sequence,
        failed_action:
          approvalStatusToPersist === "xero_sync_failed"
            ? (existing?.failed_action ?? null)
            : null,
        id: recordId,
        source_last_modified_at: freshness.sourceLastModifiedAt,
        source_remote_hash: normalised.sourceRemoteHash,
        source_remote_id: normalised.sourceRemoteId,
        source_type: existing.source_type,
        updated_at: updatedAt,
      });
    } else {
      const created = await withXeroBinding(context, async (tx) =>
        tx.availabilityRecord.create({
          data: {
            ...data,
            clerk_org_id: context.clerkOrgId,
            organisation_id: context.organisationId,
            source_remote_id: normalised.sourceRemoteId,
            source_type: normalised.sourceType,
          },
          select: { id: true },
        })
      );
      existingRecordsBySourceRemoteId.set(normalised.sourceRemoteId, {
        approval_status: approvalStatusToPersist,
        derived_sequence: 0,
        failed_action: null,
        id: created.id,
        source_last_modified_at: freshness.sourceLastModifiedAt,
        source_remote_hash: normalised.sourceRemoteHash,
        source_remote_id: normalised.sourceRemoteId,
        source_type: normalised.sourceType,
        updated_at: updatedAt,
      });
      await materialiseSyncedPublication(context, created.id);
    }
    if (recordId) {
      await materialiseSyncedPublication(context, recordId);
    }
    return {
      flagged: !leaveTypeMapping.mapped,
      kind: "applied",
      record: {
        changed,
        personId: person.id,
        sourceRemoteId: normalised.sourceRemoteId,
      },
    };
  } catch (error) {
    if (
      error instanceof XeroBindingChangedError ||
      error instanceof XeroSyncRetryError
    ) {
      throw error;
    }
    await recordFailure(context, {
      errorCode: "db_error",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to upsert availability record.",
      rawPayload: leaveRecord.rawPayload,
      recordType: "leave_records",
      runId,
      sourceId: leaveRecord.leaveApplicationId || "unknown",
    });
    return { kind: "failed" };
  }
}
function decideRemoteSnapshot(
  existing: Awaited<
    ReturnType<typeof loadExistingRecordsBySourceRemoteId>
  > extends Map<string, infer Snapshot>
    ? Snapshot | undefined
    : never,
  normalised: {
    sourceLastModifiedAt: Date | null;
    sourceRemoteHash: string;
  },
  startedAt: Date
):
  | {
      kind: "apply";
      sourceLastModifiedAt: Date | null;
    }
  | {
      kind: "skip";
      reason: RemoteSnapshotSkipReason;
    } {
  if (!existing) {
    return {
      kind: "apply",
      sourceLastModifiedAt: normalised.sourceLastModifiedAt,
    };
  }
  if (existing.updated_at > startedAt) {
    return { kind: "skip", reason: "local_changed_after_run_started" };
  }
  const incomingTimestamp = normalised.sourceLastModifiedAt;
  const storedTimestamp = existing.source_last_modified_at;
  if (
    incomingTimestamp &&
    storedTimestamp &&
    incomingTimestamp < storedTimestamp
  ) {
    return { kind: "skip", reason: "older_remote_snapshot" };
  }
  if (
    incomingTimestamp &&
    storedTimestamp &&
    incomingTimestamp.getTime() === storedTimestamp.getTime() &&
    existing.source_remote_hash === normalised.sourceRemoteHash
  ) {
    return { kind: "skip", reason: "duplicate_remote_snapshot" };
  }
  if (
    incomingTimestamp === null &&
    existing.source_remote_hash === normalised.sourceRemoteHash
  ) {
    return { kind: "skip", reason: "duplicate_remote_snapshot" };
  }
  return {
    kind: "apply",
    sourceLastModifiedAt: incomingTimestamp ?? storedTimestamp,
  };
}
async function archiveStaleRecords(
  context: SyncXeroLeaveRecordsInput,
  fetchedRemoteIds: string[],
  startedAt: Date,
  personId?: string
): Promise<{
  archived: number;
  personIds: string[];
}> {
  const stalePredicate = {
    ...scoped(context),
    archived_at: null,
    ...(personId ? { person_id: personId } : {}),
    ...(fetchedRemoteIds.length > 0
      ? { source_remote_id: { notIn: fetchedRemoteIds } }
      : {}),
    source_type: "xero_leave" as const,
    updated_at: { lte: startedAt },
    ...unclaimedOrExpiredXeroWriteWhere(),
    ...noUnresolvedSubmitOperationWhere(),
  };
  const [stalePeople, updateResult] = await withXeroBinding(
    context,
    async (tx) => {
      const people = await tx.availabilityRecord.findMany({
        distinct: ["person_id"],
        select: { person_id: true },
        where: stalePredicate,
      });
      const updated = await tx.availabilityRecord.updateMany({
        data: {
          archived_at: new Date(),
          include_in_feed: false,
          publish_status: "archived",
          updated_at: new Date(),
        },
        where: stalePredicate,
      });
      return [people, updated] as const;
    }
  );
  return {
    archived: updateResult.count,
    personIds: stalePeople.map((record) => record.person_id),
  };
}
async function advanceCursor(params: {
  runId: string;
  context: SyncXeroLeaveRecordsInput;
  cursorRecord: {
    leave_next_person_id: string | null;
    id: string;
  } | null;
  initialCursorValue: string | null;
  nextCursorValue: string | null;
  sweepFailed: boolean;
  staleSinceData: { leave_records_stale_since?: Date | null };
}): Promise<boolean> {
  const { context, initialCursorValue, nextCursorValue } = params;
  const result = await withXeroBinding(context, async (tx) => {
    await assertRunActive(context, params.runId, tx);
    return await tx.xeroConnection.updateMany({
      data: {
        last_leave_records_sync_at: new Date(),
        last_sync_error_code: null,
        last_sync_error_message: null,
        leave_next_person_id: nextCursorValue,
        leave_sweep_failed: params.sweepFailed,
        ...params.staleSinceData,
      },
      where: {
        ...scoped(context),
        id: context.connectionId,
        leave_next_person_id: initialCursorValue,
      },
    });
  });
  return result.count === 1;
}
async function materialiseSyncedPublication(
  context: SyncXeroLeaveRecordsInput,
  availabilityRecordId: string
): Promise<void> {
  await afterXeroBindingCommit(context, async () => {
    const publication = await materialiseAvailabilityPublication({
      availabilityRecordId,
      clerkOrgId: context.clerkOrgId,
      // Sync batches its own rebuilds via enqueueFeedRebuilds, so skip per-record cache
      // invalidation here to avoid churn across a full sync run.
      invalidateCache: false,
      organisationId: context.organisationId,
    });
    if (!publication.ok) {
      throw new Error(publication.error.message);
    }
  });
}
async function enqueueFeedRebuilds(
  context: SyncXeroLeaveRecordsInput,
  personIds: string[]
) {
  if (personIds.length === 0) {
    return;
  }
  const feeds = await feedIdsForPeople({
    clerkOrgId: context.clerkOrgId,
    organisationId: context.organisationId,
    personIds,
  });
  const uniqueFeedIds = [...new Set(feeds.map((feed) => feed.id))];
  if (uniqueFeedIds.length === 0) {
    return;
  }
  await inngest.send(
    uniqueFeedIds.map((feedId) => ({
      data: {
        clerkOrgId: context.clerkOrgId,
        feedId,
        organisationId: context.organisationId,
        reason: "xero_leave_records_synced",
      },
      name: "rebuild-feed-cache",
    }))
  );
}
function validateLeaveRecord(leaveRecord: XeroLeaveRecord):
  | {
      valid: true;
    }
  | {
      message: string;
      valid: false;
    } {
  if (
    !(
      leaveRecord.leaveApplicationId &&
      UUID_REGEX.test(leaveRecord.leaveApplicationId)
    )
  ) {
    return { message: "Invalid or missing Leave Application ID", valid: false };
  }
  if (!(leaveRecord.employeeId && UUID_REGEX.test(leaveRecord.employeeId))) {
    return { message: "Invalid or missing Employee ID", valid: false };
  }
  if (!leaveRecord.leaveTypeId.trim()) {
    return { message: "Leave type is required", valid: false };
  }
  if (leaveRecord.units < 0) {
    return { message: "Leave units must not be negative", valid: false };
  }
  if (
    leaveRecord.units === 0 &&
    (leaveRecord.status === "APPROVED" ||
      leaveRecord.status === "SUBMITTED" ||
      leaveRecord.status === "UNKNOWN")
  ) {
    return {
      message: "Active leave units must be greater than zero",
      valid: false,
    };
  }
  return { valid: true };
}
function mapApprovalStatus(
  status: XeroLeaveRecordStatus
): InboundLeaveApprovalStatus | null {
  switch (status) {
    case "APPROVED":
      return "approved";
    case "DELETED":
      return "cancelled";
    case "REJECTED":
      return "declined";
    case "SUBMITTED":
      return "submitted";
    case "WITHDRAWN":
      return "withdrawn";
    case "UNKNOWN":
      return null;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
function parseXeroDate(value: string): Date | null {
  if (!DATE_ONLY_REGEX.test(value)) {
    return parseOptionalDateTime(value);
  }
  return parseOptionalDateTime(`${value}T00:00:00.000Z`);
}
function parseOptionalDateTime(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
async function recordFailure(
  context: SyncXeroLeaveRecordsInput,
  input: {
    errorCode: string;
    errorMessage: string;
    rawPayload: unknown;
    recordType: string;
    runId: string;
    sourceId: string;
  }
) {
  await tenantDatabase(context.clerkOrgId).failedRecord.create({
    data: {
      ...scoped(context),
      entity_type: "leave_records",
      error_code: input.errorCode,
      error_message: input.errorMessage,
      raw_payload: toPrismaJsonValue(input.rawPayload),
      record_type: failedRecordType(input.recordType),
      source_id: input.sourceId,
      source_remote_id: input.sourceId,
      sync_run_id: input.runId,
    },
  });
}
function failedRecordType(
  value: string
): z.infer<typeof FailedRecordTypeSchema> {
  const parsed = FailedRecordTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : "leave_records";
}
async function completeRun(
  context: SyncXeroLeaveRecordsInput,
  runId: string,
  input: {
    counts: Counts;
    errorSummary?: string;
    status: "cancelled" | "failed" | "partial_success" | "succeeded";
  }
) {
  const persist = async (tx: Prisma.TransactionClient) => {
    const updated = await tx.syncRun.updateMany({
      data: {
        completed_at: new Date(),
        error_summary: input.errorSummary ?? null,
        records_failed: input.counts.failed,
        records_fetched: input.counts.fetched,
        records_skipped: input.counts.skipped,
        records_synced: input.counts.upserted + input.counts.archived,
        records_upserted: input.counts.upserted,
        status: input.status,
      },
      where: { ...scoped(context), id: runId, status: "running" },
    });
    if (
      updated.count === 0 &&
      (input.status === "succeeded" || input.status === "partial_success")
    ) {
      throw new XeroBindingChangedError();
    }
  };
  if (input.status === "succeeded" || input.status === "partial_success") {
    await withXeroBinding(context, persist);
  } else {
    await tenantTransaction(context.clerkOrgId, persist);
  }
  await publishRunStatusChanged(context, runId, input.status);
}
function isBlanketFailure(error: XeroWriteError): boolean {
  return (
    Boolean(error.recoveryReason) ||
    error.code === "auth_error" ||
    error.code === "rate_limit_error" ||
    error.code === "permission_error" ||
    error.code === "network_error"
  );
}
async function publishRunStatusChanged(
  context: SyncXeroLeaveRecordsInput,
  runId: string,
  status: string
) {
  try {
    await (() =>
      publishOrganisationNotificationEvent(
        {
          clerkOrgId: context.clerkOrgId,
          organisationId: context.organisationId,
        },
        {
          payload: {
            connectionId: context.connectionId,
            organisationId: context.organisationId,
            runId,
            runType: "leave_records",
            status,
          },
          type: "sync.run_status_changed",
        }
      ))();
  } catch (error) {
    if (
      error instanceof XeroBindingChangedError ||
      error instanceof XeroSyncRetryError
    ) {
      throw error;
    }
    log.error("Failed to publish sync run status notification", {
      error,
      organisationId: context.organisationId,
      runId,
    });
  }
}
function emptyCounts(): Counts {
  return {
    archived: 0,
    failed: 0,
    fetched: 0,
    skipped: 0,
    upserted: 0,
  };
}
function emptyResult(
  runId: string | null,
  status: "ignored" | "cancelled" | "failed" | "partial_success" | "succeeded"
) {
  return {
    ...emptyCounts(),
    runId,
    status,
  };
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
function validationError(
  error: z.ZodError
): Result<never, SyncXeroLeaveRecordsError> {
  return {
    error: {
      code: "validation_error",
      message:
        error.issues[0]?.message ?? "Invalid sync leave records request.",
    },
    ok: false,
  };
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
