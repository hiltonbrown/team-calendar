import "server-only";

import type {
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  Result,
} from "@repo/core";
import { database } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import type {
  availability_approval_status,
  availability_failed_action,
  availability_record_type,
} from "@repo/database/generated/enums";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import {
  dispatchNotification,
  type NotificationDispatchDatabase,
} from "@repo/notifications";
import { z } from "zod";
import { computeWorkingDays } from "../duration/working-days";
import { isXeroLeaveType } from "../records/record-type-categories";
import { managerScopePersonIds } from "../settings/manager-scope";
import { getSettings } from "../settings/organisation-settings-service";
import { dispatchSyncEvent } from "../sync/sync-events";
import { hasActiveXeroConnection } from "../xero-connection-state";

export type ApprovalRole = "admin" | "manager" | "owner";

export type ApprovalAction =
  | "approve"
  | "decline"
  | "request_more_info"
  | "retry_approval"
  | "retry_decline"
  | "revert_to_submitted"
  | "view_only";

export type ApprovalServiceError =
  | {
      code: "approval_blocked_resolution";
      message: string;
      resolutionError: ProviderResolutionError;
    }
  | { code: "cross_org_leak"; message: string }
  | { code: "dispatch_failed"; message: string }
  | { code: "invalid_state_for_approve"; message: string }
  | { code: "invalid_state_for_decline"; message: string }
  | { code: "invalid_state_for_info_request"; message: string }
  | { code: "invalid_state_for_revert"; message: string }
  | { code: "invalid_state_for_retry"; message: string }
  | { code: "missing_preserved_reason"; message: string }
  | { code: "not_a_leave_type"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "record_not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "xero_not_connected"; message: string }
  | {
      code: "xero_write_failed";
      message: string;
      xeroError: ProviderWriteError;
    };

export interface ApprovalListItem {
  allDay: boolean;
  approvalNote: string | null;
  approvalStatus: availability_approval_status;
  approvedAt: Date | null;
  availableActions: ApprovalAction[];
  balanceSnapshot: {
    balanceAvailable: number | null;
    balanceRemainingAfterApproval: number | null;
    leaveBalanceUpdatedAt: Date | null;
    unit: string | null;
  } | null;
  clerkOrgId: string;
  createdAt: Date;
  durationWorkingDays: number | null;
  endsAt: Date;
  failedAction: availability_failed_action | null;
  id: string;
  mutedActionNote: string | null;
  notesInternal?: string | null;
  organisationId: string;
  person: {
    email: string;
    firstName: string;
    id: string;
    lastName: string;
    locationId: string | null;
    managerPersonId: string | null;
    teamName: string | null;
    userId: string | null;
  };
  recordType: availability_record_type;
  sourceRemoteId: string | null;
  sourceType: string;
  startsAt: Date;
  submittedAt: Date | null;
  submittedByUserId: string | null;
  xeroWriteError: string | null;
}

export interface ApprovalDetail extends ApprovalListItem {
  notesInternal: string | null;
  submissionHistory: Array<{
    action: string;
    createdAt: Date;
    payload: unknown;
  }>;
}

export interface ApprovalSummaryCounts {
  approvedThisMonth: number;
  declinedThisMonth: number;
  failedSync: number;
  pending: number;
}

const ApprovalStatusSchema = z.enum([
  "submitted",
  "approved",
  "declined",
  "xero_sync_failed",
  "withdrawn",
]);
const RecordTypeSchema = z.enum([
  "annual_leave",
  "personal_leave",
  "holiday",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
]);
const RoleSchema = z.enum(["admin", "manager", "owner"]);

const FiltersSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  personId: z.array(z.string().uuid()).optional(),
  recordType: z.array(RecordTypeSchema).optional(),
  status: z.array(ApprovalStatusSchema).default(["submitted"]),
});

const ListSchema = z.object({
  actingPersonId: z.string().uuid().nullable(),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  filters: FiltersSchema.optional(),
  organisationId: z.string().uuid(),
  role: RoleSchema,
});

const DetailSchema = z.object({
  actingPersonId: z.string().uuid().nullable(),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
  role: RoleSchema,
});

const CommandSchema = DetailSchema;
const DeclineSchema = CommandSchema.extend({
  reason: z.string().trim().max(1000).optional().default(""),
});
const InfoSchema = CommandSchema.extend({
  question: z.string().trim().min(3).max(1000),
});
const DispatchSchema = z.object({
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  role: RoleSchema,
});

type ListInput = z.infer<typeof ListSchema>;
type CommandInput = z.infer<typeof CommandSchema>;
type DeclineInput = z.infer<typeof DeclineSchema>;
type InfoInput = z.infer<typeof InfoSchema>;
type DispatchInput = z.infer<typeof DispatchSchema>;
type LoadedApprovalRecord = NonNullable<Awaited<ReturnType<typeof loadRecord>>>;
type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const HISTORY_ACTIONS = [
  "availability_records.submitted",
  "availability_records.submission_retry_succeeded",
  "availability_records.submission_retry_failed",
  "availability_records.info_requested",
  "availability_records.reverted_to_draft",
];

export async function listForApprover(
  input: ListInput
): Promise<Result<ApprovalListItem[], ApprovalServiceError>> {
  const parsed = ListSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (parsed.data.role === "manager" && !parsed.data.actingPersonId) {
    return notAuthorised();
  }
  if (!canUseApprovals(parsed.data.role)) {
    return notAuthorised();
  }

  try {
    const settingsResult = await getSettings({
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });
    const filters = parsed.data.filters ?? {
      status:
        settingsResult.ok && !settingsResult.value.showDeclinedOnApprovals
          ? ["submitted", "approved", "xero_sync_failed", "withdrawn"]
          : ["submitted"],
    };
    const managedPersonIds =
      parsed.data.role === "manager" && parsed.data.actingPersonId
        ? (
            await managerScopePersonIds({
              actingPersonId: parsed.data.actingPersonId,
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: parsed.data.organisationId,
            })
          ).filter((personId) => personId !== parsed.data.actingPersonId)
        : [];
    const records = await database.availabilityRecord.findMany({
      where: {
        ...scoped(parsed.data),
        archived_at: null,
        source_type: { in: ["leavesync_leave", "xero_leave"] },
        approval_status: { in: filters.status },
        ...(filters.personId?.length
          ? { person_id: { in: filters.personId } }
          : {}),
        ...(filters.recordType?.length
          ? { record_type: { in: filters.recordType } }
          : {}),
        ...(filters.dateFrom ? { ends_at: { gte: filters.dateFrom } } : {}),
        ...(filters.dateTo ? { starts_at: { lte: filters.dateTo } } : {}),
        ...(parsed.data.role === "manager"
          ? { person_id: { in: managedPersonIds } }
          : {}),
      },
      include: recordInclude,
      orderBy: [{ submitted_at: "asc" }, { starts_at: "asc" }],
    });

    const items = await Promise.all(
      records.map((record) => toApprovalListItem(record))
    );
    return { ok: true, value: items };
  } catch {
    return unknownError("Failed to load leave approvals.");
  }
}

export async function getApprovalDetail(
  input: CommandInput
): Promise<Result<ApprovalDetail, ApprovalServiceError>> {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const authorised = await loadAndAuthorise(parsed.data);
    if (!authorised.ok) {
      return authorised;
    }
    const item = await toApprovalListItem(authorised.value);
    const history = await database.auditEvent.findMany({
      where: {
        ...scoped(parsed.data),
        action: { in: HISTORY_ACTIONS },
        resource_id: parsed.data.recordId,
        resource_type: "availability_record",
      },
      orderBy: { created_at: "asc" },
      select: {
        action: true,
        created_at: true,
        payload: true,
      },
    });

    return {
      ok: true,
      value: {
        ...item,
        notesInternal: authorised.value.notes_internal,
        submissionHistory: history.map((event) => ({
          action: event.action,
          createdAt: event.created_at,
          payload: event.payload,
        })),
      },
    };
  } catch {
    return unknownError("Failed to load this approval.");
  }
}

export async function getApprovalSummaryCounts(input: {
  actingPersonId: string | null;
  actingUserId: string;
  clerkOrgId: string;
  organisationId: string;
  role: ApprovalRole;
}): Promise<Result<ApprovalSummaryCounts, ApprovalServiceError>> {
  const parsed = ListSchema.omit({ filters: true }).safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (parsed.data.role === "manager" && !parsed.data.actingPersonId) {
    return notAuthorised();
  }

  try {
    const managedPersonIds =
      parsed.data.role === "manager" && parsed.data.actingPersonId
        ? (
            await managerScopePersonIds({
              actingPersonId: parsed.data.actingPersonId,
              clerkOrgId: parsed.data.clerkOrgId,
              organisationId: parsed.data.organisationId,
            })
          ).filter((personId) => personId !== parsed.data.actingPersonId)
        : [];
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const baseWhere = {
      ...scoped(parsed.data),
      archived_at: null,
      source_type: { in: ["leavesync_leave", "xero_leave"] },
      ...(parsed.data.role === "manager"
        ? { person_id: { in: managedPersonIds } }
        : {}),
    } satisfies Prisma.AvailabilityRecordWhereInput;

    const [pending, failedSync, approvedThisMonth, declinedThisMonth] =
      await Promise.all([
        database.availabilityRecord.count({
          where: { ...baseWhere, approval_status: "submitted" },
        }),
        database.availabilityRecord.count({
          where: { ...baseWhere, approval_status: "xero_sync_failed" },
        }),
        database.availabilityRecord.count({
          where: {
            ...baseWhere,
            approval_status: "approved",
            approved_at: { gte: startOfMonth },
          },
        }),
        database.availabilityRecord.count({
          where: {
            ...baseWhere,
            approval_status: "declined",
            approved_at: { gte: startOfMonth },
          },
        }),
      ]);

    return {
      ok: true,
      value: { approvedThisMonth, declinedThisMonth, failedSync, pending },
    };
  } catch {
    return unknownError("Failed to load approval summary.");
  }
}

export async function approve(
  input: CommandInput,
  externalWritePort: ExternalWritePort
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  return await performApproval(input, externalWritePort, {
    failureAuditAction: "availability_records.approval_failed",
    failureAction: "approve",
    successAuditAction: "availability_records.approved",
  });
}

export async function retryApproval(
  input: CommandInput,
  externalWritePort: ExternalWritePort
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  return await performApproval(input, externalWritePort, {
    failureAuditAction: "availability_records.approval_retry_failed",
    failureAction: "approve",
    retry: true,
    successAuditAction: "availability_records.approval_retry_succeeded",
  });
}

export async function decline(
  input: DeclineInput,
  externalWritePort: ExternalWritePort
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  const parsed = DeclineSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const settingsResult = await getSettings({
    clerkOrgId: parsed.data.clerkOrgId,
    organisationId: parsed.data.organisationId,
  });
  if (
    settingsResult.ok &&
    settingsResult.value.requireDeclineReason &&
    parsed.data.reason.trim().length < 3
  ) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Enter a decline reason of at least 3 characters.",
      },
    };
  }
  return await performDecline(parsed.data, externalWritePort, {
    failureAuditAction: "availability_records.decline_failed",
    reason: parsed.data.reason.trim(),
    successAuditAction: "availability_records.declined",
  });
}

export async function retryDecline(
  input: CommandInput,
  externalWritePort: ExternalWritePort
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const authorised = await loadAndAuthorise(parsed.data);
    if (!authorised.ok) {
      return authorised;
    }
    const reason = authorised.value.approval_note?.trim();
    if (
      authorised.value.approval_status !== "xero_sync_failed" ||
      authorised.value.failed_action !== "decline"
    ) {
      return invalidState("invalid_state_for_retry");
    }
    if (!reason) {
      return {
        ok: false,
        error: {
          code: "missing_preserved_reason",
          message:
            "The original decline reason could not be found. Enter a new reason to try again.",
        },
      };
    }

    return await performDecline({ ...parsed.data, reason }, externalWritePort, {
      failureAuditAction: "availability_records.decline_retry_failed",
      reason,
      retry: true,
      successAuditAction: "availability_records.decline_retry_succeeded",
    });
  } catch {
    return unknownError("Failed to retry this decline.");
  }
}

export async function requestMoreInfo(
  input: InfoInput
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  const parsed = InfoSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const authorised = await loadAndAuthorise(parsed.data);
    if (!authorised.ok) {
      return authorised;
    }
    const record = authorised.value;
    if (record.approval_status !== "submitted") {
      return invalidState("invalid_state_for_info_request");
    }

    await database.$transaction(async (tx) => {
      await notifyUser(tx, parsed.data, record, {
        actionUrl: `/plans?recordId=${record.id}`,
        payload: { body: parsed.data.question },
        recipientUserId: record.person.clerk_user_id,
        type: "leave_info_requested",
      });
      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.info_requested", {
          questionLength: parsed.data.question.length,
        }),
      });
    });

    return { ok: true, value: await toApprovalListItem(record) };
  } catch {
    return unknownError("Failed to request more information.");
  }
}

export async function revertApprovalAttempt(
  input: CommandInput
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const authorised = await loadAndAuthorise(parsed.data);
    if (!authorised.ok) {
      return authorised;
    }
    const record = authorised.value;
    if (
      record.approval_status !== "xero_sync_failed" ||
      !["approve", "decline"].includes(record.failed_action ?? "")
    ) {
      return invalidState("invalid_state_for_revert");
    }

    await database.$transaction(async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_note:
            record.failed_action === "decline" ? null : record.approval_note,
          approval_status: "submitted",
          failed_action: null,
          updated_by_user_id: parsed.data.actingUserId,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(parsed.data),
          approval_status: "xero_sync_failed",
          derived_sequence: record.derived_sequence,
          id: record.id,
        },
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.approval_reverted", {
          failedAction: record.failed_action,
        }),
      });
    });

    const updated = await loadRecord(parsed.data);
    if (!updated) {
      return recordNotFound();
    }
    const publication = await materialiseApprovalPublication(parsed.data);
    if (!publication.ok) {
      return publication;
    }
    return { ok: true, value: await toApprovalListItem(updated) };
  } catch (error) {
    if (error instanceof OptimisticConflictError) {
      return invalidState("invalid_state_for_revert");
    }
    return unknownError("Failed to revert this approval attempt.");
  }
}

export function dispatchApprovalReconciliation(
  input: DispatchInput
): Promise<Result<{ queued: boolean; reason?: string }, ApprovalServiceError>> {
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve(validationError(parsed.error));
  }
  if (!(parsed.data.role === "admin" || parsed.data.role === "owner")) {
    return Promise.resolve(notAuthorised());
  }

  return dispatchApprovalReconciliationInternal(parsed.data);
}

async function dispatchApprovalReconciliationInternal(
  input: DispatchInput
): Promise<Result<{ queued: boolean; reason?: string }, ApprovalServiceError>> {
  const tenant = await database.xeroTenant.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    },
    orderBy: { created_at: "asc" },
  });
  if (!tenant) {
    return xeroNotConnected();
  }

  const active = await hasActiveXeroConnection({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (!active) {
    return xeroNotConnected();
  }

  const dispatched = await dispatchSyncEvent({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    runType: "approval_state_reconciliation",
    triggerType: "manual",
    triggeredByUserId: input.actingUserId,
    xeroTenantId: tenant.id,
  });
  if (!dispatched.ok) {
    return {
      ok: false,
      error: {
        code: "dispatch_failed",
        message: dispatched.error.message,
      },
    };
  }

  return { ok: true, value: { queued: true } };
}

async function performApproval(
  input: CommandInput,
  externalWritePort: ExternalWritePort,
  options: {
    failureAction: "approve";
    failureAuditAction: string;
    retry?: boolean;
    successAuditAction: string;
  }
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const prepared = await prepareApprovalWrite(
      parsed.data,
      externalWritePort,
      {
        expectedFailedAction: options.retry ? "approve" : null,
        expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
        invalidStateCode: options.retry
          ? "invalid_state_for_retry"
          : "invalid_state_for_approve",
      }
    );
    if (!prepared.ok) {
      return prepared;
    }
    const { record, xeroEmployeeId } = prepared.value;
    const xeroLeaveApplicationId = record.source_remote_id;
    if (!xeroLeaveApplicationId) {
      return resolutionBlocked({
        code: "missing_mapping",
        message: "This record does not have a Xero leave application ID.",
      });
    }

    const response = await externalWritePort.approveLeaveApplication({
      employeeId: xeroEmployeeId,
      remoteId: xeroLeaveApplicationId,
      clerkOrgId: parsed.data.clerkOrgId,
      organisationId: parsed.data.organisationId,
    });
    if (!response.ok) {
      return await persistApprovalFailure({
        auditAction: options.failureAuditAction,
        failedAction: "approve",
        input: parsed.data,
        record,
        error: response.error,
      });
    }

    const now = new Date();
    await database.$transaction(async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "approved",
          approved_at: now,
          approved_by_person_id: parsed.data.actingPersonId,
          derived_sequence: { increment: 1 },
          failed_action: null,
          updated_by_user_id: parsed.data.actingUserId,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: transitionWhere(parsed.data, record),
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }
      await notifyUser(tx, parsed.data, record, {
        actionUrl: `/plans?recordId=${record.id}`,
        recipientUserId: record.person.clerk_user_id,
        type: "leave_approved",
      });
      await notifyManagersIfEnabled(tx, parsed.data, record, {
        actionUrl: `/leave-approvals?recordId=${record.id}`,
        type: "leave_approved",
      });
      await tx.auditEvent.create({
        data: auditData(parsed.data, options.successAuditAction, {
          xeroLeaveApplicationId,
        }),
      });
    });

    const updated = await loadRecord(parsed.data);
    if (!updated) {
      return recordNotFound();
    }
    const publication = await materialiseApprovalPublication(parsed.data);
    if (!publication.ok) {
      return publication;
    }
    return { ok: true, value: await toApprovalListItem(updated) };
  } catch (error) {
    if (error instanceof OptimisticConflictError) {
      return invalidState(
        options.retry ? "invalid_state_for_retry" : "invalid_state_for_approve"
      );
    }
    return unknownError("Failed to approve this leave.");
  }
}

async function performDecline(
  input: DeclineInput,
  externalWritePort: ExternalWritePort,
  options: {
    failureAuditAction: string;
    reason: string;
    retry?: boolean;
    successAuditAction: string;
  }
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  try {
    const prepared = await prepareApprovalWrite(input, externalWritePort, {
      expectedFailedAction: options.retry ? "decline" : null,
      expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
      invalidStateCode: options.retry
        ? "invalid_state_for_retry"
        : "invalid_state_for_decline",
    });
    if (!prepared.ok) {
      return prepared;
    }
    const { record, xeroEmployeeId } = prepared.value;
    const xeroLeaveApplicationId = record.source_remote_id;
    if (!xeroLeaveApplicationId) {
      return resolutionBlocked({
        code: "missing_mapping",
        message: "This record does not have a Xero leave application ID.",
      });
    }

    const response = await externalWritePort.declineLeaveApplication({
      reason: options.reason,
      employeeId: xeroEmployeeId,
      remoteId: xeroLeaveApplicationId,
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    });
    if (!response.ok) {
      return await persistApprovalFailure({
        approvalNote: options.reason,
        auditAction: options.failureAuditAction,
        failedAction: "decline",
        input,
        record,
        error: response.error,
      });
    }

    const now = new Date();
    await database.$transaction(async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_note: options.reason,
          approval_status: "declined",
          approved_at: now,
          approved_by_person_id: input.actingPersonId,
          derived_sequence: { increment: 1 },
          failed_action: null,
          updated_by_user_id: input.actingUserId,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: transitionWhere(input, record),
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }
      await notifyUser(tx, input, record, {
        actionUrl: `/plans?recordId=${record.id}`,
        payload: { body: options.reason },
        recipientUserId: record.person.clerk_user_id,
        type: "leave_declined",
      });
      await notifyManagersIfEnabled(tx, input, record, {
        actionUrl: `/leave-approvals?recordId=${record.id}`,
        type: "leave_declined",
      });
      await tx.auditEvent.create({
        data: auditData(input, options.successAuditAction, {
          reasonLength: options.reason.length,
          xeroLeaveApplicationId,
        }),
      });
    });

    const updated = await loadRecord(input);
    if (!updated) {
      return recordNotFound();
    }
    const publication = await materialiseApprovalPublication(input);
    if (!publication.ok) {
      return publication;
    }
    return { ok: true, value: await toApprovalListItem(updated) };
  } catch (error) {
    if (error instanceof OptimisticConflictError) {
      return invalidState(
        options.retry ? "invalid_state_for_retry" : "invalid_state_for_decline"
      );
    }
    return unknownError("Failed to decline this leave.");
  }
}

async function prepareApprovalWrite(
  input: CommandInput,
  externalWritePort: ExternalWritePort,
  options: {
    expectedFailedAction: availability_failed_action | null;
    expectedStatus: availability_approval_status;
    invalidStateCode:
      | "invalid_state_for_approve"
      | "invalid_state_for_decline"
      | "invalid_state_for_retry";
  }
): Promise<
  Result<
    {
      record: LoadedApprovalRecord;
      xeroEmployeeId: string;
    },
    ApprovalServiceError
  >
> {
  const authorised = await loadAndAuthorise(input);
  if (!authorised.ok) {
    return authorised;
  }
  const record = authorised.value;
  if (
    record.approval_status !== options.expectedStatus ||
    (options.expectedFailedAction &&
      record.failed_action !== options.expectedFailedAction)
  ) {
    return invalidState(options.invalidStateCode);
  }
  if (!isXeroLeaveType(record.record_type)) {
    return {
      ok: false,
      error: {
        code: "not_a_leave_type",
        message: "Only Xero leave records can be approved or declined.",
      },
    };
  }

  const hasXero = await hasActiveXeroConnection(input);
  if (!hasXero) {
    return xeroNotConnected();
  }
  const employee = await externalWritePort.resolveEmployeeId({
    personId: record.person_id,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (!employee.ok) {
    return resolutionBlocked(employee.error);
  }

  return {
    ok: true,
    value: { record, xeroEmployeeId: employee.value },
  };
}

async function persistApprovalFailure(input: {
  approvalNote?: string;
  auditAction: string;
  failedAction: "approve" | "decline";
  input: CommandInput;
  record: LoadedApprovalRecord;
  error: ProviderWriteError;
}): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  const plainMessage = input.error.userMessage;
  await database.$transaction(async (tx) => {
    const update = await tx.availabilityRecord.updateMany({
      data: {
        approval_note: input.approvalNote ?? input.record.approval_note,
        approval_status: "xero_sync_failed",
        failed_action: input.failedAction,
        updated_by_user_id: input.input.actingUserId,
        xero_write_error: plainMessage,
        xero_write_error_raw: {
          attemptedAction: input.failedAction,
          code: input.error.code,
          correlationId: input.error.correlationId ?? null,
          httpStatus: input.error.httpStatus ?? null,
          message: input.error.message,
          rawPayload: toJsonValue(input.error.rawPayload),
          timestamp: new Date().toISOString(),
        },
      },
      where: transitionWhere(input.input, input.record),
    });
    if (update.count !== 1) {
      throw new OptimisticConflictError();
    }

    await notifyOwnerAndApprover(tx, input.input, input.record, {
      actionUrl: `/leave-approvals?recordId=${input.record.id}`,
    });
    await tx.auditEvent.create({
      data: auditData(input.input, input.auditAction, {
        errorCode: input.error.code,
      }),
    });
  });

  const updated = await loadRecord(input.input);
  if (!updated) {
    return recordNotFound();
  }
  const publication = await materialiseApprovalPublication(input.input);
  if (!publication.ok) {
    return publication;
  }
  return { ok: true, value: await toApprovalListItem(updated) };
}

function loadRecord(input: {
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}) {
  return database.availabilityRecord.findFirst({
    where: {
      ...scoped(input),
      id: input.recordId,
    },
    include: recordInclude,
  });
}

async function materialiseApprovalPublication(input: {
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}): Promise<Result<void, ApprovalServiceError>> {
  const publication = await materialiseAvailabilityPublication({
    availabilityRecordId: input.recordId,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (!publication.ok) {
    return unknownError("Failed to materialise this publication.");
  }
  return { ok: true, value: undefined };
}

// removed loadXeroTenant

async function loadAndAuthorise(
  input: CommandInput
): Promise<Result<LoadedApprovalRecord, ApprovalServiceError>> {
  const record = await loadRecord(input);
  if (!record) {
    return recordNotFound();
  }
  const canAct = await canActOnRecord(input, record);
  if (!canAct) {
    return notAuthorised();
  }
  return { ok: true, value: record };
}

async function toApprovalListItem(
  record: LoadedApprovalRecord
): Promise<ApprovalListItem> {
  const duration = await computeDuration(record);
  const balanceSnapshot = await loadBalanceSnapshot(record, duration);
  const availableActions = actionsForRecord(record);
  return {
    allDay: record.all_day,
    approvalNote: record.approval_note,
    approvalStatus: record.approval_status,
    approvedAt: record.approved_at,
    availableActions,
    balanceSnapshot,
    clerkOrgId: record.clerk_org_id,
    createdAt: record.created_at,
    durationWorkingDays: duration,
    endsAt: record.ends_at,
    failedAction: record.failed_action,
    id: record.id,
    mutedActionNote: mutedNoteForRecord(record),
    notesInternal: record.notes_internal,
    organisationId: record.organisation_id,
    person: {
      email: record.person.email,
      firstName: record.person.first_name,
      id: record.person.id,
      lastName: record.person.last_name,
      locationId: record.person.location_id,
      managerPersonId: record.person.manager_person_id,
      teamName: record.person.team?.name ?? null,
      userId: record.person.clerk_user_id,
    },
    recordType: record.record_type,
    sourceRemoteId: record.source_remote_id,
    sourceType: record.source_type,
    startsAt: record.starts_at,
    submittedAt: record.submitted_at,
    submittedByUserId: record.created_by_user_id,
    xeroWriteError: record.xero_write_error,
  };
}

async function computeDuration(
  record: LoadedApprovalRecord
): Promise<number | null> {
  const duration = await computeWorkingDays({
    allDay: record.all_day,
    clerkOrgId: record.clerk_org_id,
    endsAt: record.ends_at,
    locationId: record.person.location_id,
    organisationId: record.organisation_id,
    startsAt: record.starts_at,
  });
  return duration.ok ? duration.value : null;
}

async function loadBalanceSnapshot(
  record: LoadedApprovalRecord,
  duration: number | null
): Promise<ApprovalListItem["balanceSnapshot"]> {
  if (!isXeroLeaveType(record.record_type)) {
    return null;
  }
  const balance = await database.leaveBalance.findFirst({
    where: {
      ...scoped({
        clerkOrgId: record.clerk_org_id,
        organisationId: record.organisation_id,
      }),
      person_id: record.person_id,
      record_type: record.record_type,
    },
    orderBy: { updated_at: "desc" },
    select: {
      balance: true,
      balance_unit: true,
      updated_at: true,
    },
  });
  if (!balance) {
    return {
      balanceAvailable: null,
      balanceRemainingAfterApproval: null,
      leaveBalanceUpdatedAt: null,
      unit: null,
    };
  }
  const balanceAvailable = Number(balance.balance);
  return {
    balanceAvailable,
    balanceRemainingAfterApproval:
      duration === null ? null : balanceAvailable - duration,
    leaveBalanceUpdatedAt: balance.updated_at,
    unit: balance.balance_unit,
  };
}

function actionsForRecord(record: LoadedApprovalRecord): ApprovalAction[] {
  switch (record.approval_status) {
    case "submitted":
      return ["approve", "decline", "request_more_info"];
    case "xero_sync_failed":
      if (record.failed_action === "approve") {
        return ["retry_approval", "revert_to_submitted"];
      }
      if (record.failed_action === "decline") {
        return ["retry_decline", "revert_to_submitted"];
      }
      return [];
    case "approved":
    case "declined":
    case "withdrawn":
      return ["view_only"];
    default:
      return [];
  }
}

function mutedNoteForRecord(record: LoadedApprovalRecord): string | null {
  if (
    record.approval_status === "xero_sync_failed" &&
    (record.failed_action === "submit" || record.failed_action === "withdraw")
  ) {
    return "This record is waiting for the owner to retry submission.";
  }
  return null;
}

async function canActOnRecord(
  input: CommandInput,
  record: LoadedApprovalRecord
): Promise<boolean> {
  if (input.role === "admin" || input.role === "owner") {
    return true;
  }
  if (!(input.role === "manager" && input.actingPersonId)) {
    return false;
  }

  const visiblePersonIds = await managerScopePersonIds({
    actingPersonId: input.actingPersonId,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });

  return visiblePersonIds.includes(record.person_id);
}

function canUseApprovals(role: ApprovalRole): boolean {
  return role === "admin" || role === "owner" || role === "manager";
}

async function notifyUser(
  tx: NotificationDispatchDatabase,
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: {
    actionUrl: string;
    payload?: Record<string, string | number | boolean | null>;
    recipientPersonId?: string | null;
    recipientUserId: string | null;
    type:
      | "leave_approved"
      | "leave_declined"
      | "leave_info_requested"
      | "leave_xero_sync_failed";
  }
) {
  if (!options.recipientUserId) {
    return;
  }
  const result = await dispatchNotification(
    {
      actionUrl: options.actionUrl,
      actorUserId: input.actingUserId,
      body: notificationBody(record, options.type, options.payload?.body),
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
      objectId: record.id,
      objectType: "availability_record",
      recipientPersonId: options.recipientPersonId ?? record.person.id,
      recipientUserId: options.recipientUserId,
      title: notificationTitle(options.type),
      type: options.type,
    },
    tx
  );
  if (!result.ok) {
    throw new NotificationCreateError();
  }
}

async function notifyManagersIfEnabled(
  tx: NotificationDispatchDatabase,
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: {
    actionUrl: string;
    type: "leave_approved" | "leave_declined";
  }
) {
  const settingsResult = await getSettings({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (
    !(settingsResult.ok && settingsResult.value.notifyManagersOnStatusChange)
  ) {
    return;
  }

  const managerUserId = record.person.manager?.clerk_user_id;
  const managerPersonId = record.person.manager?.id ?? null;
  if (!managerUserId || managerUserId === input.actingUserId) {
    return;
  }
  if (managerUserId === record.person.clerk_user_id) {
    return;
  }

  const personName = `${record.person.first_name} ${record.person.last_name}`;
  await notifyUser(tx, input, record, {
    actionUrl: options.actionUrl,
    payload: {
      body:
        options.type === "leave_approved"
          ? `${personName}'s leave request has been approved.`
          : `${personName}'s leave request has been declined.`,
    },
    recipientPersonId: managerPersonId,
    recipientUserId: managerUserId,
    type: options.type,
  });
}

async function notifyOwnerAndApprover(
  tx: NotificationDispatchDatabase,
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: { actionUrl: string }
) {
  const recipientUserIds = [
    { personId: record.person.id, userId: record.person.clerk_user_id },
    { personId: input.actingPersonId, userId: input.actingUserId },
  ].filter(
    (recipient): recipient is { personId: string | null; userId: string } =>
      Boolean(recipient.userId)
  );
  const seen = new Set<string>();
  for (const recipient of recipientUserIds) {
    if (seen.has(recipient.userId)) {
      continue;
    }
    seen.add(recipient.userId);
    await notifyUser(tx, input, record, {
      actionUrl: options.actionUrl,
      recipientPersonId: recipient.personId,
      recipientUserId: recipient.userId,
      type: "leave_xero_sync_failed",
    });
  }
}

function notificationTitle(
  type:
    | "leave_approved"
    | "leave_declined"
    | "leave_info_requested"
    | "leave_xero_sync_failed"
): string {
  switch (type) {
    case "leave_approved":
      return "Leave approved";
    case "leave_declined":
      return "Leave declined";
    case "leave_info_requested":
      return "More information requested";
    case "leave_xero_sync_failed":
      return "Xero sync failed";
    default:
      return "Leave updated";
  }
}

function notificationBody(
  record: LoadedApprovalRecord,
  type:
    | "leave_approved"
    | "leave_declined"
    | "leave_info_requested"
    | "leave_xero_sync_failed",
  detail?: string | number | boolean | null
): string {
  const personName = `${record.person.first_name} ${record.person.last_name}`;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }
  switch (type) {
    case "leave_approved":
      return `Your leave request for ${personName} has been approved.`;
    case "leave_declined":
      return `Your leave request for ${personName} has been declined.`;
    case "leave_info_requested":
      return "A manager requested more information about this leave request.";
    case "leave_xero_sync_failed":
      return "Xero could not sync this leave action. Review the record and try again.";
    default:
      return "This leave request has been updated.";
  }
}

function auditData(
  input: CommandInput,
  action: string,
  payload: Record<string, JsonValue>
) {
  return {
    action,
    actor_user_id: input.actingUserId,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    payload: {
      actingPersonId: input.actingPersonId,
      role: input.role,
      ...payload,
    },
    resource_id: input.recordId,
    resource_type: "availability_record",
  };
}

function transitionWhere(input: CommandInput, record: LoadedApprovalRecord) {
  return {
    ...scoped(input),
    approval_status: record.approval_status,
    derived_sequence: record.derived_sequence,
    id: record.id,
  };
}

function scoped(input: { clerkOrgId: string; organisationId: string }) {
  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
}

function validationError(
  error: z.ZodError
): Result<never, ApprovalServiceError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid approval request.",
    },
  };
}

function invalidState(
  code:
    | "invalid_state_for_approve"
    | "invalid_state_for_decline"
    | "invalid_state_for_info_request"
    | "invalid_state_for_revert"
    | "invalid_state_for_retry"
): Result<never, ApprovalServiceError> {
  const messages = {
    invalid_state_for_approve: "Only submitted leave can be approved.",
    invalid_state_for_decline: "Only submitted leave can be declined.",
    invalid_state_for_info_request:
      "More information can only be requested for submitted leave.",
    invalid_state_for_revert:
      "Only failed approval attempts can be reverted to pending.",
    invalid_state_for_retry: "Only failed approval actions can be retried.",
  };
  return { ok: false, error: { code, message: messages[code] } };
}

function recordNotFound(): Result<never, ApprovalServiceError> {
  return {
    ok: false,
    error: {
      code: "record_not_found",
      message: "Availability record not found.",
    },
  };
}

function notAuthorised(): Result<never, ApprovalServiceError> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage this approval.",
    },
  };
}

function xeroNotConnected(): Result<never, ApprovalServiceError> {
  return {
    ok: false,
    error: {
      code: "xero_not_connected",
      message:
        "Xero is not connected for this organisation. Connect Xero before approving or declining leave.",
    },
  };
}

function resolutionBlocked(
  resolutionError: ProviderResolutionError
): Result<never, ApprovalServiceError> {
  return {
    ok: false,
    error: {
      code: "approval_blocked_resolution",
      message: resolutionError.message,
      resolutionError,
    },
  };
}

function unknownError(message: string): Result<never, ApprovalServiceError> {
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
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = toJsonValue(item);
    }
    return output;
  }
  return String(value);
}

const recordInclude = {
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
      team: {
        select: {
          name: true,
        },
      },
    },
  },
} as const;

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
