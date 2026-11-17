import { type AuthRole, hasPermission } from "@repo/auth/permissions";
import {
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantResult,
} from "@repo/database";
import "server-only";
import type {
  AccountId,
  ExternalWritePort,
  OrganisationId,
  ProviderResolutionError,
  ProviderWriteError,
  Result,
} from "@repo/core";
import { xeroRecoveryMessage } from "@repo/core";
import {
  assertTenantDb,
  getSubmitOperation,
  hasUnresolvedSubmitOperation,
  type OutboundOperationAttemptScope,
  resolveAccountCompanies,
  scopedTo as scoped,
  type TenantDb,
  withTenantDb,
} from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import type {
  availability_approval_status,
  availability_failed_action,
  availability_record_type,
} from "@repo/database/generated/enums";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import { dispatchNotification } from "@repo/notifications";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { createAggregationCache } from "../analytics/request-cache";
import {
  computeWorkingDays,
  computeWorkingDaysFromReferenceData,
  loadHolidaysForYears,
  type WorkingDaysReferenceData,
  workingDayYearsForInput,
} from "../duration/working-days";
import {
  createLeaveOnApproval,
  type SubmitServiceError,
} from "../plans/submit-service";
import {
  completeXeroWriteSideEffects,
  prepareXeroWrite as prepareJournaledWrite,
  recordXeroWriteOutcome,
} from "../plans/write-operation";
import { isXeroLeaveType } from "../records/record-type-categories";
import { managerScopePersonIds } from "../settings/manager-scope";
import { getSettings } from "../settings/organisation-settings-service";
import { dispatchSyncEvent } from "../sync/sync-events";
import { getXeroConnectionStateForScope } from "../xero-connection-state";
import {
  acquireXeroWriteClaim,
  noUnresolvedSubmitOperationWhere,
  releaseXeroWriteClaim,
  unclaimedOrExpiredXeroWriteWhere,
  XERO_WRITE_CLAIM_LEASE_MS,
} from "../xero-write-claim";

export type ApprovalRole = Exclude<AuthRole, "viewer">;
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
  | {
      code: "approval_outcome_unknown";
      message: string;
    }
  | {
      code: "dispatch_failed";
      message: string;
    }
  | {
      code: "invalid_state_for_approve";
      message: string;
    }
  | {
      code: "invalid_state_for_decline";
      message: string;
    }
  | {
      code: "invalid_state_for_info_request";
      message: string;
    }
  | {
      code: "invalid_state_for_revert";
      message: string;
    }
  | {
      code: "invalid_state_for_retry";
      message: string;
    }
  | {
      code: "missing_preserved_reason";
      message: string;
    }
  | {
      code: "not_a_leave_type";
      message: string;
    }
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "record_not_found";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    }
  | {
      code: "xero_not_connected";
      message: string;
    }
  | {
      code: "xero_write_failed";
      message: string;
      xeroError: ProviderWriteError;
    };
export interface ApprovalListItem {
  accountId: string;
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
  createdAt: Date;
  durationWorkingDays: number | null;
  endsAt: Date;
  failedAction: availability_failed_action | null;
  id: string;
  mutedActionNote: string | null;
  notesInternal?: string | null;
  organisationId: string;
  organisationName: string;
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
  requireDeclineReason: boolean;
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
  accountId: z.string().min(1),
  actingPersonId: z.string().uuid().nullable(),
  actingUserId: z.string().min(1),
  cursor: z.string().uuid().nullable().optional(),
  filters: FiltersSchema.optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  role: RoleSchema,
});
const DetailSchema = z.object({
  accountId: z.string().min(1),
  actingPersonId: z.string().uuid().nullable(),
  actingUserId: z.string().min(1),
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
  role: RoleSchema,
});
const AccountDetailSchema = DetailSchema.omit({ organisationId: true });
const CommandSchema = DetailSchema;
const DeclineReasonSchema = z
  .string()
  .trim()
  .max(1000, "Enter a decline reason of no more than 1,000 characters.");
const DeclineSchema = CommandSchema.extend({
  reason: DeclineReasonSchema,
});
const InfoSchema = CommandSchema.extend({
  question: z.string().trim().min(3).max(1000),
});
const DispatchSchema = z.object({
  accountId: z.string().min(1),
  actingUserId: z.string().min(1),
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
  requireDeclineReason: boolean;
  workingDaysReferenceData: WorkingDaysReferenceData;
}
type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };
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
  input: ListInput,
  db: TenantDb
): Promise<
  Result<
    {
      items: ApprovalListItem[];
      nextCursor: string | null;
    },
    ApprovalServiceError
  >
> {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;

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
    return await loadApproverPage(parsed.data, client);
  }
}
async function loadApproverPage(
  data: ListData,
  db: TenantDb
): Promise<
  Result<
    {
      items: ApprovalListItem[];
      nextCursor: string | null;
    },
    ApprovalServiceError
  >
> {
  assertTenantDb(db, data.accountId);
  {
    assertTenantDb(db, data.accountId);
    const client = db;

    const companies = await resolveAccountCompanies(data.accountId, client);
    const managedPersonIds = await resolveManagedPersonIds(data, client);
    const branches: Prisma.AvailabilityRecordWhereInput[] = [];
    for (const company of companies) {
      const filters = await resolveListFilters(
        { ...data, organisationId: company.id },
        client
      );
      branches.push({
        organisation_id: company.id,
        ...buildApprovalStatusWhere(
          filters.status,
          Boolean(filters.dateFrom ?? filters.dateTo)
        ),
      });
    }
    const { filters } = data;
    const pageSize = data.pageSize ?? 50;
    const records = await client.availabilityRecord.findMany({
      cursor: data.cursor ? { id: data.cursor } : undefined,
      orderBy: [{ submitted_at: "asc" }, { starts_at: "asc" }, { id: "asc" }],
      select: approvalRecordSelect,
      skip: data.cursor ? 1 : 0,
      take: pageSize + 1,
      where: {
        account_id: data.accountId,
        archived_at: null,
        OR: branches,
        organisation_id: { in: companies.map((company) => company.id) },
        source_type: { in: ["team_calendar_leave", "xero_leave"] },
        ...approvalListFilterWhere(filters),
        ...(data.role === "manager"
          ? { person_id: { in: managedPersonIds } }
          : {}),
      },
    });
    const hasNext = records.length > pageSize;
    const pageRecords = hasNext ? records.slice(0, pageSize) : records;
    // The list projection omits raw provider payloads. Mapping only reads the explicit safe fields.
    const safeRecords = pageRecords as unknown as LoadedApprovalRecord[];
    const contexts = await companyApprovalContexts(
      safeRecords,
      companies,
      client
    );
    const items: ApprovalListItem[] = [];
    for (const record of safeRecords) {
      items.push(
        await toApprovalListItem(
          record,
          contexts.get(record.organisation_id),
          client
        )
      );
    }
    return {
      ok: true,
      value: {
        items,
        nextCursor: hasNext ? (pageRecords.at(-1)?.id ?? null) : null,
      },
    };
  }
}
async function resolveListFilters(
  data: ListData & { organisationId: string },
  db: TenantDb
): Promise<
  z.infer<typeof FiltersSchema> & {
    status: ApprovalStatus[];
  }
> {
  assertTenantDb(db, data.accountId);
  {
    assertTenantDb(db, data.accountId);
    const client = db;

    const settingsResult = await getSettings(
      {
        accountId: data.accountId,
        organisationId: data.organisationId,
      },
      client
    );
    if (!settingsResult.ok) {
      log.warn(
        "Failed to load organisation settings for list approvals, using default view",
        {
          accountId: data.accountId,
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
}
async function resolveManagedPersonIds(
  data: {
    actingPersonId: string | null;
    accountId: string;
    role: ApprovalRole;
  },
  db: TenantDb
): Promise<string[]> {
  assertTenantDb(db, data.accountId);
  {
    assertTenantDb(db, data.accountId);
    const client = db;

    if (!(data.role === "manager" && data.actingPersonId)) {
      return [];
    }
    const personIds = await managerScopePersonIds(
      {
        accountId: data.accountId,
        actingPersonId: data.actingPersonId,
      },
      client
    );
    return personIds.filter((personId) => personId !== data.actingPersonId);
  }
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
  input: z.input<typeof AccountDetailSchema>,
  db: TenantDb
): Promise<Result<ApprovalDetail, ApprovalServiceError>> {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    const parsed = AccountDetailSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const authorised = await loadAndAuthorise(parsed.data, client);
    if (!authorised.ok) {
      return authorised;
    }
    const item = await toApprovalListItem(authorised.value, undefined, client);
    const history = await client.auditEvent.findMany({
      orderBy: { created_at: "asc" },
      select: {
        action: true,
        created_at: true,
        payload: true,
      },
      where: {
        account_id: parsed.data.accountId,
        action: { in: HISTORY_ACTIONS },
        organisation_id: authorised.value.organisation_id,
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
  }
}
export async function getApprovalSummaryCounts(
  input: {
    actingPersonId: string | null;
    actingUserId: string;
    accountId: string;
    role: ApprovalRole;
  },
  db: TenantDb
): Promise<Result<ApprovalSummaryCounts, ApprovalServiceError>> {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    const parsed = ListSchema.omit({ filters: true }).safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    if (parsed.data.role === "manager" && !parsed.data.actingPersonId) {
      return notAuthorised();
    }
    const companies = await resolveAccountCompanies(input.accountId, client);
    const managedPersonIds = await resolveManagedPersonIds(parsed.data, client);
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const baseWhere = {
      account_id: parsed.data.accountId,
      archived_at: null,
      organisation_id: { in: companies.map((company) => company.id) },
      source_type: { in: ["team_calendar_leave", "xero_leave"] },
      ...(parsed.data.role === "manager"
        ? { person_id: { in: managedPersonIds } }
        : {}),
    } satisfies Prisma.AvailabilityRecordWhereInput;
    const [pending, failedSync, approvedThisMonth, declinedThisMonth] = [
      await client.availabilityRecord.count({
        where: { ...baseWhere, approval_status: "submitted" },
      }),
      await client.availabilityRecord.count({
        where: { ...baseWhere, approval_status: "xero_sync_failed" },
      }),
      await client.availabilityRecord.count({
        where: {
          ...baseWhere,
          approval_status: "approved",
          approved_at: { gte: startOfMonth },
        },
      }),
      await client.availabilityRecord.count({
        where: {
          ...baseWhere,
          approval_status: "declined",
          approved_at: { gte: startOfMonth },
        },
      }),
    ];
    return {
      ok: true,
      value: {
        approvedThisMonth,
        declinedThisMonth,
        failedSync,
        pending,
      },
    };
  }
}
export async function approve(
  input: CommandInput,
  externalWritePort: ExternalWritePort
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  assertNoTenantTransaction("approve");
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
  assertNoTenantTransaction("retryApproval");
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
  assertNoTenantTransaction("decline");
  const parsed = DeclineSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  try {
    const policy = await withTenantDb(input.accountId, async (db) => {
      const authorised = await loadAndAuthorise(parsed.data, db);
      if (!authorised.ok) {
        return authorised;
      }
      const settings = await getSettings(
        {
          accountId: input.accountId,
          organisationId: authorised.value.organisation_id,
        },
        db
      );
      if (!settings.ok) {
        throw new Error(settings.error.message);
      }
      if (
        settings.value.requireDeclineReason &&
        parsed.data.reason.trim().length < 3
      ) {
        return {
          error: {
            code: "validation_error" as const,
            message: "Enter a decline reason of at least 3 characters.",
          },
          ok: false as const,
        };
      }
      return { ok: true as const, value: undefined };
    });
    if (!policy.ok) {
      return policy;
    }
  } catch (error) {
    return logAndReturnUnknown(
      error,
      {
        accountId: input.accountId,
        operation: "decline_policy",
        organisationId: input.organisationId,
      },
      "Failed to read decline policy."
    );
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
  assertNoTenantTransaction("retryDecline");
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  try {
    const authorised = await withTenantResult(parsed.data.accountId, (db) =>
      loadAndAuthorise(parsed.data, db)
    );
    if (!authorised.ok) {
      return authorised;
    }
    const { approval_note: reason } = authorised.value;
    if (
      authorised.value.approval_status !== "xero_sync_failed" ||
      authorised.value.failed_action !== "decline"
    ) {
      return invalidState("invalid_state_for_retry");
    }
    const phaseInput1 = {
      accountId: input.accountId,
      organisationId: authorised.value.organisation_id,
    } satisfies Parameters<typeof getSettings>[0];
    const settings = await withTenantResult(phaseInput1.accountId, (db) =>
      getSettings(phaseInput1, db)
    );
    if (!settings.ok) {
      throw new Error(settings.error.message);
    }
    if (
      settings.value.requireDeclineReason &&
      (!reason || reason.trim().length === 0)
    ) {
      return {
        error: {
          code: "missing_preserved_reason",
          message:
            "The original decline reason could not be found. Enter a new reason to try again.",
        },
        ok: false,
      };
    }
    const reasonSchema = settings.value.requireDeclineReason
      ? DeclineReasonSchema.min(
          3,
          "Enter a decline reason of at least 3 characters."
        )
      : DeclineReasonSchema;
    const parsedReason = reasonSchema.safeParse(reason ?? "");
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
        accountId: parsed.data.accountId,
        operation: "retry_decline_preflight",
        organisationId: parsed.data.organisationId,
        recordId: parsed.data.recordId,
      },
      "Failed to retry this decline."
    );
  }
}
export async function requestMoreInfo(
  input: InfoInput,
  db: TenantDb
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  assertTenantDb(db, input.accountId);
  const run = async (client: TenantDb): ReturnType<typeof requestMoreInfo> => {
    const parsed = InfoSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const authorised = await loadAndAuthorise(parsed.data, client);
    if (!authorised.ok) {
      return authorised;
    }
    const { value: record } = authorised;
    if (record.approval_status !== "submitted") {
      return invalidState("invalid_state_for_info_request");
    }
    await (async (tx: TenantDb) => {
      await notifyUser(tx, parsed.data, record, {
        actionUrl: `/plans?recordId=${record.id}`,
        payload: { body: parsed.data.question },
        recipientUserId: record.person.user_id,
        type: "leave_info_requested",
      });
      await tx.auditEvent.create({
        data: auditData(parsed.data, "availability_records.info_requested", {
          questionLength: parsed.data.question.length,
        }),
      });
    })(client);
    return {
      ok: true,
      value: await toApprovalListItem(record, undefined, client),
    };
  };
  return await (async () => {
    assertTenantDb(db, input.accountId);
    return await run(db);
  })();
}
export async function revertApprovalAttempt(
  input: CommandInput
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  assertNoTenantTransaction("revertApprovalAttempt");
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  try {
    const authorised = await withTenantResult(parsed.data.accountId, (db) =>
      loadAndAuthorise(parsed.data, db)
    );
    if (!authorised.ok) {
      return authorised;
    }
    const { value: record } = authorised;
    if (
      record.approval_status !== "xero_sync_failed" ||
      !["approve", "decline"].includes(record.failed_action ?? "")
    ) {
      return invalidState("invalid_state_for_revert");
    }
    await withTenantDb(input.accountId, async (tx: TenantDb) => {
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
    const updated = await withTenantDb(parsed.data.accountId, (db) =>
      loadRecord(parsed.data, db)
    );
    if (!updated) {
      return recordNotFound();
    }
    await materialiseApprovalPublication(parsed.data);
    return {
      ok: true,
      value: await withTenantDb(updated.account_id, (db) =>
        toApprovalListItem(updated, undefined, db)
      ),
    };
  } catch (error) {
    if (error instanceof OptimisticConflictError) {
      return invalidState("invalid_state_for_revert");
    }
    return logAndReturnUnknown(
      error,
      {
        accountId: parsed.data.accountId,
        operation: "revert_approval_attempt",
        organisationId: parsed.data.organisationId,
        recordId: parsed.data.recordId,
      },
      "Failed to revert this approval attempt."
    );
  }
}
export function dispatchApprovalReconciliation(input: DispatchInput): Promise<
  Result<
    {
      queued: boolean;
      reason?: string;
    },
    ApprovalServiceError
  >
> {
  assertNoTenantTransaction("dispatchApprovalReconciliation");
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve(validationError(parsed.error));
  }
  if (!hasPermission(parsed.data.role, { xero: ["sync"] })) {
    return Promise.resolve(notAuthorised());
  }
  return dispatchPreparedApprovalSync(
    parsed.data,
    "approval_state_reconciliation"
  );
}
export function dispatchXeroLeaveSync(
  input: z.input<typeof DispatchSchema>
): Promise<
  Result<
    {
      queued: boolean;
      reason?: string;
    },
    ApprovalServiceError
  >
> {
  assertNoTenantTransaction("dispatchXeroLeaveSync");
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return Promise.resolve(validationError(parsed.error));
  }
  if (!hasPermission(parsed.data.role, { xero: ["sync"] })) {
    return Promise.resolve(notAuthorised());
  }
  return dispatchPreparedApprovalSync(parsed.data, "leave_records");
}
type ApprovalSyncRunType = "approval_state_reconciliation" | "leave_records";
export type PreparedApprovalSync = Parameters<typeof dispatchSyncEvent>[0];

async function dispatchPreparedApprovalSync(
  input: DispatchInput,
  runType: ApprovalSyncRunType
): Promise<Result<{ queued: boolean; reason?: string }, ApprovalServiceError>> {
  const prepared = await withTenantDb(input.accountId, (db) =>
    prepareApprovalSync(input, runType, db)
  );
  return prepared.ok ? sendPreparedApprovalSync(prepared.value) : prepared;
}

export async function prepareApprovalSync(
  input: DispatchInput,
  runType: ApprovalSyncRunType,
  db: TenantDb
): Promise<Result<PreparedApprovalSync, ApprovalServiceError>> {
  assertTenantDb(db, input.accountId);
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!hasPermission(parsed.data.role, { xero: ["sync"] })) {
    return notAuthorised();
  }
  const tenant = await db.xeroConnection.findFirst({
    orderBy: { created_at: "asc" },
    where: {
      account_id: input.accountId,
      organisation_id: input.organisationId,
    },
  });
  if (!tenant) {
    return xeroNotConnected();
  }
  const xeroStateResult = await getXeroConnectionStateForScope(
    {
      accountId: input.accountId,
      organisationId: input.organisationId,
    },
    db
  );
  if (!xeroStateResult.ok) {
    return {
      error: {
        code: "unknown_error",
        message:
          "We cannot reach Xero right now. Try again later or contact support.",
      },
      ok: false,
    };
  }
  const { state: xeroConnectionState } = xeroStateResult.value;
  if (
    xeroConnectionState !== "connected" &&
    xeroConnectionState !== "not_connected"
  ) {
    return {
      error: {
        code: "unknown_error",
        message: xeroRecoveryMessage(xeroConnectionState),
      },
      ok: false,
    };
  }
  const active = xeroConnectionState === "connected";
  if (!active) {
    return xeroNotConnected();
  }
  return {
    ok: true,
    value: {
      accountId: input.accountId,
      connectionId: tenant.id,
      organisationId: input.organisationId,
      runType,
      triggeredByUserId: input.actingUserId,
      triggerType: "manual",
    },
  };
}

export async function sendPreparedApprovalSync(
  payload: PreparedApprovalSync
): Promise<Result<{ queued: boolean; reason?: string }, ApprovalServiceError>> {
  assertNoTenantTransaction("sendPreparedApprovalSync");
  const dispatched = await dispatchSyncEvent(payload);
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep durable journal fencing beside the synchronous provider and local approval transitions.
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
  let journalAttempt: OutboundOperationAttemptScope | null = null;
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
    if (prepared.value.completed) {
      return {
        ok: true,
        value: await withTenantDb(record.account_id, (db) =>
          toApprovalListItem(record, undefined, db)
        ),
      };
    }
    const { source_remote_id: xeroLeaveApplicationId } = record;
    if (!xeroLeaveApplicationId) {
      return await approveLocalRequest(
        parsed.data,
        externalWritePort,
        options.retry
      );
    }
    const journal = await prepareJournaledWrite(
      {
        action: "approve",
        actorUserId: parsed.data.actingUserId,
        ...parsed.data,
        employeeId: xeroEmployeeId,
        endsAt: record.ends_at,
        expectedFailedAction: options.retry ? "approve" : null,
        expectedSequence: record.derived_sequence,
        expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
        remoteId: xeroLeaveApplicationId,
        startsAt: record.starts_at,
        title: null,
        units: 0,
      },
      externalWritePort
    );
    if (!journal.ok) {
      return {
        error: {
          code: "xero_write_failed",
          message: journal.error.userMessage,
          xeroError: journal.error,
        },
        ok: false,
      };
    }
    journalAttempt = {
      accountId: parsed.data.accountId,
      action: "approve",
      attemptGeneration: journal.value.attemptGeneration,
      availabilityRecordId: record.id,
      organisationId: parsed.data.organisationId,
    };
    ({ claimedAt } = journal.value);
    if (!claimedAt) {
      return invalidState(
        options.retry ? "invalid_state_for_retry" : "invalid_state_for_approve"
      );
    }
    const ownerClaim = claimedAt;
    const originalApproverId =
      journal.value.actorUserId === parsed.data.actingUserId
        ? parsed.data.actingPersonId
        : ((
            await withTenantDb(parsed.data.accountId, (db) =>
              db.person.findFirst({
                select: { id: true },
                where: {
                  account_id: parsed.data.accountId,
                  archived_at: null,
                  organisation: {
                    account_id: parsed.data.accountId,
                    archived_at: null,
                  },
                  user_id: journal.value.actorUserId,
                },
              })
            )
          )?.id ?? null);
    failureStage = "xero_write";
    const response = journal.value.providerAccepted
      ? { ok: true as const, value: undefined }
      : await externalWritePort.approveLeaveApplication({
          accountId: parsed.data.accountId,
          employeeId: xeroEmployeeId,
          mutation: journal.value.mutation,
          organisationId: parsed.data.organisationId,
          remoteId: xeroLeaveApplicationId,
        });
    if (
      !journal.value.providerAccepted &&
      journalAttempt &&
      !(await recordXeroWriteOutcome(
        journalAttempt,
        response,
        xeroLeaveApplicationId ?? undefined,
        journal.value.replayedUnknown
      ))
    ) {
      throw new Error("Xero journal outcome changed.");
    }
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
    await withTenantDb(parsed.data.accountId, async (tx: TenantDb) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "approved",
          approved_at: now,
          approved_by_person_id: originalApproverId,
          derived_sequence: { increment: 1 },
          failed_action: null,
          updated_by_user_id: journal.value.actorUserId,
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
        data: auditData(
          { ...parsed.data, actingUserId: journal.value.actorUserId },
          options.successAuditAction,
          {
            xeroLeaveApplicationId,
          }
        ),
      });
    });
    claimedAt = null;
    failureStage = "notification";
    if (
      !(await completeXeroWriteSideEffects({
        accountId: parsed.data.accountId,
        actorUserId: journal.value.actorUserId,
        attempt: journalAttempt,
        manager: record.person.manager?.user_id
          ? {
              personId: record.person.manager.id,
              userId: record.person.manager.user_id,
            }
          : null,
        organisationId: parsed.data.organisationId,
        recipient: record.person.user_id
          ? {
              personId: record.person.id,
              userId: record.person.user_id,
            }
          : null,
        recordId: record.id,
      }))
    ) {
      return unknownError(
        "The Xero action is saved. Its calendar or notification update requires administrator recovery."
      );
    }
    failureStage = "reload";
    const updated = await withTenantDb(parsed.data.accountId, (db) =>
      loadRecord(parsed.data, db)
    );
    if (!updated) {
      return recordNotFound();
    }
    failureStage = "projection";
    return {
      ok: true,
      value: await withTenantDb(updated.account_id, (db) =>
        toApprovalListItem(updated, undefined, db)
      ),
    };
  } catch (error) {
    if (claimedAt) {
      const phaseInput2 = { ...parsed.data, claimedAt } satisfies Parameters<
        typeof releaseXeroWriteClaim
      >[0];
      await withTenantDb(phaseInput2.accountId, (db) =>
        releaseXeroWriteClaim(phaseInput2, db)
      );
    }
    return handleApprovalWriteFailure(
      error,
      {
        accountId: parsed.data.accountId,
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep the local-only guard and provider failure persistence beside the scoped claim and transition.
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
  let journalAttempt: OutboundOperationAttemptScope | null = null;
  try {
    const prepared = await prepareApprovalWrite(input, externalWritePort, {
      expectedFailedAction: options.retry ? "decline" : null,
      expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
      invalidStateCode: options.retry
        ? "invalid_state_for_retry"
        : "invalid_state_for_decline",
      localDecline: true,
    });
    if (!prepared.ok) {
      return prepared;
    }
    const { record, xeroEmployeeId } = prepared.value;
    if (prepared.value.completed) {
      return {
        ok: true,
        value: await withTenantDb(record.account_id, (db) =>
          toApprovalListItem(record, undefined, db)
        ),
      };
    }
    const { source_remote_id: xeroLeaveApplicationId } = record;
    if (
      !xeroLeaveApplicationId &&
      record.source_type !== "team_calendar_leave"
    ) {
      return resolutionBlocked({
        code: "missing_mapping",
        message: "This record does not have a Xero leave application ID.",
      });
    }
    const journal = xeroLeaveApplicationId
      ? await prepareJournaledWrite(
          {
            action: "decline",
            actorUserId: input.actingUserId,
            ...input,
            employeeId: xeroEmployeeId,
            endsAt: record.ends_at,
            expectedFailedAction: options.retry ? "decline" : null,
            expectedSequence: record.derived_sequence,
            expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
            reason: options.reason,
            remoteId: xeroLeaveApplicationId,
            startsAt: record.starts_at,
            title: null,
            units: 0,
          },
          externalWritePort
        )
      : null;
    if (journal && !journal.ok) {
      return {
        error: {
          code: "xero_write_failed",
          message: journal.error.userMessage,
          xeroError: journal.error,
        },
        ok: false,
      };
    }
    if (journal?.ok) {
      journalAttempt = {
        accountId: input.accountId,
        action: "decline",
        attemptGeneration: journal.value.attemptGeneration,
        availabilityRecordId: record.id,
        organisationId: input.organisationId,
      };
    }
    const phaseInput3 = {
      ...input,
      expectedFailedAction: options.retry ? "decline" : null,
      expectedSequence: record.derived_sequence,
      expectedStatus: options.retry ? "xero_sync_failed" : "submitted",
      localAction: "decline",
    } satisfies Parameters<typeof acquireXeroWriteClaim>[0];
    claimedAt = journal?.ok
      ? journal.value.claimedAt
      : await withTenantDb(phaseInput3.accountId, (db) =>
          acquireXeroWriteClaim(phaseInput3, db)
        );
    if (!claimedAt) {
      return invalidState(
        options.retry ? "invalid_state_for_retry" : "invalid_state_for_decline"
      );
    }
    const ownerClaim = claimedAt;
    const originalActorUserId = journal?.ok
      ? journal.value.actorUserId
      : input.actingUserId;
    const originalApproverId =
      originalActorUserId === input.actingUserId
        ? input.actingPersonId
        : ((
            await withTenantDb(input.accountId, (db) =>
              db.person.findFirst({
                select: { id: true },
                where: {
                  account_id: input.accountId,
                  archived_at: null,
                  organisation: {
                    account_id: input.accountId,
                    archived_at: null,
                  },
                  user_id: originalActorUserId,
                },
              })
            )
          )?.id ?? null);
    failureStage = "xero_write";
    const mutation = journal?.ok ? journal.value.mutation : undefined;
    const response =
      journal?.ok && journal.value.providerAccepted
        ? { ok: true as const, value: undefined }
        : await declineRemoteIfPresent(
            input,
            externalWritePort,
            xeroEmployeeId,
            xeroLeaveApplicationId,
            options.reason,
            mutation
          );
    if (
      !(journal?.ok && journal.value.providerAccepted) &&
      journalAttempt &&
      !(await recordXeroWriteOutcome(
        journalAttempt,
        response,
        xeroLeaveApplicationId ?? undefined,
        journal?.ok ? journal.value.replayedUnknown : false
      ))
    ) {
      throw new Error("Xero journal outcome changed.");
    }
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
    xeroWriteSucceeded = xeroLeaveApplicationId !== null;
    failureStage = "local_transaction";
    const now = new Date();
    await withTenantDb(input.accountId, async (tx: TenantDb) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_note: journal?.ok
            ? (journal.value.requestReason ?? options.reason)
            : options.reason,
          approval_status: "declined",
          approved_at: now,
          approved_by_person_id: originalApproverId,
          derived_sequence: { increment: 1 },
          failed_action: null,
          updated_by_user_id: originalActorUserId,
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
        data: auditData(
          { ...input, actingUserId: originalActorUserId },
          options.successAuditAction,
          {
            reasonLength: options.reason.length,
            xeroLeaveApplicationId,
          }
        ),
      });
    });
    claimedAt = null;
    failureStage = "notification";
    if (journal?.ok && journalAttempt) {
      if (
        !(await completeXeroWriteSideEffects({
          accountId: input.accountId,
          actorUserId: journal.value.actorUserId,
          attempt: journalAttempt,
          declineReason: journal.value.requestReason,
          manager: record.person.manager?.user_id
            ? {
                personId: record.person.manager.id,
                userId: record.person.manager.user_id,
              }
            : null,
          organisationId: input.organisationId,
          recipient: record.person.user_id
            ? {
                personId: record.person.id,
                userId: record.person.user_id,
              }
            : null,
          recordId: record.id,
        }))
      ) {
        return unknownError(
          "The Xero action is saved. Its calendar or notification update requires administrator recovery."
        );
      }
    } else {
      await notifyApprovalBestEffort(input, record, {
        actionUrl: `/plans?recordId=${record.id}`,
        payload: { body: options.reason },
        type: "leave_declined",
      });
      await materialiseApprovalPublication(input);
    }
    failureStage = "reload";
    const updated = await withTenantDb(input.accountId, (db) =>
      loadRecord(input, db)
    );
    if (!updated) {
      return recordNotFound();
    }
    failureStage = "projection";
    return {
      ok: true,
      value: await withTenantDb(updated.account_id, (db) =>
        toApprovalListItem(updated, undefined, db)
      ),
    };
  } catch (error) {
    if (claimedAt) {
      const phaseInput4 = { ...input, claimedAt } satisfies Parameters<
        typeof releaseXeroWriteClaim
      >[0];
      await withTenantDb(phaseInput4.accountId, (db) =>
        releaseXeroWriteClaim(phaseInput4, db)
      );
    }
    return handleApprovalWriteFailure(
      error,
      {
        accountId: input.accountId,
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
    localDecline?: boolean;
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
      completed?: boolean;
    },
    ApprovalServiceError
  >
> {
  const authorised = await withTenantResult(input.accountId, (db) =>
    loadAndAuthorise(input, db)
  );
  if (!authorised.ok) {
    return authorised;
  }
  const { value: record } = authorised;
  const action = options.localDecline ? "decline" : "approve";
  if (
    record.approval_status ===
      (action === "approve" ? "approved" : "declined") &&
    (
      await withTenantDb(
        {
          accountId: input.accountId,
          action,
          availabilityRecordId: record.id,
          organisationId: input.organisationId,
        }.accountId,
        (db) =>
          getSubmitOperation(
            {
              accountId: input.accountId,
              action,
              availabilityRecordId: record.id,
              organisationId: input.organisationId,
            },
            db
          )
      )
    )?.status === "completed"
  ) {
    return { ok: true, value: { completed: true, record, xeroEmployeeId: "" } };
  }
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
  if (
    (await withTenantDb(
      {
        accountId: input.accountId,
        availabilityRecordId: record.id,
        organisationId: input.organisationId,
      }.accountId,
      (db) =>
        hasUnresolvedSubmitOperation(
          {
            accountId: input.accountId,
            availabilityRecordId: record.id,
            organisationId: input.organisationId,
          },
          db
        )
    )) &&
    !record.source_remote_id &&
    (options.localDecline || !canResumeJournaledApproval(record))
  ) {
    return {
      error: {
        code: "unknown_error",
        message:
          "An administrator must resolve the uncertain Xero action before this leave can change.",
      },
      ok: false,
    };
  }
  if (
    options.localDecline &&
    record.source_type === "team_calendar_leave" &&
    !record.source_remote_id
  ) {
    return { ok: true, value: { record, xeroEmployeeId: "" } };
  }

  const xeroStateResult = await withTenantResult(input.accountId, (db) =>
    getXeroConnectionStateForScope(input, db)
  );
  if (!xeroStateResult.ok) {
    return {
      error: {
        code: "unknown_error",
        message:
          "We cannot reach Xero right now. Try again later or contact support.",
      },
      ok: false,
    };
  }
  const { state: xeroConnectionState } = xeroStateResult.value;
  if (
    xeroConnectionState !== "connected" &&
    xeroConnectionState !== "not_connected"
  ) {
    return {
      error: {
        code: "unknown_error",
        message: xeroRecoveryMessage(xeroConnectionState),
      },
      ok: false,
    };
  }
  const hasXero = xeroConnectionState === "connected";
  if (!hasXero) {
    return xeroNotConnected();
  }
  const employee = await externalWritePort.resolveEmployeeId({
    accountId: input.accountId,
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
  const { userMessage: plainMessage } = input.error;
  await withTenantDb(input.input.accountId, async (tx: TenantDb) => {
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
          ...(input.error.certainty
            ? { certainty: input.error.certainty }
            : {}),
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
  const updated = await withTenantDb(input.input.accountId, (db) =>
    loadRecord(input.input, db)
  );
  if (!updated) {
    return recordNotFound();
  }
  await materialiseApprovalPublication(input.input);
  return {
    ok: true,
    value: await withTenantDb(updated.account_id, (db) =>
      toApprovalListItem(updated, undefined, db)
    ),
  };
}
async function loadRecord(
  input: {
    accountId: string;
    organisationId?: string;
    recordId: string;
  },
  db: TenantDb
) {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;
    return await client.availabilityRecord.findFirst({
      include: recordInclude,
      where: {
        account_id: input.accountId,
        organisation: { account_id: input.accountId, archived_at: null },
        ...(input.organisationId
          ? { organisation_id: input.organisationId }
          : {}),
        id: input.recordId,
      },
    });
  }
}
async function materialiseApprovalPublication(input: {
  accountId: string;
  organisationId: string;
  recordId: string;
}): Promise<void> {
  const phaseInput5 = {
    accountId: input.accountId,
    availabilityRecordId: input.recordId,
    organisationId: input.organisationId,
  } satisfies Parameters<typeof materialiseAvailabilityPublication>[0];
  const publication = await withTenantResult(
    phaseInput5.accountId,
    (db) => materialiseAvailabilityPublication(phaseInput5, db),
    TENANT_READ_TRANSACTION_OPTIONS
  );
  if (!publication.ok) {
    // Best-effort: the approval transition is already persisted. Log the failed
    // feed projection rather than failing the write; it is corrected on the next
    // successful materialisation for the record.
    log.error("Failed to materialise availability publication", {
      accountId: input.accountId,
      availabilityRecordId: input.recordId,
      error: publication.error.message,
      organisationId: input.organisationId,
    });
  }
}
async function loadApprovalListContext(
  records: LoadedApprovalRecord[],
  db: TenantDb
): Promise<ApprovalListContext> {
  const cache = createAggregationCache();
  if (records.length === 0) {
    return await {
      balanceByPersonAndRecordType: new Map(),
      requireDeclineReason: true,
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
  assertTenantDb(db, firstRecord.account_id);
  {
    assertTenantDb(db, firstRecord.account_id);
    const client = db;

    const { account_id: accountId } = firstRecord;
    const { organisation_id: organisationId } = firstRecord;
    const settings = await getSettings({ accountId, organisationId }, client);
    const requireDeclineReason = settings.ok
      ? settings.value.requireDeclineReason
      : true;
    const locationIds = [
      ...new Set(
        records
          .map((record) => record.person.location_id)
          .filter((locationId): locationId is string => locationId !== null)
      ),
    ];
    const [locations, organisation] = [
      await cache.getOrLoad("approval-list:locations", () =>
        locationIds.length
          ? client.location.findMany({
              select: {
                country_code: true,
                id: true,
                region_code: true,
                timezone: true,
              },
              where: {
                ...scoped({ accountId, organisationId }),
                id: { in: locationIds },
              },
            })
          : Promise.resolve([])
      ),
      await cache.getOrLoad("approval-list:organisation", async () => {
        const row = await client.organisation.findFirst({
          select: {
            country_code: true,
            timezone: true,
          },
          where: {
            account_id: accountId,
            archived_at: null,
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
    ];
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
    const yearList = approvalWorkingDayYears(records, workingDaysReferenceData);
    workingDaysReferenceData.holidaysByYear = await cache.getOrLoad(
      `approval-list:holidays:${yearList.join(",")}`,
      () =>
        loadHolidaysForYears(
          accountId as AccountId,
          organisationId as OrganisationId,
          yearList,
          client
        )
    );
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
        ? await client.leaveBalance.findMany({
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
              ...scoped({ accountId, organisationId }),
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
      requireDeclineReason,
      workingDaysReferenceData,
    };
  }
}
async function loadAndAuthorise(
  input: Omit<CommandInput, "organisationId"> & { organisationId?: string },
  db: TenantDb
): Promise<Result<LoadedApprovalRecord, ApprovalServiceError>> {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    const record = await loadRecord(input, client);
    if (!record) {
      return recordNotFound();
    }
    const canAct = await canActOnRecord(input, record, client);
    if (!canAct) {
      return notAuthorised();
    }
    return { ok: true, value: record };
  }
}
async function toApprovalListItem(
  record: LoadedApprovalRecord,
  context: ApprovalListContext | undefined,
  db: TenantDb
): Promise<ApprovalListItem> {
  assertTenantDb(db, record.account_id);
  {
    assertTenantDb(db, record.account_id);
    const client = db;

    const settings = context
      ? null
      : await getSettings(
          {
            accountId: record.account_id,
            organisationId: record.organisation_id,
          },
          client
        );
    const requireDeclineReason =
      context?.requireDeclineReason ??
      (settings?.ok ? settings.value.requireDeclineReason : true);
    const duration = await computeDuration(record, context, client);
    const balanceSnapshot = await loadBalanceSnapshot(
      record,
      duration,
      context,
      client
    );
    const availableActions = actionsForRecord(record);
    return {
      accountId: record.account_id,
      allDay: record.all_day,
      approvalNote: record.approval_note,
      approvalStatus: record.approval_status,
      approvedAt: record.approved_at,
      availableActions,
      balanceSnapshot,
      createdAt: record.created_at,
      durationWorkingDays: duration,
      endsAt: record.ends_at,
      failedAction: record.failed_action,
      id: record.id,
      mutedActionNote: mutedNoteForRecord(record),
      notesInternal: record.notes_internal,
      organisationId: record.organisation_id,
      organisationName: record.organisation.name,
      person: {
        email: record.person.email,
        firstName: record.person.first_name,
        id: record.person.id,
        lastName: record.person.last_name,
        locationId: record.person.location_id,
        managerPersonId: record.person.manager_person_id,
        teamName: record.person.team?.name ?? null,
        userId: record.person.user_id,
      },
      recordType: record.record_type,
      requireDeclineReason,
      sourceRemoteId: record.source_remote_id,
      sourceType: record.source_type,
      startsAt: record.starts_at,
      submittedAt: record.submitted_at,
      submittedByUserId: record.created_by_user_id,
      xeroWriteError: record.xero_write_error,
    };
  }
}
async function computeDuration(
  record: LoadedApprovalRecord,
  context: ApprovalListContext | undefined,
  db: TenantDb
): Promise<number | null> {
  assertTenantDb(db, record.account_id);
  {
    assertTenantDb(db, record.account_id);
    const client = db;

    const input = workingDaysInputForRecord(record);
    const duration = context
      ? computeWorkingDaysFromReferenceData(
          input,
          context.workingDaysReferenceData
        )
      : await computeWorkingDays(input, client);
    return duration.ok ? duration.value : null;
  }
}
function workingDaysInputForRecord(record: LoadedApprovalRecord) {
  return {
    accountId: record.account_id,
    allDay: record.all_day,
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
  context: ApprovalListContext | undefined,
  db: TenantDb
): Promise<ApprovalListItem["balanceSnapshot"]> {
  assertTenantDb(db, record.account_id);
  {
    assertTenantDb(db, record.account_id);
    const client = db;

    if (!isXeroLeaveType(record.record_type)) {
      return null;
    }
    const balance = context
      ? (context.balanceByPersonAndRecordType.get(
          balanceKey(record.person_id, record.record_type)
        ) ?? null)
      : await client.leaveBalance.findFirst({
          orderBy: { updated_at: "desc" },
          select: {
            balance: true,
            balance_unit: true,
            currency_code: true,
            updated_at: true,
          },
          where: {
            ...scoped({
              accountId: record.account_id,
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
}
function canResumeJournaledApproval(record: LoadedApprovalRecord): boolean {
  const { outbound_operations: operations } = record;
  const operation = operations?.[0];
  return (
    record.source_type === "team_calendar_leave" &&
    !record.source_remote_id &&
    operations?.length === 1 &&
    operation?.action === "approve" &&
    ((operation.status === "prepared" &&
      operation.dispatch_started_at === null) ||
      (operation.status === "outcome_unknown" &&
        !!operation.idempotency_replay_before &&
        Date.now() < operation.idempotency_replay_before.getTime())) &&
    (!record.xero_write_claimed_at ||
      record.xero_write_claimed_at.getTime() <
        Date.now() - XERO_WRITE_CLAIM_LEASE_MS)
  );
}
function actionsForRecord(record: LoadedApprovalRecord): ApprovalAction[] {
  const replayActions = remoteReplayActions(record);
  if (replayActions) {
    return replayActions;
  }
  if (canResumeJournaledApproval(record)) {
    if (record.approval_status === "submitted") {
      return ["approve"];
    }
    if (
      record.approval_status === "xero_sync_failed" &&
      record.failed_action === "approve"
    ) {
      return ["retry_approval"];
    }
    return ["view_only"];
  }
  if (record.outbound_operations?.length) {
    return ["view_only"];
  }
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
  if (canResumeJournaledApproval(record)) {
    return record.outbound_operations?.[0]?.dispatch_started_at
      ? "A manager can safely retry this approval during its recorded Xero retry window."
      : "The previous approval stopped before contacting Xero. A manager can retry approval.";
  }
  if (record.outbound_operations?.length) {
    return "An administrator must resolve the uncertain Xero action in Plans before another action can be attempted.";
  }

  if (
    record.approval_status === "xero_sync_failed" &&
    (record.failed_action === "submit" || record.failed_action === "withdraw")
  ) {
    return "This record is waiting for the owner to retry submission.";
  }
  return null;
}
async function canActOnRecord(
  input: Omit<CommandInput, "organisationId"> & { organisationId?: string },
  record: LoadedApprovalRecord,
  db: TenantDb
): Promise<boolean> {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    if (hasPermission(input.role, { plans: ["manageAll"] })) {
      return true;
    }
    if (!(input.role === "manager" && input.actingPersonId)) {
      return false;
    }
    const visiblePersonIds = await managerScopePersonIds(
      {
        accountId: input.accountId,
        actingPersonId: input.actingPersonId,
        excludeSelf: true,
      },
      client
    );
    return visiblePersonIds.includes(record.person_id);
  }
}
function canUseApprovals(role: ApprovalRole): boolean {
  return hasPermission(role, { approvals: ["review"] });
}
async function notifyUser(
  tx: TenantDb,
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
      accountId: input.accountId,
      actionUrl: options.actionUrl,
      actorUserId: input.actingUserId,
      body: notificationBody(record, options.type, options.payload?.body),
      objectId: record.id,
      objectType: "availability_record",
      organisationId: input.organisationId,
      recipientPersonId: options.recipientPersonId ?? record.person.id,
      recipientUserId: options.recipientUserId,
      title: notificationTitle(options.type),
      type: options.type,
    },
    {},
    tx
  );
  if (!result.ok) {
    throw new NotificationCreateError();
  }
}
async function notifyManagersIfEnabled(
  tx: TenantDb,
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: {
    actionUrl: string;
    type: "leave_approved" | "leave_declined";
  }
) {
  const settingsResult = await getSettings(
    {
      accountId: input.accountId,
      organisationId: input.organisationId,
    },
    tx
  );
  if (!settingsResult.ok) {
    log.warn(
      "Failed to load organisation settings for manager notification, skipping notification",
      {
        accountId: input.accountId,
        error: settingsResult.error,
        organisationId: input.organisationId,
      }
    );
    return;
  }
  if (!settingsResult.value.notifyManagersOnStatusChange) {
    return;
  }
  const managerUserId = record.person.manager?.user_id;
  const managerPersonId = record.person.manager?.id ?? null;
  if (!managerUserId || managerUserId === input.actingUserId) {
    return;
  }
  if (managerUserId === record.person.user_id) {
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
    await withTenantDb(input.accountId, (db) =>
      notifyUser(db, input, record, {
        actionUrl: options.actionUrl,
        payload: options.payload,
        recipientUserId: record.person.user_id,
        type: options.type,
      })
    );
  } catch (error) {
    logApprovalNotificationFailure(error, input, record, options.type);
  }
  try {
    await withTenantDb(input.accountId, (db) =>
      notifyManagersIfEnabled(db, input, record, {
        actionUrl: `/leave-approvals?recordId=${record.id}`,
        type: options.type,
      })
    );
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
    accountId: input.accountId,
    availabilityRecordId: record.id,
    error: error instanceof Error ? error.message : "Unknown error",
    organisationId: input.organisationId,
    type,
  });
}
async function notifyApprovalFailureBestEffort(
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: {
    actionUrl: string;
  }
): Promise<void> {
  try {
    await withTenantDb(input.accountId, (db) =>
      notifyOwnerAndApprover(db, input, record, {
        actionUrl: options.actionUrl,
      })
    );
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
  tx: TenantDb,
  input: CommandInput,
  record: LoadedApprovalRecord,
  options: {
    actionUrl: string;
  }
) {
  const recipientUserIds = [
    { personId: record.person.id, userId: record.person.user_id },
    { personId: input.actingPersonId, userId: input.actingUserId },
  ].filter(
    (
      recipient
    ): recipient is {
      personId: string | null;
      userId: string;
    } => Boolean(recipient.userId)
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
    account_id: input.accountId,
    action,
    actor_user_id: input.actingUserId,
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
  | "decline_policy"
  | "retry_decline";
interface ApprovalFailureContext {
  accountId: string;
  failureStage?: ApprovalFailureStage;
  operation: ApprovalFailureOperation;
  organisationId?: string;
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
  if (typeof value === "undefined" || value === null) {
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
  organisation: { select: { id: true, name: true } },
  outbound_operations: {
    select: {
      action: true,
      dispatch_started_at: true,
      idempotency_replay_before: true,
      status: true,
    },
    where: {
      action: { in: ["approve", "decline", "withdraw"] },
      status: { in: ["prepared", "outcome_unknown", "provider_accepted"] },
    },
  },
  person: {
    select: {
      email: true,
      first_name: true,
      id: true,
      last_name: true,
      location_id: true,
      manager: {
        select: {
          id: true,
          user_id: true,
        },
      },
      manager_person_id: true,
      team: {
        select: {
          name: true,
        },
      },
      user_id: true,
    },
  },
} satisfies Prisma.AvailabilityRecordInclude;
// Explicit projection: source_payload_json and xero_write_error_raw are audit
// data and must never cross the RSC boundary to a client component.
const approvalRecordSelect = {
  account_id: true,
  all_day: true,
  approval_note: true,
  approval_status: true,
  approved_at: true,
  archived_at: true,
  created_at: true,
  created_by_user_id: true,
  ends_at: true,
  failed_action: true,
  id: true,
  notes_internal: true,
  organisation: recordInclude.organisation,
  organisation_id: true,
  outbound_operations: {
    select: {
      action: true,
      dispatch_started_at: true,
      idempotency_replay_before: true,
      status: true,
    },
    where: {
      action: { in: ["approve", "decline", "withdraw"] },
      status: { in: ["prepared", "outcome_unknown", "provider_accepted"] },
    },
  },
  person: recordInclude.person,
  person_id: true,
  record_type: true,
  source_remote_id: true,
  source_type: true,
  starts_at: true,
  submitted_at: true,
  xero_write_claimed_at: true,
  xero_write_error: true,
} satisfies Prisma.AvailabilityRecordSelect;
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
function approvalCreateError(error: SubmitServiceError): ApprovalServiceError {
  switch (error.code) {
    case "submission_outcome_unknown":
      return { code: "approval_outcome_unknown", message: error.message };
    case "submission_blocked_resolution":
      return {
        code: "approval_blocked_resolution",
        message: error.message,
        resolutionError: error.resolutionError,
      };
    case "invalid_state_for_submit":
      return {
        code: "invalid_state_for_approve",
        message: "Only pending local leave can be approved.",
      };
    case "invalid_state_for_revert":
    case "invalid_state_for_withdraw":
      return { code: "invalid_state_for_approve", message: error.message };
    default:
      return error;
  }
}
async function approveLocalRequest(
  input: CommandInput,
  externalWritePort: ExternalWritePort,
  retry: boolean | undefined
): Promise<Result<ApprovalListItem, ApprovalServiceError>> {
  const created = await createLeaveOnApproval(
    { ...input, actingRole: input.role },
    externalWritePort,
    retry
  );
  if (!created.ok) {
    return { error: approvalCreateError(created.error), ok: false };
  }
  const updated = await withTenantDb(input.accountId, (db) =>
    loadRecord(input, db)
  );
  if (!updated) {
    return recordNotFound();
  }
  return {
    ok: true,
    value: await withTenantDb(updated.account_id, (db) =>
      toApprovalListItem(updated, undefined, db)
    ),
  };
}
async function declineRemoteIfPresent(
  input: CommandInput,
  port: ExternalWritePort,
  employeeId: string,
  remoteId: string | null,
  reason: string,
  mutation?: import("@repo/core").XeroMutationIdentity
) {
  if (!remoteId) {
    return { ok: true as const, value: undefined };
  }
  return await port.declineLeaveApplication({
    accountId: input.accountId,
    employeeId,
    mutation,
    organisationId: input.organisationId,
    reason,
    remoteId,
  });
}

function remoteReplayActions(
  record: LoadedApprovalRecord
): ApprovalAction[] | null {
  const operation = record.outbound_operations?.[0];
  const undispatched =
    operation?.status === "prepared" &&
    operation.dispatch_started_at === null &&
    (operation.action === "approve" || operation.action === "decline") &&
    (!record.xero_write_claimed_at ||
      record.xero_write_claimed_at.getTime() <
        Date.now() - XERO_WRITE_CLAIM_LEASE_MS);
  const replayableUnknown =
    operation?.status === "outcome_unknown" &&
    operation.idempotency_replay_before &&
    Date.now() < operation.idempotency_replay_before.getTime() &&
    !record.xero_write_claimed_at;
  if (
    record.source_remote_id &&
    record.outbound_operations?.length === 1 &&
    (undispatched || replayableUnknown)
  ) {
    if (record.approval_status === "submitted") {
      return [operation.action === "approve" ? "approve" : "decline"];
    }
    if (record.approval_status === "xero_sync_failed") {
      if (operation.action === "approve") {
        return ["retry_approval"];
      }
      if (operation.action === "decline") {
        return ["retry_decline"];
      }
      return ["view_only"];
    }
  }
  return null;
}

function approvalWorkingDayYears(
  records: LoadedApprovalRecord[],
  reference: WorkingDaysReferenceData
): number[] {
  const years = new Set<number>();
  for (const record of records) {
    const result = workingDayYearsForInput(
      workingDaysInputForRecord(record),
      reference
    );
    if (!result.ok) {
      continue;
    }
    for (const year of result.value) {
      years.add(year);
    }
  }
  return [...years].sort((left, right) => left - right);
}

function approvalListFilterWhere(
  filters: Parameters<typeof loadApproverPage>[0]["filters"]
): Prisma.AvailabilityRecordWhereInput {
  return {
    ...(filters?.personId?.length
      ? { person_id: { in: filters.personId } }
      : {}),
    ...(filters?.recordType?.length
      ? { record_type: { in: filters.recordType } }
      : {}),
    ...(filters?.dateFrom ? { ends_at: { gte: filters.dateFrom } } : {}),
    ...(filters?.dateTo ? { starts_at: { lte: filters.dateTo } } : {}),
  };
}

async function companyApprovalContexts(
  safeRecords: LoadedApprovalRecord[],
  companies: Awaited<ReturnType<typeof resolveAccountCompanies>>,
  client: TenantDb
) {
  const contexts = new Map<string, ApprovalListContext>();
  for (const company of companies) {
    const companyRecords = safeRecords.filter(
      (record) => record.organisation_id === company.id
    );
    if (companyRecords.length) {
      contexts.set(
        company.id,
        await loadApprovalListContext(companyRecords, client)
      );
    }
  }
  return contexts;
}
