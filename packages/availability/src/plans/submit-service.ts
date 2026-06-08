import "server-only";

import type {
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  Result,
} from "@repo/core";
import { database } from "@repo/database";
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

export type SubmitServiceError =
  | { code: "cross_org_leak"; message: string }
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

  try {
    const authorised = await loadAndAuthorise(parsed.data, "owner_only");
    if (!authorised.ok) {
      return authorised;
    }
    const record = authorised.value;

    if (
      record.approval_status !== "submitted" ||
      !record.source_remote_id ||
      record.source_type !== "leavesync_leave"
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

    const xeroLeaveApplicationId = record.source_remote_id;
    const response = await externalWritePort.withdrawLeaveApplication({
      employeeId: prepared.value.xeroEmployeeId,
      remoteId: xeroLeaveApplicationId,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });

    if (!response.ok) {
      return await persistXeroFailure({
        actionUrl: `/plans?recordId=${record.id}`,
        auditAction: "availability_records.withdrawal_failed",
        expectedStatus: "submitted",
        input: parsed.data,
        record,
        error: response.error,
        failedAction: "withdraw",
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
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(parsed.data),
          approval_status: "submitted",
          derived_sequence: record.derived_sequence,
          id: record.id,
        },
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }

      await notifyManager(tx, parsed.data, record, "leave_withdrawn", {
        actionUrl: `/leave-approvals?recordId=${record.id}`,
      });
      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.withdrawn", {
          xeroLeaveApplicationId,
        }),
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
      return invalidState("invalid_state_for_withdraw");
    }
    return unknownError("Failed to withdraw this submission.");
  }
}

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

  try {
    const authorised = await loadAndAuthorise(parsed.data, "manager_allowed");
    if (!authorised.ok) {
      return authorised;
    }
    const record = authorised.value;

    if (
      record.source_type !== "leavesync_leave" ||
      record.approval_status !== options.validStatus ||
      (options.validStatus === "xero_sync_failed" &&
        record.failed_action !== "submit")
    ) {
      return invalidState(options.invalidStateCode);
    }
    if (!isXeroLeaveType(record.record_type)) {
      return {
        ok: false,
        error: {
          code: "not_a_leave_type",
          message: "Only Xero leave types can be submitted to Xero.",
        },
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

    const submission = await externalWritePort.submitLeaveApplication({
      endsAt: record.ends_at,
      startsAt: record.starts_at,
      title: record.title ?? undefined,
      units: prepared.value.units,
      employeeId: prepared.value.xeroEmployeeId,
      leaveTypeId: prepared.value.xeroLeaveTypeId,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });

    if (!submission.ok) {
      return await persistXeroFailure({
        actionUrl: `/plans?recordId=${record.id}`,
        auditAction: options.failureAuditAction,
        expectedStatus: options.validStatus,
        input: parsed.data,
        record,
        error: submission.error,
        failedAction: "submit",
      });
    }

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
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(parsed.data),
          approval_status: options.validStatus,
          derived_sequence: record.derived_sequence,
          id: record.id,
        },
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }

      await notifyManager(tx, parsed.data, record, "leave_submitted", {
        actionUrl: `/leave-approvals?recordId=${record.id}`,
      });
      await tx.auditEvent.create({
        data: auditData(parsed.data, options.successAuditAction, {
          xeroLeaveApplicationId: submission.value.remoteId,
        }),
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
      return invalidState(options.invalidStateCode);
    }
    return unknownError("Failed to submit this record.");
  }
}

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
      ok: false,
      error: {
        code: "xero_not_connected",
        message:
          "Xero is not connected. This record is already approved locally and will appear on the calendar. Ask an administrator to connect Xero to enable submission for approval.",
      },
    };
  }

  const employee = await externalWritePort.resolveEmployeeId({
    personId: record.person_id,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (!employee.ok) {
    return resolutionBlocked(employee.error);
  }

  const leaveType = await externalWritePort.resolveLeaveTypeId({
    personId: record.person_id,
    recordType: record.record_type,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
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
      },
    });
    if (update.count !== 1) {
      throw new OptimisticConflictError();
    }

    await notifyOwnerAndManager(
      tx,
      input.input,
      input.record,
      "leave_xero_sync_failed",
      { actionUrl: input.actionUrl }
    );
    await tx.auditEvent.create({
      data: auditData(input.input, input.auditAction, {
        errorCode: input.error.code,
      }),
    });
  });

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

// removed loadXeroTenant

async function loadAndAuthorise(
  input: RecordActionInput,
  mode: "manager_allowed" | "owner_only"
): Promise<Result<LoadedRecord, SubmitServiceError>> {
  const [record, actingPerson] = await Promise.all([
    loadScopedRecord(input),
    database.person.findFirst({
      where: {
        ...scoped(input),
        archived_at: null,
        clerk_user_id: input.actingUserId,
      },
      select: { id: true },
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
      ok: false,
      error: {
        code: "not_authorised",
        message: "You do not have permission to manage this record.",
      },
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
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
      objectId: record.id,
      objectType: "availability_record",
      body:
        type === "leave_submitted"
          ? `${record.person.first_name} ${record.person.last_name} submitted leave for approval.`
          : `${record.person.first_name} ${record.person.last_name} withdrew a submitted leave request.`,
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
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
        objectId: record.id,
        objectType: "availability_record",
        body: "Xero could not sync this leave action. Review the record and try again.",
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

function scoped(input: { clerkOrgId: string; organisationId: string }) {
  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
}

function isAdminOrOwner(role?: string | null): boolean {
  return role === "org:admin" || role === "org:owner";
}

function resolutionBlocked(
  resolutionError: ProviderResolutionError
): Result<never, SubmitServiceError> {
  return {
    ok: false,
    error: {
      code: "submission_blocked_resolution",
      message: resolutionError.message,
      resolutionError,
    },
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
    ok: false,
    error: {
      code,
      message: messages[code],
    },
  };
}

function recordNotFound(): Result<never, SubmitServiceError> {
  return {
    ok: false,
    error: {
      code: "record_not_found",
      message: "Availability record not found.",
    },
  };
}

function unknownError(message: string): Result<never, SubmitServiceError> {
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message,
    },
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
