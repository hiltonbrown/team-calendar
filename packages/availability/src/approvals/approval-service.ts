import "server-only";

import type {
  ClerkOrgId,
  ExternalWritePort,
  OrganisationId,
  ProviderResolutionError,
  ProviderWriteError,
  Result,
} from "@repo/core";
import { database, scopedTo as scoped } from "@repo/database";
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
import { log } from "@repo/observability/log";
import { z } from "zod";
import { createAggregationCache } from "../analytics/request-cache";
import {
  computeWorkingDays,
  computeWorkingDaysFromReferenceData,
  type WorkingDaysReferenceData,
  workingDayYearsForInput,
} from "../duration/working-days";
import { listForOrganisation } from "../holidays/holiday-service";
import { isXeroLeaveType } from "../records/record-type-categories";
import { managerScopePersonIds } from "../settings/manager-scope";
import { getSettings } from "../settings/organisation-settings-service";
import { dispatchSyncEvent } from "../sync/sync-events";
import { hasActiveXeroConnection } from "../xero-connection-state";
import {
  acquireXeroWriteClaim,
  noUnresolvedSubmitOperationWhere,
  releaseXeroWriteClaim,
  unclaimedOrExpiredXeroWriteWhere,
} from "../xero-write-claim";

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
    currencyCode: string | null;
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
type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

const FiltersSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  personId: z.array(z.string().uuid()).optional(),
  recordType: z.array(RecordTypeSchema).optional(),
  status: z.array(ApprovalStatusSchema).optional(),
});

const ListSchema = z.object({
  actingPersonId: z.string().uuid().nullable(),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  cursor: z.string().uuid().nullable().optional(),
  filters: FiltersSchema.optional(),
  organisationId: z.string().uuid(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
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
const DeclineReasonSchema = z
  .string()
  .trim()
  .min(3, "Enter a decline reason of at least 3 characters.")
  .max(1000, "Enter a decline reason of no more than 1,000 characters.");
const DeclineSchema = CommandSchema.extend({
  reason: DeclineReasonSchema,
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

type ListInput = z.input<typeof ListSchema>;
type ListData = z.infer<typeof ListSchema>;
type CommandInput = z.infer<typeof CommandSchema>;
type DeclineInput = z.infer<typeof DeclineSchema>;
type InfoInput = z.infer<typeof InfoSchema>;
type DispatchInput = z.infer<typeof DispatchSchema>;
type LoadedApprovalRecord = NonNullable<Awaited<ReturnType<typeof loadRecord>>>;
interface BalanceSnapshotRow {
  balance: unknown;
  balance_unit: string | null;
  currency_code: string | null;
  updated_at: Date;
}
interface ApprovalListContext {
  balanceByPersonAndRecordType: Map<string, BalanceSnapshotRow>;
  workingDaysReferenceData: WorkingDaysReferenceData;
}
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

const TERMINAL_STATUS_WINDOW_DAYS = 90;
const ACTIONABLE_STATUSES = ["submitted", "xero_sync_failed"] as const;
const TERMINAL_STATUSES = ["approved", "withdrawn", "declined"] as const;

export async function listForApprover(
  input: ListInput
): Promise<
  Result<
    { items: ApprovalListItem[]; nextCursor: string | null },
    ApprovalServiceError
  >
> {
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
    return await loadApproverPage(parsed.data);
  } catch (error) {
    return logAndReturnUnknown(
      error,
      {
        clerkOrgId: parsed.data.clerkOrgId,
        operation: "list_for_approver",
        organisationId: parsed.data.organisationId,
      },
      "Failed to load leave approvals."
    );
  }
}

async function loadApproverPage(
  data: ListData
): Promise<
  Result<
    { items: ApprovalListItem[]; nextCursor: string | null },
    ApprovalServiceError
  >
> {
  const filters = await resolveListFilters(data);
  const pageSize = data.pageSize ?? 50;
  const cursor = data.cursor ?? null;
  const hasExplicitDateFilter = Boolean(filters.dateFrom ?? filters.dateTo);
  const managedPersonIds = await resolveManagedPersonIds(data);
  const approvalStatusWhere = buildApprovalStatusWhere(
    filters.status,
    hasExplicitDateFilter
  );

  const records = await database.availabilityRecord.findMany({
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: [{ submitted_at: "asc" }, { starts_at: "asc" }, { id: "asc" }],
    select: approvalRecordSelect,
    skip: cursor ? 1 : 0,
    take: pageSize + 1,
    where: {
      ...scoped(data),
      ...approvalStatusWhere,
      archived_at: null,
      source_type: { in: ["team_calendar_leave", "xero_leave"] },
      ...(filters.personId?.length
        ? { person_id: { in: filters.personId } }
        : {}),
      ...(filters.recordType?.length
        ? { record_type: { in: filters.recordType } }
        : {}),
      ...(filters.dateFrom ? { ends_at: { gte: filters.dateFrom } } : {}),
      ...(filters.dateTo ? { starts_at: { lte: filters.dateTo } } : {}),
      ...(data.role === "manager"
        ? { person_id: { in: managedPersonIds } }
        : {}),
    },
  });

  const hasNext = records.length > pageSize;
  const pageRecords = hasNext ? records.slice(0, pageSize) : records;
  const nextCursor = hasNext ? (pageRecords.at(-1)?.id ?? null) : null;

  const listContext = await loadApprovalListContext(
    pageRecords as unknown as LoadedApprovalRecord[]
  );
  const items = await Promise.all(
    (pageRecords as unknown as LoadedApprovalRecord[]).map((record) =>
      toApprovalListItem(record, listContext)
    )
  );
  return { ok: true, value: { items, nextCursor } };
}

async function resolveListFilters(
  data: ListData
): Promise<z.infer<typeof FiltersSchema> & { status: ApprovalStatus[] }> {
  const settingsResult = await getSettings({
    clerkOrgId: data.clerkOrgId,
    organisationId: data.organisationId,
  });

  if (!settingsResult.ok) {
    log.warn(
      "Failed to load organisation settings for list approvals, using default view",
      {
        clerkOrgId: data.clerkOrgId,
        error: settingsResult.error,
        organisationId: data.organisationId,
      }
    );
  }

  // On a settings read failure, keep the narrower default rather than
  // silently widening the queue. Logged so the outage is not invisible.
  const showDeclined = settingsResult.ok
    ? settingsResult.value.showDeclinedOnApprovals
    : false;
  const defaultStatus: ApprovalStatus[] = showDeclined
    ? ["submitted", "approved", "xero_sync_failed", "withdrawn", "declined"]
    : ["submitted", "approved", "xero_sync_failed", "withdrawn"];

  return {
    ...data.filters,
    status: data.filters?.status ?? defaultStatus,
  };
}

async function resolveManagedPersonIds(data: {
  actingPersonId: string | null;
  clerkOrgId: string;
  organisationId: string;
  role: ApprovalRole;
}): Promise<string[]> {
  if (!(data.role === "manager" && data.actingPersonId)) {
    return [];
  }
  const personIds = await managerScopePersonIds({
    actingPersonId: data.actingPersonId,
    clerkOrgId: data.clerkOrgId,
    organisationId: data.organisationId,
  });
  return personIds.filter((personId) => personId !== data.actingPersonId);
}

function buildApprovalStatusWhere(
  status: ApprovalStatus[],
  hasExplicitDateFilter: boolean
): Prisma.AvailabilityRecordWhereInput {
  const actionableInFilter = status.filter((s) =>
    (ACTIONABLE_STATUSES as readonly string[]).includes(s)
  );
  const terminalInFilter = status.filter((s) =>
    (TERMINAL_STATUSES as readonly string[]).includes(s)
  );

  if (hasExplicitDateFilter || terminalInFilter.length === 0) {
    return { approval_status: { in: status as never[] } };
  }

  const terminalCutoff = new Date();
  terminalCutoff.setUTCDate(
    terminalCutoff.getUTCDate() - TERMINAL_STATUS_WINDOW_DAYS
  );

  if (actionableInFilter.length === 0) {
    return {
      approval_status: { in: terminalInFilter as never[] },
      ends_at: { gte: terminalCutoff },
    };
  }

  return {
    OR: [
      { approval_status: { in: actionableInFilter as never[] } },
      {
        approval_status: { in: terminalInFilter as never[] },
        ends_at: { gte: terminalCutoff },
      },
    ],
  };
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
      orderBy: { created_at: "asc" },
      select: {
        action: true,
        created_at: true,
        payload: true,
      },
      where: {
        ...scoped(parsed.data),
        action: { in: HISTORY_ACTIONS },
        resource_id: parsed.data.recordId,
        resource_type: "availability_record",
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
  } catch (error) {
    return logAndReturnUnknown(
      error,
      {
        clerkOrgId: parsed.data.clerkOrgId,
        operation: "get_approval_detail",
        organisationId: parsed.data.organisationId,
        recordId: parsed.data.recordId,
      },
      "Failed to load this approval."
    );
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
    const managedPersonIds = await resolveManagedPersonIds(parsed.data);
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const baseWhere = {
      ...scoped(parsed.data),
      archived_at: null,
      source_type: { in: ["team_calendar_leave", "xero_leave"] },
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
  } catch (error) {
    return logAndReturnUnknown(
      error,
      {
        clerkOrgId: parsed.data.clerkOrgId,
        operation: "get_approval_summary_counts",
        organisationId: parsed.data.organisationId,
      },
      "Failed to load approval summary."
    );
  }
}

export async function approve(
  input: CommandInput,
  externalWritePort: ExternalWritePort
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  return await performApproval(input, externalWritePort, {
    failureAction: "approve",
    failureAuditAction: "availability_records.approval_failed",
    successAuditAction: "availability_records.approved",
  });
}

export async function retryApproval(
  input: CommandInput,
  externalWritePort: ExternalWritePort
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  return await performApproval(input, externalWritePort, {
    failureAction: "approve",
    failureAuditAction: "availability_records.approval_retry_failed",
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
  return await performDecline(parsed.data, externalWritePort, {
    failureAuditAction: "availability_records.decline_failed",
    reason: parsed.data.reason,
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
    const reason = authorised.value.approval_note;
    if (
      authorised.value.approval_status !== "xero_sync_failed" ||
      authorised.value.failed_action !== "decline"
    ) {
      return invalidState("invalid_state_for_retry");
    }
    if (!reason?.trim()) {
      return {
        error: {
          code: "missing_preserved_reason",
          message:
            "The original decline reason could not be found. Enter a new reason to try again.",
        },
        ok: false,
      };
    }

    const parsedReason = DeclineReasonSchema.safeParse(reason);
    if (!parsedReason.success) {
      return validationError(parsedReason.error);
    }

    return await performDecline(
      { ...parsed.data, reason: parsedReason.data },
      externalWritePort,
      {
        failureAuditAction: "availability_records.decline_retry_failed",
        reason: parsedReason.data,
        retry: true,
        successAuditAction: "availability_records.decline_retry_succeeded",
      }
    );
  } catch (error) {
    return logAndReturnUnknown(
      error,
      {
        clerkOrgId: parsed.data.clerkOrgId,
        operation: "retry_decline_preflight",
        organisationId: parsed.data.organisationId,
        recordId: parsed.data.recordId,
      },
      "Failed to retry this decline."
    );
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
  } catch (error) {
    return logAndReturnUnknown(
      error,
      {
        clerkOrgId: parsed.data.clerkOrgId,
        operation: "request_more_info",
        organisationId: parsed.data.organisationId,
        recordId: parsed.data.recordId,
      },
      "Failed to request more information."
    );
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
          ...unclaimedOrExpiredXeroWriteWhere(),
          ...noUnresolvedSubmitOperationWhere(),
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
    await materialiseApprovalPublication(parsed.data);
    return { ok: true, value: await toApprovalListItem(updated) };
  } catch (error) {
    if (error instanceof OptimisticConflictError) {
      return invalidState("invalid_state_for_revert");
    }
    return logAndReturnUnknown(
      error,
      {
        clerkOrgId: parsed.data.clerkOrgId,
        operation: "revert_approval_attempt",
        organisationId: parsed.data.organisationId,
        recordId: parsed.data.recordId,
      },
      "Failed to revert this approval attempt."
    );
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

  return dispatchXeroSyncInternal(parsed.data, "approval_state_reconciliation");
}

export function dispatchXeroLeaveSync(
  input: z.input<typeof DispatchSchema>
): Promise<Result<{ queued: boolean; reason?: string }, ApprovalServiceError>> {
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve(validationError(parsed.error));
  }
  if (!(parsed.data.role === "admin" || parsed.data.role === "owner")) {
    return Promise.resolve(notAuthorised());
  }

  return dispatchXeroSyncInternal(parsed.data, "leave_records");
}

async function dispatchXeroSyncInternal(
  input: DispatchInput,
  runType: "approval_state_reconciliation" | "leave_records"
): Promise<Result<{ queued: boolean; reason?: string }, ApprovalServiceError>> {
  const tenant = await database.xeroTenant.findFirst({
    orderBy: { created_at: "asc" },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    },
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
    runType,
    triggeredByUserId: input.actingUserId,
    triggerType: "manual",
    xeroTenantId: tenant.id,
  });
  if (!dispatched.ok) {
    return {
      error: {
        code: "dispatch_failed",
        message: dispatched.error.message,
      },
      ok: false,
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

  let failureStage: ApprovalFailureStage = "prepare";
  let xeroWriteSucceeded = false;
  let claimedAt: Date | null = null;
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

    claimedAt = await acquireXeroWriteClaim({
      ...parsed.data,
      expectedFailedAction: options.retry ? "approve" : null,
      expectedSequence: record.derived_sequence,
      expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
    });
    if (!claimedAt) {
      return invalidState(
        options.retry ? "invalid_state_for_retry" : "invalid_state_for_approve"
      );
    }
    const ownerClaim = claimedAt;

    failureStage = "xero_write";
    const response = await externalWritePort.approveLeaveApplication({
      clerkOrgId: parsed.data.clerkOrgId,
      employeeId: xeroEmployeeId,
      organisationId: parsed.data.organisationId,
      remoteId: xeroLeaveApplicationId,
    });
    if (!response.ok) {
      failureStage = "local_transaction";
      return await persistApprovalFailure({
        auditAction: options.failureAuditAction,
        claimedAt: ownerClaim,
        error: response.error,
        failedAction: "approve",
        input: parsed.data,
        record,
      });
    }
    xeroWriteSucceeded = true;

    failureStage = "local_transaction";
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
          xero_write_claimed_at: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: transitionWhere(parsed.data, record, ownerClaim),
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(parsed.data, options.successAuditAction, {
          xeroLeaveApplicationId,
        }),
      });
    });
    claimedAt = null;

    failureStage = "notification";
    await notifyApprovalBestEffort(parsed.data, record, {
      actionUrl: `/plans?recordId=${record.id}`,
      type: "leave_approved",
    });

    failureStage = "reload";
    const updated = await loadRecord(parsed.data);
    if (!updated) {
      return recordNotFound();
    }
    failureStage = "publication";
    await materialiseApprovalPublication(parsed.data);
    failureStage = "projection";
    return { ok: true, value: await toApprovalListItem(updated) };
  } catch (error) {
    if (claimedAt) {
      await releaseXeroWriteClaim({ ...parsed.data, claimedAt });
    }
    return handleApprovalWriteFailure(
      error,
      {
        clerkOrgId: parsed.data.clerkOrgId,
        failureStage,
        operation: options.retry ? "retry_approve" : "approve",
        organisationId: parsed.data.organisationId,
        recordId: parsed.data.recordId,
        xeroWriteSucceeded,
      },
      options.retry ? "invalid_state_for_retry" : "invalid_state_for_approve",
      "Failed to approve this leave."
    );
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
  let failureStage: ApprovalFailureStage = "prepare";
  let xeroWriteSucceeded = false;
  let claimedAt: Date | null = null;
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

    claimedAt = await acquireXeroWriteClaim({
      ...input,
      expectedFailedAction: options.retry ? "decline" : null,
      expectedSequence: record.derived_sequence,
      expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
    });
    if (!claimedAt) {
      return invalidState(
        options.retry ? "invalid_state_for_retry" : "invalid_state_for_decline"
      );
    }
    const ownerClaim = claimedAt;

    failureStage = "xero_write";
    const response = await externalWritePort.declineLeaveApplication({
      clerkOrgId: input.clerkOrgId,
      employeeId: xeroEmployeeId,
      organisationId: input.organisationId,
      reason: options.reason,
      remoteId: xeroLeaveApplicationId,
    });
    if (!response.ok) {
      failureStage = "local_transaction";
      return await persistApprovalFailure({
        approvalNote: options.reason,
        auditAction: options.failureAuditAction,
        claimedAt: ownerClaim,
        error: response.error,
        failedAction: "decline",
        input,
        record,
      });
    }
    xeroWriteSucceeded = true;

    failureStage = "local_transaction";
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
          xero_write_claimed_at: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: transitionWhere(input, record, ownerClaim),
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(input, options.successAuditAction, {
          reasonLength: options.reason.length,
          xeroLeaveApplicationId,
        }),
      });
    });
    claimedAt = null;

    failureStage = "notification";
    await notifyApprovalBestEffort(input, record, {
      actionUrl: `/plans?recordId=${record.id}`,
      payload: { body: options.reason },
      type: "leave_declined",
    });

    failureStage = "reload";
    const updated = await loadRecord(input);
    if (!updated) {
      return recordNotFound();
    }
    failureStage = "publication";
    await materialiseApprovalPublication(input);
    failureStage = "projection";
    return { ok: true, value: await toApprovalListItem(updated) };
  } catch (error) {
    if (claimedAt) {
      await releaseXeroWriteClaim({ ...input, claimedAt });
    }
    return handleApprovalWriteFailure(
      error,
      {
        clerkOrgId: input.clerkOrgId,
        failureStage,
        operation: options.retry ? "retry_decline" : "decline",
        organisationId: input.organisationId,
        recordId: input.recordId,
        xeroWriteSucceeded,
      },
      options.retry ? "invalid_state_for_retry" : "invalid_state_for_decline",
      "Failed to decline this leave."
    );
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
      error: {
        code: "not_a_leave_type",
        message: "Only Xero leave records can be approved or declined.",
      },
      ok: false,
    };
  }

  const hasXero = await hasActiveXeroConnection(input);
  if (!hasXero) {
    return xeroNotConnected();
  }
  const employee = await externalWritePort.resolveEmployeeId({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    personId: record.person_id,
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
  claimedAt: Date;
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
        xero_write_claimed_at: null,
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
      where: transitionWhere(input.input, input.record, input.claimedAt),
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

  // Notifications are at-most-once and must never roll back the failure state.
  // Without the persisted xero_sync_failed status and failed_action, the retry
  // and revert actions are unreachable and the failure has no diagnostic trail.
  await notifyApprovalFailureBestEffort(input.input, input.record, {
    actionUrl: `/leave-approvals?recordId=${input.record.id}`,
  });

  const updated = await loadRecord(input.input);
  if (!updated) {
    return recordNotFound();
  }
  await materialiseApprovalPublication(input.input);
  return { ok: true, value: await toApprovalListItem(updated) };
}

function loadRecord(input: {
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}) {
  return database.availabilityRecord.findFirst({
    include: recordInclude,
    where: {
      ...scoped(input),
      id: input.recordId,
    },
  });
}

async function materialiseApprovalPublication(input: {
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}): Promise<void> {
  const publication = await materialiseAvailabilityPublication({
    availabilityRecordId: input.recordId,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (!publication.ok) {
    // Best-effort: the approval transition is already persisted. Log the failed
    // feed projection rather than failing the write; it is corrected on the next
    // successful materialisation for the record.
    log.error("Failed to materialise availability publication", {
      availabilityRecordId: input.recordId,
      clerkOrgId: input.clerkOrgId,
      error: publication.error.message,
      organisationId: input.organisationId,
    });
  }
}

async function loadApprovalListContext(
  records: LoadedApprovalRecord[]
): Promise<ApprovalListContext> {
  const cache = createAggregationCache();
  if (records.length === 0) {
    return {
      balanceByPersonAndRecordType: new Map(),
      workingDaysReferenceData: {
        holidaysByYear: new Map(),
        locationById: new Map(),
        organisation: null,
      },
    };
  }

  const [firstRecord] = records;
  if (!firstRecord) {
    throw new Error("Approval records changed while loading list context");
  }
  const clerkOrgId = firstRecord.clerk_org_id;
  const organisationId = firstRecord.organisation_id;
  const locationIds = [
    ...new Set(
      records
        .map((record) => record.person.location_id)
        .filter((locationId): locationId is string => locationId !== null)
    ),
  ];

  const [locations, organisation] = await Promise.all([
    cache.getOrLoad("approval-list:locations", () =>
      locationIds.length
        ? database.location.findMany({
            select: {
              country_code: true,
              id: true,
              region_code: true,
              timezone: true,
            },
            where: {
              ...scoped({ clerkOrgId, organisationId }),
              id: { in: locationIds },
            },
          })
        : Promise.resolve([])
    ),
    cache.getOrLoad("approval-list:organisation", async () => {
      const row = await database.organisation.findFirst({
        select: {
          country_code: true,
          timezone: true,
        },
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          id: organisationId,
        },
      });
      return row
        ? {
            country_code: row.country_code,
            region_code: null,
            timezone: row.timezone,
          }
        : null;
    }),
  ]);

  const workingDaysReferenceData: WorkingDaysReferenceData = {
    holidaysByYear: new Map(),
    locationById: new Map(
      locations.map((location) => [
        location.id,
        {
          country_code: location.country_code,
          region_code: location.region_code,
          timezone: location.timezone,
        },
      ])
    ),
    organisation,
  };
  const years = new Set<number>();
  for (const record of records) {
    const result = workingDayYearsForInput(
      workingDaysInputForRecord(record),
      workingDaysReferenceData
    );
    if (result.ok) {
      for (const year of result.value) {
        years.add(year);
      }
    }
  }

  const holidayEntries = await Promise.all(
    [...years].map(
      async (year) =>
        [
          year,
          await cache.getOrLoad(`approval-list:holidays:${year}`, () =>
            listForOrganisation(
              clerkOrgId as ClerkOrgId,
              organisationId as OrganisationId,
              { year }
            )
          ),
        ] as const
    )
  );
  workingDaysReferenceData.holidaysByYear = new Map(holidayEntries);

  const personIds = [...new Set(records.map((record) => record.person_id))];
  const recordTypes = [
    ...new Set(
      records
        .map((record) => record.record_type)
        .filter((recordType) => isXeroLeaveType(recordType))
    ),
  ];
  const balances =
    personIds.length && recordTypes.length
      ? await database.leaveBalance.findMany({
          orderBy: { updated_at: "desc" },
          select: {
            balance: true,
            balance_unit: true,
            currency_code: true,
            person_id: true,
            record_type: true,
            updated_at: true,
          },
          where: {
            ...scoped({ clerkOrgId, organisationId }),
            person_id: { in: personIds },
            record_type: { in: recordTypes },
          },
        })
      : [];
  const balanceByPersonAndRecordType = new Map<string, BalanceSnapshotRow>();
  for (const balance of balances) {
    if (!balance.record_type) {
      continue;
    }
    const key = balanceKey(balance.person_id, balance.record_type);
    if (!balanceByPersonAndRecordType.has(key)) {
      balanceByPersonAndRecordType.set(key, {
        balance: balance.balance,
        balance_unit: balance.balance_unit,
        currency_code: balance.currency_code,
        updated_at: balance.updated_at,
      });
    }
  }

  return {
    balanceByPersonAndRecordType,
    workingDaysReferenceData,
  };
}

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
  record: LoadedApprovalRecord,
  context?: ApprovalListContext
): Promise<ApprovalListItem> {
  const duration = await computeDuration(record, context);
  const balanceSnapshot = await loadBalanceSnapshot(record, duration, context);
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
  record: LoadedApprovalRecord,
  context?: ApprovalListContext
): Promise<number | null> {
  const input = workingDaysInputForRecord(record);
  const duration = context
    ? computeWorkingDaysFromReferenceData(
        input,
        context.workingDaysReferenceData
      )
    : await computeWorkingDays(input);
  return duration.ok ? duration.value : null;
}

function workingDaysInputForRecord(record: LoadedApprovalRecord) {
  return {
    allDay: record.all_day,
    clerkOrgId: record.clerk_org_id,
    endsAt: record.ends_at,
    locationId: record.person.location_id,
    organisationId: record.organisation_id,
    startsAt: record.starts_at,
  };
}

function balanceKey(
  personId: string,
  recordType: availability_record_type
): string {
  return `${personId}:${recordType}`;
}

async function loadBalanceSnapshot(
  record: LoadedApprovalRecord,
  duration: number | null,
  context?: ApprovalListContext
): Promise<ApprovalListItem["balanceSnapshot"]> {
  if (!isXeroLeaveType(record.record_type)) {
    return null;
  }
  const balance = context
    ? (context.balanceByPersonAndRecordType.get(
        balanceKey(record.person_id, record.record_type)
      ) ?? null)
    : await database.leaveBalance.findFirst({
        orderBy: { updated_at: "desc" },
        select: {
          balance: true,
          balance_unit: true,
          currency_code: true,
          updated_at: true,
        },
        where: {
          ...scoped({
            clerkOrgId: record.clerk_org_id,
            organisationId: record.organisation_id,
          }),
          person_id: record.person_id,
          record_type: record.record_type,
        },
      });
  if (!balance) {
    return {
      balanceAvailable: null,
      balanceRemainingAfterApproval: null,
      currencyCode: null,
      leaveBalanceUpdatedAt: null,
      unit: null,
    };
  }
  const balanceAvailable = Number(balance.balance);
  return {
    balanceAvailable,
    balanceRemainingAfterApproval:
      balance.balance_unit === "days" && duration !== null
        ? balanceAvailable - duration
        : null,
    currencyCode: balance.currency_code ?? null,
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
    excludeSelf: true,
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
      objectId: record.id,
      objectType: "availability_record",
      organisationId: input.organisationId,
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

  if (!settingsResult.ok) {
    log.warn(
      "Failed to load organisation settings for manager notification, skipping notification",
      {
        clerkOrgId: input.clerkOrgId,
        error: settingsResult.error,
        organisationId: input.organisationId,
      }
    );
    return;
  }

  if (!settingsResult.value.notifyManagersOnStatusChange) {
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

async function notifyApprovalBestEffort(
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: {
    actionUrl: string;
    payload?: Record<string, string | number | boolean | null>;
    type: "leave_approved" | "leave_declined";
  }
): Promise<void> {
  try {
    await notifyUser(database, input, record, {
      actionUrl: options.actionUrl,
      payload: options.payload,
      recipientUserId: record.person.clerk_user_id,
      type: options.type,
    });
  } catch (error) {
    logApprovalNotificationFailure(error, input, record, options.type);
  }

  try {
    await notifyManagersIfEnabled(database, input, record, {
      actionUrl: `/leave-approvals?recordId=${record.id}`,
      type: options.type,
    });
  } catch (error) {
    logApprovalNotificationFailure(error, input, record, options.type);
  }
}

function logApprovalNotificationFailure(
  error: unknown,
  input: CommandInput,
  record: LoadedApprovalRecord,
  type: "leave_approved" | "leave_declined" | "leave_xero_sync_failed"
): void {
  log.error("Failed to dispatch approval notification", {
    availabilityRecordId: record.id,
    clerkOrgId: input.clerkOrgId,
    error: error instanceof Error ? error.message : "Unknown error",
    organisationId: input.organisationId,
    type,
  });
}

async function notifyApprovalFailureBestEffort(
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: { actionUrl: string }
): Promise<void> {
  try {
    await notifyOwnerAndApprover(database, input, record, {
      actionUrl: options.actionUrl,
    });
  } catch (error) {
    logApprovalNotificationFailure(
      error,
      input,
      record,
      "leave_xero_sync_failed"
    );
  }
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

function transitionWhere(
  input: CommandInput,
  record: LoadedApprovalRecord,
  claimedAt: Date
) {
  return {
    ...scoped(input),
    approval_status: record.approval_status,
    derived_sequence: record.derived_sequence,
    id: record.id,
    xero_write_claimed_at: claimedAt,
  };
}

function validationError(
  error: z.ZodError
): Result<never, ApprovalServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid approval request.",
    },
    ok: false,
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
    invalid_state_for_retry: "Only failed approval actions can be retried.",
    invalid_state_for_revert:
      "Only failed approval attempts can be reverted to pending.",
  };
  return { error: { code, message: messages[code] }, ok: false };
}

function recordNotFound(): Result<never, ApprovalServiceError> {
  return {
    error: {
      code: "record_not_found",
      message: "Availability record not found.",
    },
    ok: false,
  };
}

function notAuthorised(): Result<never, ApprovalServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage this approval.",
    },
    ok: false,
  };
}

function xeroNotConnected(): Result<never, ApprovalServiceError> {
  return {
    error: {
      code: "xero_not_connected",
      message:
        "Xero is not connected for this organisation. Connect Xero before approving or declining leave.",
    },
    ok: false,
  };
}

function resolutionBlocked(
  resolutionError: ProviderResolutionError
): Result<never, ApprovalServiceError> {
  return {
    error: {
      code: "approval_blocked_resolution",
      message: resolutionError.message,
      resolutionError,
    },
    ok: false,
  };
}

type ApprovalFailureStage =
  | "prepare"
  | "xero_write"
  | "local_transaction"
  | "notification"
  | "reload"
  | "publication"
  | "projection";

type ApprovalFailureOperation =
  | "list_for_approver"
  | "get_approval_detail"
  | "get_approval_summary_counts"
  | "retry_decline_preflight"
  | "request_more_info"
  | "revert_approval_attempt"
  | "approve"
  | "retry_approve"
  | "decline"
  | "retry_decline";

interface ApprovalFailureContext {
  clerkOrgId: string;
  failureStage?: ApprovalFailureStage;
  operation: ApprovalFailureOperation;
  organisationId: string;
  recordId?: string;
  xeroWriteSucceeded?: boolean;
}

function logAndReturnUnknown(
  error: unknown,
  context: ApprovalFailureContext,
  userMessage: string
): Result<never, ApprovalServiceError> {
  log.error("Unexpected approval service failure", { ...context, error });
  return unknownError(userMessage);
}

function handleApprovalWriteFailure(
  error: unknown,
  context: ApprovalFailureContext & {
    failureStage: ApprovalFailureStage;
    xeroWriteSucceeded: boolean;
  },
  invalidStateCode:
    | "invalid_state_for_approve"
    | "invalid_state_for_decline"
    | "invalid_state_for_retry",
  userMessage: string
): Result<never, ApprovalServiceError> {
  if (error instanceof OptimisticConflictError) {
    if (context.xeroWriteSucceeded) {
      log.error("Approval state changed after Xero write succeeded", {
        ...context,
        error,
        failureStage: "local_transaction",
        xeroWriteSucceeded: true,
      });
    }
    return invalidState(invalidStateCode);
  }
  return logAndReturnUnknown(error, context, userMessage);
}

function unknownError(message: string): Result<never, ApprovalServiceError> {
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

// Explicit projection: source_payload_json and xero_write_error_raw are audit
// data and must never cross the RSC boundary to a client component.
const approvalRecordSelect = {
  all_day: true,
  approval_note: true,
  approval_status: true,
  approved_at: true,
  archived_at: true,
  clerk_org_id: true,
  created_at: true,
  created_by_user_id: true,
  ends_at: true,
  failed_action: true,
  id: true,
  notes_internal: true,
  organisation_id: true,
  person: recordInclude.person,
  person_id: true,
  record_type: true,
  source_remote_id: true,
  source_type: true,
  starts_at: true,
  submitted_at: true,
  xero_write_error: true,
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
