import "server-only";

import {
  type InboundLeaveApprovalStatus,
  materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord,
  unclaimedOrExpiredXeroWriteWhere,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { database, scopedTo as scoped } from "@repo/database";
import {
  type availability_privacy_mode,
  Prisma,
} from "@repo/database/generated/client";
import { feedIdsForPeople } from "@repo/feeds";
import { publishOrganisationNotificationEvent } from "@repo/notifications";
import { log } from "@repo/observability/log";
import {
  deriveXeroStableSourceKey,
  ensureFreshXeroConnection,
  fetchLeaveForEmployeeForRegion,
  fetchLeaveRecordsForRegion,
  mapXeroLeaveType,
  toPlainLanguageMessage,
  type XeroLeaveRecord,
  type XeroLeaveRecordStatus,
  type XeroPayrollRegion,
  type XeroWriteError,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const SyncXeroLeaveRecordsInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  xeroTenantId: z.string().uuid(),
});

export type SyncXeroLeaveRecordsInput = z.infer<
  typeof SyncXeroLeaveRecordsInputSchema
>;

export type SyncXeroLeaveRecordsError =
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const BATCH_SIZE = 50;
const LEAVE_PAGE_SIZE = 20;
const PROBE_PAGE_SIZE = 21;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const STALE_RUN_WINDOW_MS = 30 * 60 * 1000;
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
  | { flagged: boolean; kind: "applied"; record: AppliedLeaveRecord }
  | { kind: "failed" }
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

type SyncStatus = "cancelled" | "failed" | "partial_success" | "succeeded";
type SyncXeroLeaveRecordsResult = Result<
  Counts & {
    runId: string;
    status: SyncStatus;
  },
  SyncXeroLeaveRecordsError
>;
type XeroTenant = NonNullable<Awaited<ReturnType<typeof loadXeroTenant>>>;

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
        syncXeroLeaveRecords(event.data)
      )
  );

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This handler coordinates run lifecycle, tenant readiness, batching, publication updates and finalisation.
export async function syncXeroLeaveRecords(
  input: unknown
): Promise<SyncXeroLeaveRecordsResult> {
  const parsed = SyncXeroLeaveRecordsInputSchema.safeParse(input);
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

    if (xeroTenant.payroll_region === "AU") {
      const leaveRecordsResult = await fetchLeaveRecordsForRegion("AU", {
        xeroTenant,
      });
      if (!leaveRecordsResult.ok) {
        await completeRun(context, run.id, {
          counts,
          errorSummary: isBlanketFailure(leaveRecordsResult.error)
            ? toPlainLanguageMessage(leaveRecordsResult.error)
            : leaveRecordsResult.error.message,
          status: "failed",
        });
        return {
          ok: true,
          value: { ...counts, runId: run.id, status: "failed" },
        };
      }

      const { complete, leaveRecords: fetched } = leaveRecordsResult.value;
      counts.fetched = fetched.length;
      const processed: AppliedLeaveRecord[] = [];

      for (let index = 0; index < fetched.length; index += BATCH_SIZE) {
        const runState = await database.syncRun.findFirst({
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
            xeroTenant.id,
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

      const stale = complete
        ? await archiveStaleRecords(
            context,
            fetched.map((record) => record.leaveApplicationId).filter(Boolean),
            startedAt
          )
        : { archived: 0, personIds: [] };
      if (!complete) {
        log.warn(
          "Skipped stale-archive because the Xero leave fetch was truncated",
          {
            clerkOrgId: context.clerkOrgId,
            organisationId: context.organisationId,
            xeroTenantId: context.xeroTenantId,
          }
        );
      }
      counts.archived = stale.archived;
      const affectedPersonIds = new Set([
        ...processed
          .filter((record) => record.changed)
          .map((record) => record.personId),
        ...stale.personIds,
      ]);
      await enqueueFeedRebuilds(context, [...affectedPersonIds]);

      await database.xeroTenant.updateMany({
        data: {
          last_leave_records_sync_at: new Date(),
          last_sync_error_code: null,
          last_sync_error_message: null,
          leave_records_stale_since: null,
        },
        where: { ...scoped(context), id: context.xeroTenantId },
      });

      const finalStatus = counts.failed > 0 ? "partial_success" : "succeeded";
      await completeRun(context, run.id, {
        counts,
        status: finalStatus,
      });

      return {
        ok: true,
        value: { ...counts, runId: run.id, status: finalStatus },
      };
    }

    if (
      xeroTenant.payroll_region === "NZ" ||
      xeroTenant.payroll_region === "UK"
    ) {
      const isTargetedPerson = Boolean(context.personId);
      let peopleToProcess: Array<{
        default_privacy_mode: availability_privacy_mode;
        id: string;
        include_in_feeds_by_default: boolean;
        xero_employee_id: string | null;
      }>;
      let isLastPage = true;
      let cursorRecord: { cursor_value: string | null; id: string } | null =
        null;
      let initialCursorValue: string | null = null;
      let nextCursorValue: string | null = null;

      if (isTargetedPerson) {
        peopleToProcess = await database.person.findMany({
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
        cursorRecord = await database.xeroSyncCursor.findFirst({
          select: { cursor_value: true, id: true },
          where: {
            ...scoped(context),
            entity_type: "leave_records",
            xero_tenant_id: context.xeroTenantId,
          },
        });
        initialCursorValue = cursorRecord?.cursor_value ?? null;

        const candidatePeople = await database.person.findMany({
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

        const runState = await database.syncRun.findFirst({
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
          xeroTenant.payroll_region,
          {
            xeroEmployeeId: person.xero_employee_id,
            xeroTenant,
          }
        );

        if (!employeeLeave.ok) {
          if (isBlanketFailure(employeeLeave.error)) {
            await completeRun(context, run.id, {
              counts,
              errorSummary: employeeLeave.error.message,
              status: "failed",
            });
            await database.xeroTenant.updateMany({
              data: {
                last_sync_error_code: employeeLeave.error.code,
                last_sync_error_message: employeeLeave.error.message,
              },
              where: { ...scoped(context), id: context.xeroTenantId },
            });
            return {
              ok: true,
              value: { ...counts, runId: run.id, status: "failed" },
            };
          }

          log.warn("Per-employee leave records fetch failed", {
            clerkOrgId: context.clerkOrgId,
            errorCode: employeeLeave.error.code,
            errorMessage: employeeLeave.error.message,
            organisationId: context.organisationId,
            personId: person.id,
            xeroEmployeeId: person.xero_employee_id,
            xeroTenantId: context.xeroTenantId,
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
              organisationId: context.organisationId,
              personId: person.id,
              xeroEmployeeId: person.xero_employee_id,
              xeroTenantId: context.xeroTenantId,
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
            xeroTenant.id,
            xeroTenant.payroll_region,
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

      if (isTargetedPerson) {
        await database.xeroTenant.updateMany({
          data: {
            last_leave_records_sync_at: new Date(),
            last_sync_error_code: null,
            last_sync_error_message: null,
          },
          where: { ...scoped(context), id: context.xeroTenantId },
        });
      } else {
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

        let staleSinceData: { leave_records_stale_since?: Date | null } = {};
        if (isLastPage) {
          staleSinceData = { leave_records_stale_since: null };
        } else if (!xeroTenant.leave_records_stale_since) {
          staleSinceData = { leave_records_stale_since: startedAt };
        }

        await database.xeroTenant.updateMany({
          data: {
            last_leave_records_sync_at: new Date(),
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
    log.error("Unhandled exception in syncXeroLeaveRecords:", { error });
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
        message: "Failed to sync Xero leave records.",
      },
      ok: false,
    };
  }
}

async function cancelDuplicateRun(
  context: SyncXeroLeaveRecordsInput,
  startedAt: Date
): Promise<{ id: string } | null> {
  const existingRun = await database.syncRun.findFirst({
    select: { id: true },
    where: {
      ...scoped(context),
      run_type: "leave_records",
      started_at: { gte: new Date(Date.now() - STALE_RUN_WINDOW_MS) },
      status: "running",
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
      error_summary: "Another leave records sync run is already in progress",
      run_type: "leave_records",
      started_at: startedAt,
      status: "cancelled",
      trigger_type: context.triggerType,
      triggered_by_user_id: context.triggeredByUserId ?? null,
      xero_tenant_id: context.xeroTenantId,
    },
    select: { id: true },
  });
}

function createRun(context: SyncXeroLeaveRecordsInput, startedAt: Date) {
  return database.syncRun.create({
    data: {
      ...scoped(context),
      entity_type: "leave_records",
      run_type: "leave_records",
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
  context: SyncXeroLeaveRecordsInput,
  runId: string
): Promise<
  | { ready: true; xeroTenant: XeroTenant }
  | { ready: false; result: SyncXeroLeaveRecordsResult }
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

async function loadPeopleByEmployeeId(
  context: SyncXeroLeaveRecordsInput,
  employeeIds: string[]
) {
  const people = await database.person.findMany({
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
  const records = await database.availabilityRecord.findMany({
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
  xeroTenantId: string,
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
        employeeId: leaveRecord.employeeId,
        endsAt,
        leaveTypeId: leaveRecord.leaveTypeId,
        startsAt,
        units: leaveRecord.units,
        xeroTenantId,
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
        organisationId: context.organisationId,
        reason: freshness.reason,
        sourceRemoteId: normalised.sourceRemoteId,
        xeroTenantId,
      });
      return {
        flagged: !leaveTypeMapping.mapped,
        kind: "skipped",
        reason: freshness.reason,
      };
    }
    let approvalStatusToPersist = normalised.approvalStatus;
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
      const updateResult = await database.availabilityRecord.updateMany({
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
        },
      });
      if (updateResult.count === 0) {
        log.info("Skipped inbound Xero leave snapshot after concurrent write", {
          clerkOrgId: context.clerkOrgId,
          organisationId: context.organisationId,
          reason: "stale_local_snapshot",
          sourceRemoteId: normalised.sourceRemoteId,
          xeroTenantId,
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
      const created = await database.availabilityRecord.create({
        data: {
          ...data,
          clerk_org_id: context.clerkOrgId,
          organisation_id: context.organisationId,
          source_remote_id: normalised.sourceRemoteId,
          source_type: normalised.sourceType,
        },
        select: { id: true },
      });
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
  | { kind: "apply"; sourceLastModifiedAt: Date | null }
  | { kind: "skip"; reason: RemoteSnapshotSkipReason } {
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
): Promise<{ archived: number; personIds: string[] }> {
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
  };

  const [stalePeople, updateResult] = await database.$transaction(
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
  context: SyncXeroLeaveRecordsInput;
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
        entity_type: "leave_records",
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
        entity_type: "leave_records",
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

async function materialiseSyncedPublication(
  context: SyncXeroLeaveRecordsInput,
  availabilityRecordId: string
): Promise<void> {
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

function validateLeaveRecord(
  leaveRecord: XeroLeaveRecord
): { valid: true } | { message: string; valid: false } {
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
  await database.failedRecord.create({
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
  await database.syncRun.updateMany({
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
    where: { ...scoped(context), id: runId },
  });
  await publishRunStatusChanged(context, runId, input.status);
}

function loadXeroTenant(context: SyncXeroLeaveRecordsInput) {
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

function isBlanketFailure(error: XeroWriteError): boolean {
  return (
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
    await publishOrganisationNotificationEvent(
      {
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
      },
      {
        payload: {
          organisationId: context.organisationId,
          runId,
          runType: "leave_records",
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
  runId: string,
  status: "cancelled" | "failed" | "partial_success" | "succeeded"
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
