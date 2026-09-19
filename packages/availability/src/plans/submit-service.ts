import "server-only";

import { createHash } from "node:crypto";

import type {
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  Result,
} from "@repo/core";
import {
  acquireSubmitRecoverySideEffects,
  database,
  hasUnresolvedSubmitOperation,
  markSubmitCompleted,
  markSubmitDefinitiveFailure,
  markSubmitDispatchStarted,
  markSubmitOutcomeUnknown,
  markSubmitProviderAccepted,
  prepareAndClaimSubmitOperation,
  releaseSubmitRecoverySideEffects,
  scopedTo as scoped,
} from "@repo/database";
import {
  type AvailabilityRecord,
  Prisma,
} from "@repo/database/generated/client";
import type { availability_approval_status } from "@repo/database/generated/enums";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import {
  dispatchNotification,
  type NotificationDispatchDatabase,
} from "@repo/notifications";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { computeWorkingDays } from "../duration/working-days";
import { isXeroLeaveType } from "../records/record-type-categories";
import { hasActiveXeroConnection } from "../xero-connection-state";
import {
  acquireXeroWriteClaim,
  releaseXeroWriteClaim,
  unclaimedOrExpiredXeroWriteWhere,
  XERO_WRITE_CLAIM_LEASE_MS,
} from "../xero-write-claim";
import { completeSubmitSideEffects } from "./submit-side-effects";

export type SubmitServiceError =
  | { code: "invalid_state_for_retry"; message: string }
  | { code: "invalid_state_for_revert"; message: string }
  | { code: "invalid_state_for_submit"; message: string }
  | { code: "invalid_state_for_withdraw"; message: string }
  | { code: "not_a_leave_type"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "record_not_found"; message: string }
  | {
      code: "submission_blocked_resolution";
      message: string;
      resolutionError: ProviderResolutionError;
    }
  | { code: "submission_outcome_unknown"; message: string }
  | { code: "unknown_error"; message: string }
  | {
      code: "xero_not_connected";
      message: string;
    }
  | {
      code: "xero_write_failed";
      message: string;
      xeroError: ProviderWriteError;
    };

const RecordActionSchema = z.object({
  actingOrgRole: z.string().nullable().optional(),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

type RecordActionInput = z.infer<typeof RecordActionSchema>;
type LoadedRecord = NonNullable<Awaited<ReturnType<typeof loadScopedRecord>>>;
type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export async function submitDraftRecord(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  return await performSubmission(input, externalWritePort, {
    failureAuditAction: "availability_records.submission_failed",
    invalidStateCode: "invalid_state_for_submit",
    successAuditAction: "availability_records.submitted",
    validStatus: "draft",
  });
}

export async function retrySubmission(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  return await performSubmission(input, externalWritePort, {
    failureAuditAction: "availability_records.submission_retry_failed",
    invalidStateCode: "invalid_state_for_retry",
    successAuditAction: "availability_records.submission_retry_succeeded",
    validStatus: "xero_sync_failed",
  });
}

export async function revertToDraft(
  input: RecordActionInput
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Invalid submission request.");
  }

  try {
    const authorised = await loadAndAuthorise(parsed.data, "manager_allowed");
    if (!authorised.ok) {
      return authorised;
    }

    if (
      authorised.value.approval_status !== "xero_sync_failed" ||
      authorised.value.failed_action !== "submit"
    ) {
      return invalidState("invalid_state_for_revert");
    }
    if (
      await hasUnresolvedSubmitOperation({
        availabilityRecordId: authorised.value.id,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      })
    ) {
      return submissionOutcomeUnknown();
    }

    await database.$transaction(async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "draft",
          failed_action: null,
          updated_by_user_id: parsed.data.actingUserId,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(parsed.data),
          approval_status: "xero_sync_failed",
          derived_sequence: authorised.value.derived_sequence,
          id: parsed.data.recordId,
          ...unclaimedOrExpiredXeroWriteWhere(),
        },
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }

      await tx.auditEvent.create({
        data: auditData(
          parsed.data,
          "availability_records.reverted_to_draft",
          {}
        ),
      });
    });

    const updated = await loadBareRecord(parsed.data);
    if (!updated) {
      return recordNotFound();
    }
    await materialiseSubmitPublication(parsed.data);
    return { ok: true, value: updated };
  } catch (error) {
    if (error instanceof OptimisticConflictError) {
      return invalidState("invalid_state_for_revert");
    }
    return unknownError("Failed to revert this record to draft.");
  }
}

export async function withdrawSubmission(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Invalid submission request.");
  }

  let claimedAt: Date | null = null;
  try {
    const authorised = await loadAndAuthorise(parsed.data, "owner_only");
    if (!authorised.ok) {
      return authorised;
    }
    const record = authorised.value;

    if (
      (record.approval_status !== "submitted" &&
        record.approval_status !== "approved") ||
      !record.source_remote_id ||
      record.source_type !== "team_calendar_leave"
    ) {
      return invalidState("invalid_state_for_withdraw");
    }

    const prepared = await prepareXeroWrite(
      parsed.data,
      record,
      externalWritePort
    );
    if (!prepared.ok) {
      return prepared;
    }

    claimedAt = await acquireXeroWriteClaim({
      ...parsed.data,
      expectedFailedAction: null,
      expectedSequence: record.derived_sequence,
      expectedStatus: record.approval_status,
    });
    if (!claimedAt) {
      return invalidState("invalid_state_for_withdraw");
    }
    const ownerClaim = claimedAt;

    const xeroLeaveApplicationId = record.source_remote_id;
    const response = await externalWritePort.withdrawLeaveApplication({
      clerkOrgId: parsed.data.clerkOrgId,
      employeeId: prepared.value.xeroEmployeeId,
      organisationId: parsed.data.organisationId,
      remoteId: xeroLeaveApplicationId,
    });

    if (!response.ok) {
      return await persistXeroFailure({
        actionUrl: `/plans?recordId=${record.id}`,
        auditAction: "availability_records.withdrawal_failed",
        claimedAt: ownerClaim,
        error: response.error,
        expectedStatus: record.approval_status,
        failedAction: "withdraw",
        input: parsed.data,
        record,
      });
    }

    await database.$transaction(async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "withdrawn",
          derived_sequence: { increment: 1 },
          failed_action: null,
          updated_by_user_id: parsed.data.actingUserId,
          withdrawn_at: new Date(),
          xero_write_claimed_at: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(parsed.data),
          approval_status: { in: ["submitted", "approved"] },
          derived_sequence: record.derived_sequence,
          id: record.id,
          xero_write_claimed_at: ownerClaim,
        },
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }

      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.withdrawn", {
          xeroLeaveApplicationId,
        }),
      });
    });

    await notifyManagerBestEffort(parsed.data, record, "leave_withdrawn", {
      actionUrl: `/leave-approvals?recordId=${record.id}`,
    });

    const updated = await loadBareRecord(parsed.data);
    if (!updated) {
      return recordNotFound();
    }
    await materialiseSubmitPublication(parsed.data);
    return { ok: true, value: updated };
  } catch (error) {
    if (claimedAt) {
      await releaseXeroWriteClaim({ ...parsed.data, claimedAt });
    }
    if (error instanceof OptimisticConflictError) {
      return invalidState("invalid_state_for_withdraw");
    }
    return unknownError("Failed to withdraw this submission.");
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Submission deliberately keeps durable operation transitions beside the synchronous provider call so reviewers can verify every uncertainty edge in one ordered path.
async function performSubmission(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort,
  options: {
    failureAuditAction: string;
    invalidStateCode: "invalid_state_for_retry" | "invalid_state_for_submit";
    successAuditAction: string;
    validStatus: "draft" | "xero_sync_failed";
  }
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Invalid submission request.");
  }

  let record: LoadedRecord | null = null;
  let claimedAt: Date | null = null;
  let dispatchStarted = false;
  let attemptGeneration: number | null = null;
  try {
    const authorised = await loadAndAuthorise(parsed.data, "manager_allowed");
    if (!authorised.ok) {
      return authorised;
    }
    record = authorised.value;

    if (
      record.source_type !== "team_calendar_leave" ||
      record.approval_status !== options.validStatus ||
      (options.validStatus === "xero_sync_failed" &&
        record.failed_action !== "submit")
    ) {
      return invalidState(options.invalidStateCode);
    }
    if (!isXeroLeaveType(record.record_type)) {
      return {
        error: {
          code: "not_a_leave_type",
          message: "Only Xero leave types can be submitted to Xero.",
        },
        ok: false,
      };
    }

    const prepared = await prepareXeroWrite(
      parsed.data,
      record,
      externalWritePort
    );
    if (!prepared.ok) {
      return prepared;
    }

    const operationScope = {
      availabilityRecordId: record.id,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    };
    const preparedOperation = await prepareAndClaimSubmitOperation({
      ...operationScope,
      actorUserId: parsed.data.actingUserId,
      claimableBefore: new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS),
      expectedFailedAction:
        options.validStatus === "xero_sync_failed" ? "submit" : null,
      expectedSequence: record.derived_sequence,
      expectedStatus: options.validStatus,
      requestEmployeeId: prepared.value.xeroEmployeeId,
      requestEndsAt: record.ends_at,
      requestFingerprint: submitRequestFingerprint({
        employeeId: prepared.value.xeroEmployeeId,
        endsAt: record.ends_at,
        leaveTypeId: prepared.value.xeroLeaveTypeId,
        startsAt: record.starts_at,
        title: record.title ?? "Leave request",
        units: prepared.value.units,
      }),
      requestLeaveTypeId: prepared.value.xeroLeaveTypeId,
      requestStartsAt: record.starts_at,
      requestTitle: record.title ?? "Leave request",
      requestUnits: prepared.value.units,
    });
    if (!preparedOperation) {
      return submissionOutcomeUnknown();
    }
    ({ attemptGeneration, claimedAt } = preparedOperation);
    const operationAttempt = { ...operationScope, attemptGeneration };

    // Claim before calling Xero, not after. The guarded update further down
    // protects the database row, but by the time it runs the leave application
    // already exists in payroll. Xero's create endpoint has no idempotency key,
    // so two concurrent submissions would create two applications and only one
    // would be recorded here.
    dispatchStarted = await markSubmitDispatchStarted(operationAttempt);
    if (!dispatchStarted) {
      await releaseXeroWriteClaim({ ...parsed.data, claimedAt });
      claimedAt = null;
      return submissionOutcomeUnknown();
    }

    let submission: Awaited<
      ReturnType<ExternalWritePort["submitLeaveApplication"]>
    >;
    try {
      submission = await externalWritePort.submitLeaveApplication({
        clerkOrgId: parsed.data.clerkOrgId,
        employeeId: prepared.value.xeroEmployeeId,
        endsAt: record.ends_at,
        leaveTypeId: prepared.value.xeroLeaveTypeId,
        organisationId: parsed.data.organisationId,
        startsAt: record.starts_at,
        title: record.title ?? "Leave request",
        units: prepared.value.units,
      });
    } catch {
      await markSubmitOutcomeUnknown(operationAttempt, "transport_exception");
      await releaseXeroWriteClaim({ ...parsed.data, claimedAt });
      claimedAt = null;
      return submissionOutcomeUnknown();
    }

    if (!submission.ok) {
      if (isDefinitiveWriteFailure(submission.error)) {
        await markSubmitDefinitiveFailure(
          operationAttempt,
          submission.error.code
        );
      } else {
        await markSubmitOutcomeUnknown(operationAttempt, submission.error.code);
      }
      return await persistXeroFailure({
        actionUrl: `/plans?recordId=${record.id}`,
        auditAction: options.failureAuditAction,
        claimedAt,
        error: submission.error,
        expectedStatus: options.validStatus,
        failedAction: "submit",
        input: parsed.data,
        record,
      });
    }

    const accepted = await markSubmitProviderAccepted(
      operationAttempt,
      submission.value.remoteId
    );
    if (!accepted) {
      return submissionOutcomeUnknown();
    }

    // `record` is a `let` narrowed above; alias it to a const so the
    // transaction closure (evaluated later, from TypeScript's perspective)
    // keeps the non-null type instead of widening back to LoadedRecord | null.
    const claimedRecord = record;

    await database.$transaction(async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "submitted",
          derived_sequence: { increment: 1 },
          failed_action: null,
          source_payload_json: toPrismaJsonValue(submission.value.rawResponse),
          source_remote_id: submission.value.remoteId,
          submitted_at: new Date(),
          updated_by_user_id: parsed.data.actingUserId,
          xero_write_claimed_at: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(parsed.data),
          approval_status: options.validStatus,
          derived_sequence: claimedRecord.derived_sequence,
          id: claimedRecord.id,
          xero_write_claimed_at: claimedAt,
        },
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }

      await tx.auditEvent.create({
        data: auditData(parsed.data, options.successAuditAction, {
          xeroLeaveApplicationId: submission.value.remoteId,
        }),
      });
    });
    claimedAt = null;

    const sideEffectClaimedAt = await acquireSubmitRecoverySideEffects(
      operationAttempt,
      new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS)
    );
    if (!sideEffectClaimedAt) {
      return submissionOutcomeUnknown();
    }
    const sideEffects = await completeSubmitSideEffects({
      actorUserId: parsed.data.actingUserId,
      attempt: operationAttempt,
      claimedAt: sideEffectClaimedAt,
      clerkOrgId: parsed.data.clerkOrgId,
      manager: record.person.manager?.clerk_user_id
        ? {
            clerkUserId: record.person.manager.clerk_user_id,
            personId: record.person.manager.id,
          }
        : null,
      notifyManager: true,
      organisationId: parsed.data.organisationId,
      recordId: record.id,
    });
    if (!sideEffects.ok) {
      await releaseSubmitRecoverySideEffects(
        operationAttempt,
        sideEffectClaimedAt
      );
      return submissionOutcomeUnknown();
    }
    if (!(await markSubmitCompleted(operationAttempt, database))) {
      return submissionOutcomeUnknown();
    }

    const updated = await loadBareRecord(parsed.data);
    if (!updated) {
      return recordNotFound();
    }
    return { ok: true, value: updated };
  } catch (error) {
    if (record && dispatchStarted && attemptGeneration !== null) {
      await markSubmitOutcomeUnknown(
        {
          attemptGeneration,
          availabilityRecordId: record.id,
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
        },
        "local_persistence_failure"
      );
    }
    if (claimedAt) {
      await releaseXeroWriteClaim({ ...parsed.data, claimedAt });
    }
    if (error instanceof OptimisticConflictError) {
      return invalidState(options.invalidStateCode);
    }
    return unknownError("Failed to submit this record.");
  }
}

export const submitRequestFingerprint = (input: {
  employeeId: string;
  endsAt: Date;
  leaveTypeId: string;
  startsAt: Date;
  title: string | null;
  units: number;
}): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        employeeId: input.employeeId,
        endsAt: input.endsAt.toISOString(),
        leaveTypeId: input.leaveTypeId,
        startsAt: input.startsAt.toISOString(),
        title: input.title,
        units: input.units,
      })
    )
    .digest("hex");

const submissionOutcomeUnknown = (): Result<never, SubmitServiceError> => ({
  error: {
    code: "submission_outcome_unknown",
    message:
      "Xero may have received this leave request. An administrator must resolve it before it can be submitted again.",
  },
  ok: false,
});

const isDefinitiveWriteFailure = (error: ProviderWriteError): boolean =>
  error.certainty === "definitive_failure" ||
  (error.certainty === undefined &&
    [
      "auth_error",
      "conflict_error",
      "not_found_error",
      "permission_error",
      "rate_limit_error",
      "region_not_supported_error",
      "validation_error",
    ].includes(error.code));

async function prepareXeroWrite(
  input: RecordActionInput,
  record: LoadedRecord,
  externalWritePort: ExternalWritePort
): Promise<
  Result<
    {
      units: number;
      xeroEmployeeId: string;
      xeroLeaveTypeId: string;
    },
    SubmitServiceError
  >
> {
  const hasXero = await hasActiveXeroConnection(input);
  if (!hasXero) {
    return {
      error: {
        code: "xero_not_connected",
        message:
          "Xero is not connected. This record is already approved locally and will appear on the calendar. Ask an administrator to connect Xero to enable submission for approval.",
      },
      ok: false,
    };
  }

  const employee = await externalWritePort.resolveEmployeeId({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    personId: record.person_id,
  });
  if (!employee.ok) {
    return resolutionBlocked(employee.error);
  }

  const leaveType = await externalWritePort.resolveLeaveTypeId({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    personId: record.person_id,
    recordType: record.record_type,
  });
  if (!leaveType.ok) {
    return resolutionBlocked(leaveType.error);
  }

  const duration = await computeWorkingDays({
    allDay: record.all_day,
    clerkOrgId: input.clerkOrgId,
    endsAt: record.ends_at,
    locationId: record.person.location_id,
    organisationId: input.organisationId,
    startsAt: record.starts_at,
  });
  if (!duration.ok) {
    return unknownError(duration.error.message);
  }

  return {
    ok: true,
    value: {
      units: duration.value,
      xeroEmployeeId: employee.value,
      xeroLeaveTypeId: leaveType.value,
    },
  };
}

async function persistXeroFailure(input: {
  actionUrl: string;
  auditAction: string;
  expectedStatus: availability_approval_status;
  failedAction: "submit" | "withdraw";
  input: RecordActionInput;
  claimedAt: Date;
  record: LoadedRecord;
  error: ProviderWriteError;
}): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  const plainMessage = input.error.userMessage;
  await database.$transaction(async (tx) => {
    const update = await tx.availabilityRecord.updateMany({
      data: {
        approval_status: "xero_sync_failed",
        failed_action: input.failedAction,
        updated_by_user_id: input.input.actingUserId,
        xero_write_claimed_at: null,
        xero_write_error: plainMessage,
        xero_write_error_raw: {
          code: input.error.code,
          correlationId: input.error.correlationId ?? null,
          httpStatus: input.error.httpStatus ?? null,
          message: input.error.message,
          rawPayload: toJsonValue(input.error.rawPayload),
          timestamp: new Date().toISOString(),
        },
      },
      where: {
        ...scoped(input.input),
        approval_status: input.expectedStatus,
        derived_sequence: input.record.derived_sequence,
        id: input.record.id,
        xero_write_claimed_at: input.claimedAt,
      },
    });
    if (update.count !== 1) {
      throw new OptimisticConflictError();
    }

    await tx.auditEvent.create({
      data: auditData(input.input, input.auditAction, {
        errorCode: input.error.code,
      }),
    });
  });

  await notifySubmitFailureBestEffort(
    input.input,
    input.record,
    "leave_xero_sync_failed",
    { actionUrl: input.actionUrl }
  );

  const updated = await loadBareRecord(input.input);
  if (!updated) {
    return recordNotFound();
  }
  await materialiseSubmitPublication(input.input);
  return { ok: true, value: updated };
}

function loadScopedRecord(input: RecordActionInput) {
  return database.availabilityRecord.findFirst({
    include: {
      person: {
        select: {
          clerk_user_id: true,
          email: true,
          first_name: true,
          id: true,
          last_name: true,
          location_id: true,
          manager: {
            select: {
              clerk_user_id: true,
              id: true,
            },
          },
          manager_person_id: true,
        },
      },
    },
    where: {
      ...scoped(input),
      id: input.recordId,
    },
  });
}

function loadBareRecord(input: RecordActionInput) {
  return database.availabilityRecord.findFirst({
    where: {
      ...scoped(input),
      id: input.recordId,
    },
  });
}

async function materialiseSubmitPublication(
  input: RecordActionInput
): Promise<void> {
  const publication = await materialiseAvailabilityPublication({
    availabilityRecordId: input.recordId,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (!publication.ok) {
    // Best-effort: the submit/withdraw transition is already persisted. Log the
    // failed feed projection rather than failing the write; it is corrected on
    // the next successful materialisation for the record.
    log.error("Failed to materialise availability publication", {
      availabilityRecordId: input.recordId,
      clerkOrgId: input.clerkOrgId,
      error: publication.error.message,
      organisationId: input.organisationId,
    });
  }
}

async function loadAndAuthorise(
  input: RecordActionInput,
  mode: "manager_allowed" | "owner_only"
): Promise<Result<LoadedRecord, SubmitServiceError>> {
  const [record, actingPerson] = await Promise.all([
    loadScopedRecord(input),
    database.person.findFirst({
      select: { id: true },
      where: {
        ...scoped(input),
        archived_at: null,
        clerk_user_id: input.actingUserId,
      },
    }),
  ]);

  if (!record) {
    return recordNotFound();
  }

  const isOwner = record.person.clerk_user_id === input.actingUserId;
  const isManager =
    Boolean(actingPerson) &&
    record.person.manager_person_id === actingPerson?.id;
  const isAllowed =
    isAdminOrOwner(input.actingOrgRole) ||
    isOwner ||
    (mode === "manager_allowed" && isManager);

  if (!isAllowed) {
    return {
      error: {
        code: "not_authorised",
        message: "You do not have permission to manage this record.",
      },
      ok: false,
    };
  }

  return { ok: true, value: record };
}

async function notifyManager(
  tx: NotificationDispatchDatabase,
  input: RecordActionInput,
  record: LoadedRecord,
  type: "leave_submitted" | "leave_withdrawn",
  options: { actionUrl: string }
) {
  const recipientUserId = record.person.manager?.clerk_user_id;
  if (!recipientUserId) {
    return;
  }
  const result = await dispatchNotification(
    {
      actionUrl: options.actionUrl,
      actorUserId: input.actingUserId,
      body:
        type === "leave_submitted"
          ? `${record.person.first_name} ${record.person.last_name} submitted leave for approval.`
          : `${record.person.first_name} ${record.person.last_name} withdrew a submitted leave request.`,
      clerkOrgId: input.clerkOrgId,
      objectId: record.id,
      objectType: "availability_record",
      organisationId: input.organisationId,
      recipientPersonId: record.person.manager?.id ?? null,
      recipientUserId,
      title:
        type === "leave_submitted"
          ? "Leave submitted for approval"
          : "Leave withdrawn",
      type,
    },
    tx
  );
  if (!result.ok) {
    throw new NotificationCreateError();
  }
}

async function notifyManagerBestEffort(
  input: RecordActionInput,
  record: LoadedRecord,
  type: "leave_submitted" | "leave_withdrawn",
  options: { actionUrl: string }
): Promise<void> {
  try {
    await notifyManager(database, input, record, type, options);
  } catch (error) {
    log.error("Failed to dispatch manager notification", {
      availabilityRecordId: record.id,
      clerkOrgId: input.clerkOrgId,
      error: error instanceof Error ? error.message : "Unknown error",
      organisationId: input.organisationId,
      type,
    });
  }
}

async function notifySubmitFailureBestEffort(
  input: RecordActionInput,
  record: LoadedRecord,
  type: "leave_xero_sync_failed",
  options: { actionUrl: string }
): Promise<void> {
  try {
    await notifyOwnerAndManager(database, input, record, type, options);
  } catch (error) {
    log.error("Failed to dispatch failure notification", {
      availabilityRecordId: record.id,
      clerkOrgId: input.clerkOrgId,
      error: error instanceof Error ? error.message : "Unknown error",
      organisationId: input.organisationId,
      type,
    });
  }
}

async function notifyOwnerAndManager(
  tx: NotificationDispatchDatabase,
  input: RecordActionInput,
  record: LoadedRecord,
  type: "leave_xero_sync_failed",
  options: { actionUrl: string }
) {
  const recipients = [
    {
      personId: record.person.id,
      userId: record.person.clerk_user_id,
    },
    {
      personId: record.person.manager?.id ?? null,
      userId: record.person.manager?.clerk_user_id ?? null,
    },
  ].filter(
    (recipient): recipient is { personId: string | null; userId: string } =>
      Boolean(recipient.userId)
  );
  const seen = new Set<string>();

  for (const recipient of recipients) {
    if (seen.has(recipient.userId)) {
      continue;
    }
    seen.add(recipient.userId);
    const result = await dispatchNotification(
      {
        actionUrl: options.actionUrl,
        actorUserId: input.actingUserId,
        body: "Xero could not sync this leave action. Review the record and try again.",
        clerkOrgId: input.clerkOrgId,
        objectId: record.id,
        objectType: "availability_record",
        organisationId: input.organisationId,
        recipientPersonId: recipient.personId,
        recipientUserId: recipient.userId,
        title: "Xero sync failed",
        type,
      },
      tx
    );
    if (!result.ok) {
      throw new NotificationCreateError();
    }
  }
}

function auditData(
  input: RecordActionInput,
  action: string,
  payload: Record<string, string>
) {
  return {
    action,
    actor_user_id: input.actingUserId,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    payload: {
      actingUserId: input.actingUserId,
      ...payload,
    },
    resource_id: input.recordId,
    resource_type: "availability_record",
  };
}

function isAdminOrOwner(role?: string | null): boolean {
  return role === "org:admin" || role === "org:owner";
}

function resolutionBlocked(
  resolutionError: ProviderResolutionError
): Result<never, SubmitServiceError> {
  return {
    error: {
      code: "submission_blocked_resolution",
      message: resolutionError.message,
      resolutionError,
    },
    ok: false,
  };
}

function invalidState(
  code:
    | "invalid_state_for_retry"
    | "invalid_state_for_revert"
    | "invalid_state_for_submit"
    | "invalid_state_for_withdraw"
): Result<never, SubmitServiceError> {
  const messages = {
    invalid_state_for_retry: "Only failed submissions can be retried.",
    invalid_state_for_revert:
      "Only failed submissions can be reverted to draft.",
    invalid_state_for_submit: "Only draft leave records can be submitted.",
    invalid_state_for_withdraw:
      "Only submitted leave records can be withdrawn.",
  };
  return {
    error: {
      code,
      message: messages[code],
    },
    ok: false,
  };
}

function recordNotFound(): Result<never, SubmitServiceError> {
  return {
    error: {
      code: "record_not_found",
      message: "Availability record not found.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, SubmitServiceError> {
  return {
    error: {
      code: "unknown_error",
      message,
    },
    ok: false,
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
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
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = toJsonValue(item);
    }
    return output;
  }
  return String(value);
}

function toPrismaJsonValue(
  value: unknown
): Exclude<JsonValue, null> | typeof Prisma.JsonNull {
  const jsonValue = toJsonValue(value);
  return jsonValue === null ? Prisma.JsonNull : jsonValue;
}

class OptimisticConflictError extends Error {
  constructor() {
    super("Record changed before the state transition completed.");
  }
}

class NotificationCreateError extends Error {
  constructor() {
    super("Notification could not be created.");
  }
}
