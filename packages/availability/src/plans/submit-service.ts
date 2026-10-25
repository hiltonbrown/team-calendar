import { hasPermission } from "@repo/auth/permissions";
import type { TenantDb } from "@repo/database";
import {
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantResult,
} from "@repo/database";
import "server-only";
import { createHash } from "node:crypto";
import type {
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  Result,
} from "@repo/core";
import { xeroRecoveryMessage } from "@repo/core";
import {
  acquireSubmitRecoverySideEffects,
  assertTenantDb,
  getSubmitOperation,
  hasUnresolvedSubmitOperation,
  markSubmitCompleted,
  markSubmitDefinitiveFailure,
  markSubmitOutcomeUnknown,
  markSubmitProviderAccepted,
  releaseSubmitRecoverySideEffects,
  resolveAccountCompanies,
  scopedTo as scoped,
  withTenantDb,
} from "@repo/database";
import {
  type AvailabilityRecord,
  Prisma,
} from "@repo/database/generated/client";
import type { availability_approval_status } from "@repo/database/generated/enums";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import {
  dispatchNotification,
  publishPersistedNotification,
} from "@repo/notifications";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { computeWorkingDays } from "../duration/working-days";
import { isXeroLeaveType } from "../records/record-type-categories";
import { managerScopePersonIds } from "../settings/manager-scope";
import { getXeroConnectionStateForScope } from "../xero-connection-state";
import {
  acquireXeroWriteClaim,
  noUnresolvedSubmitOperationWhere,
  releaseXeroWriteClaim,
  unclaimedOrExpiredXeroWriteWhere,
  XERO_WRITE_CLAIM_LEASE_MS,
} from "../xero-write-claim";
import { completeSubmitSideEffects } from "./submit-side-effects";
import {
  completeXeroWriteSideEffects,
  isDefinitiveWriteFailure,
  prepareXeroWrite as prepareJournaledWrite,
  recordXeroWriteOutcome,
} from "./write-operation";

export type SubmitServiceError =
  | {
      code: "invalid_state_for_retry";
      message: string;
    }
  | {
      code: "invalid_state_for_revert";
      message: string;
    }
  | {
      code: "invalid_state_for_submit";
      message: string;
    }
  | {
      code: "invalid_state_for_withdraw";
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
      code: "submission_blocked_resolution";
      message: string;
      resolutionError: ProviderResolutionError;
    }
  | {
      code: "submission_outcome_unknown";
      message: string;
    }
  | {
      code: "unknown_error";
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
const RecordActionSchema = z.object({
  accountId: z.string().min(1),
  actingRole: z.string().nullable().optional(),
  actingUserId: z.string().min(1),
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
  | {
      [key: string]: JsonValue;
    };
export async function submitDraftRecord(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  assertNoTenantTransaction("submitDraftRecord");
  return await transitionLocalSubmission(input, "draft", externalWritePort);
}
export async function retrySubmission(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  assertNoTenantTransaction("retrySubmission");
  return await transitionLocalSubmission(
    input,
    "xero_sync_failed",
    externalWritePort
  );
}
async function transitionLocalSubmission(
  input: RecordActionInput,
  expectedStatus: "draft" | "xero_sync_failed",
  externalWritePort: ExternalWritePort
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Invalid submission request.");
  }
  const invalidCode =
    expectedStatus === "draft"
      ? "invalid_state_for_submit"
      : "invalid_state_for_retry";
  try {
    const authorised = await withTenantResult(parsed.data.accountId, (db) =>
      loadAndAuthorise(parsed.data, "manager_allowed", db)
    );
    if (!authorised.ok) {
      return authorised;
    }
    const record = authorised.value;
    if (
      record.source_type !== "team_calendar_leave" ||
      record.source_remote_id ||
      record.approval_status !== expectedStatus ||
      (expectedStatus === "xero_sync_failed" &&
        record.failed_action !== "submit")
    ) {
      return invalidState(invalidCode);
    }
    if (!isXeroLeaveType(record.record_type)) {
      return {
        error: {
          code: "not_a_leave_type",
          message: "Only leave records can be submitted for approval.",
        },
        ok: false,
      };
    }
    if (
      await withTenantDb(
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
      )
    ) {
      return submissionOutcomeUnknown();
    }
    const organisation = await withTenantDb(input.accountId, (db) =>
      db.organisation.findFirst({
        select: { country_code: true },
        where: { account_id: input.accountId, id: input.organisationId },
      })
    );
    if (organisation?.country_code !== "AU") {
      return {
        error: {
          code: "not_a_leave_type",
          message:
            "Leave submission is currently available for Australian payroll organisations only.",
        },
        ok: false,
      };
    }
    // Keep mapping, connection and working-day validation before accepting the
    // local request. Payroll creation occurs only after manager approval.
    const prepared = await prepareXeroWrite(input, record, externalWritePort);
    if (!prepared.ok) {
      return prepared;
    }
    const notificationId = await withTenantDb(input.accountId, async (tx) => {
      const updated = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "submitted",
          derived_sequence: { increment: 1 },
          failed_action: null,
          submitted_at: new Date(),
          updated_by_user_id: input.actingUserId,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(input),
          approval_status: expectedStatus,
          archived_at: null,
          derived_sequence: record.derived_sequence,
          failed_action:
            expectedStatus === "xero_sync_failed" ? "submit" : null,
          id: record.id,
          source_remote_id: null,
          ...unclaimedOrExpiredXeroWriteWhere(),
          ...noUnresolvedSubmitOperationWhere(),
        },
      });
      if (updated.count !== 1) {
        throw new OptimisticConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(input, "availability_records.submitted", {
          contractVersion: "au-contract-v1",
        }),
      });
      return await notifyManager(tx, input, record, "leave_submitted", {
        actionUrl: `/leave-approvals?recordId=${record.id}`,
        publishRealtime: false,
      });
    });
    if (notificationId) {
      await publishPersistedNotification({
        accountId: input.accountId,
        notificationId,
        organisationId: input.organisationId,
      }).catch((error: unknown) => {
        log.error("Failed to publish committed manager notification", {
          accountId: input.accountId,
          error: error instanceof Error ? error.message : "Unknown error",
          notificationId,
          organisationId: input.organisationId,
        });
      });
    }
    await materialiseSubmitPublication(input);
    const updated = await withTenantDb(input.accountId, (db) =>
      loadBareRecord(input, db)
    );
    return updated ? { ok: true, value: updated } : recordNotFound();
  } catch (error) {
    return error instanceof OptimisticConflictError
      ? invalidState(invalidCode)
      : unknownError("Failed to submit this record.");
  }
}
// The approver service checks manager scope before invoking the provider create.
// The durable operation is an approval, even though the provider port calls its create method submit.
export async function createLeaveOnApproval(
  input: RecordActionInput & {
    actingPersonId: string | null;
  },
  externalWritePort: ExternalWritePort,
  retry = false
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  assertNoTenantTransaction("createLeaveOnApproval");
  return await performApprovalCreation(input, externalWritePort, {
    actingPersonId: input.actingPersonId,
    failureAuditAction: retry
      ? "availability_records.approval_retry_failed"
      : "availability_records.approval_failed",
    invalidStateCode: retry
      ? "invalid_state_for_retry"
      : "invalid_state_for_submit",
    successAuditAction: retry
      ? "availability_records.approval_retry_succeeded"
      : "availability_records.approved",
    validStatus: retry ? "xero_sync_failed" : "submitted",
  });
}
export async function revertToDraft(
  input: RecordActionInput
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  assertNoTenantTransaction("revertToDraft");
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Invalid submission request.");
  }
  try {
    const authorised = await withTenantResult(parsed.data.accountId, (db) =>
      loadAndAuthorise(parsed.data, "manager_allowed", db)
    );
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
      await withTenantDb(
        {
          accountId: parsed.data.accountId,
          availabilityRecordId: authorised.value.id,
          organisationId: parsed.data.organisationId,
        }.accountId,
        (db) =>
          hasUnresolvedSubmitOperation(
            {
              accountId: parsed.data.accountId,
              availabilityRecordId: authorised.value.id,
              organisationId: parsed.data.organisationId,
            },
            db
          )
      )
    ) {
      return submissionOutcomeUnknown();
    }
    await withTenantDb(parsed.data.accountId, async (tx) => {
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
    const updated = await withTenantDb(parsed.data.accountId, (db) =>
      loadBareRecord(parsed.data, db)
    );
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep local withdrawal and journalled remote withdrawal uncertainty beside their scoped transitions.
export async function withdrawSubmission(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort
): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  assertNoTenantTransaction("withdrawSubmission");
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Invalid submission request.");
  }
  let claimedAt: Date | null = null;
  let journalAttempt:
    | import("@repo/database").OutboundOperationAttemptScope
    | null = null;
  try {
    const authorised = await withTenantResult(parsed.data.accountId, (db) =>
      loadAndAuthorise(parsed.data, "owner_only", db)
    );
    if (!authorised.ok) {
      return authorised;
    }
    const record = authorised.value;
    if (
      record.approval_status === "withdrawn" &&
      (
        await withTenantDb(
          {
            accountId: input.accountId,
            action: "withdraw",
            availabilityRecordId: record.id,
            organisationId: input.organisationId,
          }.accountId,
          (db) =>
            getSubmitOperation(
              {
                accountId: input.accountId,
                action: "withdraw",
                availabilityRecordId: record.id,
                organisationId: input.organisationId,
              },
              db
            )
        )
      )?.status === "completed"
    ) {
      return { ok: true, value: record };
    }
    if (!canWithdrawRecord(record)) {
      return invalidState("invalid_state_for_withdraw");
    }
    if (
      !record.source_remote_id &&
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
      ))
    ) {
      return submissionOutcomeUnknown();
    }
    const prepared = record.source_remote_id
      ? await prepareXeroWrite(parsed.data, record, externalWritePort)
      : null;
    if (prepared && !prepared.ok) {
      return prepared;
    }
    const journal =
      record.source_remote_id && prepared?.ok
        ? await prepareJournaledWrite(
            {
              action: "withdraw",
              actorUserId: parsed.data.actingUserId,
              ...parsed.data,
              employeeId: prepared.value.xeroEmployeeId,
              endsAt: record.ends_at,
              expectedFailedAction:
                record.failed_action === "withdraw" ? "withdraw" : null,
              expectedSequence: record.derived_sequence,
              expectedStatus: record.approval_status,
              remoteId: record.source_remote_id,
              startsAt: record.starts_at,
              title: record.title,
              units: 0,
            },
            externalWritePort
          )
        : null;
    if (journal && !journal.ok) {
      return submissionOutcomeUnknown();
    }
    if (journal?.ok) {
      journalAttempt = {
        accountId: parsed.data.accountId,
        action: "withdraw",
        attemptGeneration: journal.value.attemptGeneration,
        availabilityRecordId: record.id,
        organisationId: parsed.data.organisationId,
      };
    }
    const phaseInput1 = {
      ...parsed.data,
      expectedFailedAction: record.failed_action,
      expectedSequence: record.derived_sequence,
      expectedStatus: record.approval_status,
      localAction: "withdraw",
    } satisfies Parameters<typeof acquireXeroWriteClaim>[0];
    claimedAt = journal?.ok
      ? journal.value.claimedAt
      : await withTenantDb(phaseInput1.accountId, (db) =>
          acquireXeroWriteClaim(phaseInput1, db)
        );
    if (!claimedAt) {
      return invalidState("invalid_state_for_withdraw");
    }
    const ownerClaim = claimedAt;
    const xeroLeaveApplicationId = record.source_remote_id;
    if (xeroLeaveApplicationId) {
      const response =
        journal?.ok && journal.value.providerAccepted
          ? { ok: true as const, value: undefined }
          : await externalWritePort.withdrawLeaveApplication({
              accountId: parsed.data.accountId,
              employeeId: prepared?.ok ? prepared.value.xeroEmployeeId : "",
              mutation: journal?.ok ? journal.value.mutation : undefined,
              organisationId: parsed.data.organisationId,
              remoteId: xeroLeaveApplicationId,
            });
      if (
        !(journal?.ok && journal.value.providerAccepted) &&
        journalAttempt &&
        !(await recordXeroWriteOutcome(
          journalAttempt,
          response,
          xeroLeaveApplicationId,
          journal?.ok ? journal.value.replayedUnknown : false
        ))
      ) {
        throw new Error("Xero journal outcome changed.");
      }
      if (!response.ok) {
        return await persistXeroFailure({
          actionUrl: `/plans?recordId=${record.id}`,
          auditAction: "availability_records.withdrawal_failed",
          claimedAt: ownerClaim,
          error: response.error,
          expectedStatus: record.approval_status,
          failedAction: "withdraw",
          input: parsed.data,
          preserveApproved:
            record.approval_status === "approved" &&
            !(journal?.ok && journal.value.replayedUnknown) &&
            isDefinitiveWriteFailure(response.error),
          record,
        });
      }
    }
    await withTenantDb(parsed.data.accountId, async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "withdrawn",
          derived_sequence: { increment: 1 },
          failed_action: null,
          updated_by_user_id: journal?.ok
            ? journal.value.actorUserId
            : parsed.data.actingUserId,
          withdrawn_at: new Date(),
          xero_write_claimed_at: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scoped(parsed.data),
          approval_status: record.approval_status,
          derived_sequence: record.derived_sequence,
          id: record.id,
          xero_write_claimed_at: ownerClaim,
        },
      });
      if (update.count !== 1) {
        throw new OptimisticConflictError();
      }
      await tx.auditEvent.create({
        data: auditData(
          {
            ...parsed.data,
            actingUserId: journal?.ok
              ? journal.value.actorUserId
              : parsed.data.actingUserId,
          },
          "availability_records.withdrawn",
          {
            ...(xeroLeaveApplicationId ? { xeroLeaveApplicationId } : {}),
          }
        ),
      });
    });
    if (journal?.ok && journalAttempt) {
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
          recipient: null,
          recordId: record.id,
        }))
      ) {
        return submissionOutcomeUnknown();
      }
    } else {
      await notifyManagerBestEffort(parsed.data, record, "leave_withdrawn", {
        actionUrl: `/leave-approvals?recordId=${record.id}`,
      });
    }
    const updated = await withTenantDb(parsed.data.accountId, (db) =>
      loadBareRecord(parsed.data, db)
    );
    if (!updated) {
      return recordNotFound();
    }
    if (!journalAttempt) {
      await materialiseSubmitPublication(parsed.data);
    }
    return { ok: true, value: updated };
  } catch (error) {
    if (claimedAt) {
      const phaseInput2 = { ...parsed.data, claimedAt } satisfies Parameters<
        typeof releaseXeroWriteClaim
      >[0];
      await withTenantDb(phaseInput2.accountId, (db) =>
        releaseXeroWriteClaim(phaseInput2, db)
      );
    }
    if (error instanceof OptimisticConflictError) {
      return invalidState("invalid_state_for_withdraw");
    }
    return unknownError("Failed to withdraw this submission.");
  }
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Submission deliberately keeps durable operation transitions beside the synchronous provider call so reviewers can verify every uncertainty edge in one ordered path.
async function performApprovalCreation(
  input: RecordActionInput,
  externalWritePort: ExternalWritePort,
  options: {
    actingPersonId: string | null;
    failureAuditAction: string;
    invalidStateCode: "invalid_state_for_retry" | "invalid_state_for_submit";
    successAuditAction: string;
    validStatus: "submitted" | "xero_sync_failed";
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
    record = await withTenantDb(parsed.data.accountId, (db) =>
      loadScopedRecord(parsed.data, db)
    );
    if (!record) {
      return recordNotFound();
    }
    const actingPerson = await withTenantDb(input.accountId, (db) =>
      db.person.findFirst({
        select: { id: true },
        where: {
          account_id: input.accountId,
          archived_at: null,
          organisation: {
            account_id: input.accountId,
            archived_at: null,
            is_active: true,
          },
          user_id: input.actingUserId,
        },
      })
    );
    if (!isAdminOrOwner(input.actingRole)) {
      if (
        !(
          hasPermission(input.actingRole, { plans: ["manageReports"] }) &&
          actingPerson
        ) ||
        actingPerson.id !== options.actingPersonId
      ) {
        return {
          error: {
            code: "not_authorised",
            message: "Manager approval is required.",
          },
          ok: false,
        };
      }
      const phaseInput3 = {
        ...input,
        actingPersonId: actingPerson.id,
        excludeSelf: true,
      } satisfies Parameters<typeof managerScopePersonIds>[0];
      const ids = await withTenantDb(phaseInput3.accountId, (db) =>
        managerScopePersonIds(phaseInput3, db)
      );
      if (!ids.includes(record.person_id)) {
        return {
          error: {
            code: "not_authorised",
            message: "Manager approval is required.",
          },
          ok: false,
        };
      }
    }
    const currentRecordId = record.id;
    if (
      record.approval_status === "approved" &&
      (
        await withTenantDb(
          {
            accountId: input.accountId,
            action: "approve",
            availabilityRecordId: currentRecordId,
            organisationId: input.organisationId,
          }.accountId,
          (db) =>
            getSubmitOperation(
              {
                accountId: input.accountId,
                action: "approve",
                availabilityRecordId: currentRecordId,
                organisationId: input.organisationId,
              },
              db
            )
        )
      )?.status === "completed"
    ) {
      return { ok: true, value: record };
    }
    if (
      record.source_type !== "team_calendar_leave" ||
      record.source_remote_id !== null ||
      record.approval_status !== options.validStatus ||
      (options.validStatus === "xero_sync_failed" &&
        record.failed_action !== "approve")
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
    const organisation = await withTenantDb(input.accountId, (db) =>
      db.organisation.findFirst({
        select: { country_code: true },
        where: { account_id: input.accountId, id: input.organisationId },
      })
    );
    if (organisation?.country_code !== "AU") {
      return {
        error: {
          code: "not_a_leave_type",
          message:
            "Leave approval creation is currently available for Australian payroll organisations only.",
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
      accountId: parsed.data.accountId,
      action: "approve" as const,
      availabilityRecordId: record.id,
      organisationId: parsed.data.organisationId,
    };
    const journal = await prepareJournaledWrite(
      {
        action: "approve",
        actorUserId: parsed.data.actingUserId,
        ...parsed.data,
        employeeId: prepared.value.xeroEmployeeId,
        endsAt: record.ends_at,
        expectedFailedAction:
          options.validStatus === "xero_sync_failed" ? "approve" : null,
        expectedSequence: record.derived_sequence,
        expectedStatus: options.validStatus,
        leaveTypeId: prepared.value.xeroLeaveTypeId,
        requestFingerprint: submitRequestFingerprint({
          employeeId: prepared.value.xeroEmployeeId,
          endsAt: record.ends_at,
          leaveTypeId: prepared.value.xeroLeaveTypeId,
          startsAt: record.starts_at,
          title: record.title ?? "Leave request",
          units: prepared.value.units,
        }),
        startsAt: record.starts_at,
        title: record.title ?? "Leave request",
        units: prepared.value.units,
      },
      externalWritePort
    );
    if (!journal.ok) {
      return submissionOutcomeUnknown();
    }
    const preparedOperation = journal.value;
    ({ attemptGeneration, claimedAt } = preparedOperation);
    const operationAttempt = { ...operationScope, attemptGeneration };
    dispatchStarted = !preparedOperation.providerAccepted;
    let submission: Awaited<
      ReturnType<ExternalWritePort["submitLeaveApplication"]>
    >;
    try {
      submission =
        preparedOperation.providerAccepted && preparedOperation.knownRemoteId
          ? {
              ok: true,
              value: {
                rawResponse: {},
                remoteId: preparedOperation.knownRemoteId,
              },
            }
          : await externalWritePort.submitLeaveApplication({
              accountId: parsed.data.accountId,
              employeeId: prepared.value.xeroEmployeeId,
              endsAt: record.ends_at,
              leaveTypeId: prepared.value.xeroLeaveTypeId,
              mutation: preparedOperation.mutation,
              organisationId: parsed.data.organisationId,
              startsAt: record.starts_at,
              title: record.title ?? "Leave request",
              units: prepared.value.units,
            });
    } catch {
      await withTenantDb(operationAttempt.accountId, (db) =>
        markSubmitOutcomeUnknown(operationAttempt, "transport_exception", db)
      );
      const phaseInput4 = { ...parsed.data, claimedAt } satisfies Parameters<
        typeof releaseXeroWriteClaim
      >[0];
      await withTenantDb(phaseInput4.accountId, (db) =>
        releaseXeroWriteClaim(phaseInput4, db)
      );
      claimedAt = null;
      return submissionOutcomeUnknown();
    }
    if (!submission.ok) {
      if (
        !preparedOperation.replayedUnknown &&
        isDefinitiveWriteFailure(submission.error)
      ) {
        await withTenantDb(operationAttempt.accountId, (db) =>
          markSubmitDefinitiveFailure(
            operationAttempt,
            submission.error.code,
            db
          )
        );
      } else {
        await withTenantDb(operationAttempt.accountId, (db) =>
          markSubmitOutcomeUnknown(operationAttempt, submission.error.code, db)
        );
      }
      return await persistXeroFailure({
        actionUrl: `/plans?recordId=${record.id}`,
        auditAction: options.failureAuditAction,
        claimedAt,
        error: submission.error,
        expectedStatus: options.validStatus,
        failedAction: "approve",
        input: parsed.data,
        record,
      });
    }
    const accepted =
      preparedOperation.providerAccepted ||
      (await withTenantDb(operationAttempt.accountId, (db) =>
        markSubmitProviderAccepted(
          operationAttempt,
          submission.value.remoteId,
          db
        )
      ));
    if (!accepted) {
      return submissionOutcomeUnknown();
    }
    // `record` is a `let` narrowed above; alias it to a const so the
    // transaction closure (evaluated later, from TypeScript's perspective)
    // keeps the non-null type instead of widening back to LoadedRecord | null.
    const claimedRecord = record;
    const originalApproverId =
      preparedOperation.actorUserId === parsed.data.actingUserId
        ? (actingPerson?.id ?? null)
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
                    is_active: true,
                  },
                  user_id: preparedOperation.actorUserId,
                },
              })
            )
          )?.id ?? null);
    await withTenantDb(parsed.data.accountId, async (tx) => {
      const update = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: "approved",
          approved_at: new Date(),
          approved_by_person_id: originalApproverId,
          derived_sequence: { increment: 1 },
          failed_action: null,
          source_payload_json: toPrismaJsonValue(submission.value.rawResponse),
          source_remote_id: submission.value.remoteId,
          updated_by_user_id: preparedOperation.actorUserId,
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
        data: auditData(
          { ...parsed.data, actingUserId: preparedOperation.actorUserId },
          options.successAuditAction,
          {
            xeroLeaveApplicationId: submission.value.remoteId,
          }
        ),
      });
    });
    claimedAt = null;
    const sideEffectClaimedAt = await withTenantDb(
      operationAttempt.accountId,
      (db) =>
        acquireSubmitRecoverySideEffects(
          operationAttempt,
          new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS),
          db
        )
    );
    if (!sideEffectClaimedAt) {
      return submissionOutcomeUnknown();
    }
    const sideEffects = await completeSubmitSideEffects({
      accountId: parsed.data.accountId,
      actorUserId: preparedOperation.actorUserId,
      approvalRecipient: record.person.user_id
        ? {
            personId: record.person.id,
            userId: record.person.user_id,
          }
        : null,
      attempt: operationAttempt,
      claimedAt: sideEffectClaimedAt,
      manager: record.person.manager?.user_id
        ? {
            personId: record.person.manager.id,
            userId: record.person.manager.user_id,
          }
        : null,
      notifyManager: false,
      organisationId: parsed.data.organisationId,
      recordId: record.id,
    });
    if (!sideEffects.ok) {
      await withTenantDb(operationAttempt.accountId, (db) =>
        releaseSubmitRecoverySideEffects(
          operationAttempt,
          sideEffectClaimedAt,
          db
        )
      );
      return submissionOutcomeUnknown();
    }
    if (
      !(await withTenantDb(parsed.data.accountId, (db) =>
        markSubmitCompleted(operationAttempt, db)
      ))
    ) {
      return submissionOutcomeUnknown();
    }
    const updated = await withTenantDb(parsed.data.accountId, (db) =>
      loadBareRecord(parsed.data, db)
    );
    if (!updated) {
      return recordNotFound();
    }
    return { ok: true, value: updated };
  } catch (error) {
    if (record && dispatchStarted && attemptGeneration !== null) {
      const phaseInput5 = {
        accountId: parsed.data.accountId,
        action: "approve" as const,
        attemptGeneration,
        availabilityRecordId: record.id,
        organisationId: parsed.data.organisationId,
      } satisfies Parameters<typeof markSubmitOutcomeUnknown>[0];
      await withTenantDb(phaseInput5.accountId, (db) =>
        markSubmitOutcomeUnknown(phaseInput5, "local_persistence_failure", db)
      );
    }
    if (claimedAt) {
      const phaseInput6 = { ...parsed.data, claimedAt } satisfies Parameters<
        typeof releaseXeroWriteClaim
      >[0];
      await withTenantDb(phaseInput6.accountId, (db) =>
        releaseXeroWriteClaim(phaseInput6, db)
      );
    }
    if (error instanceof OptimisticConflictError) {
      return invalidState(options.invalidStateCode);
    }
    return unknownError("Failed to approve this record.");
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
      "Xero may have received this leave action. An administrator must resolve it before another action can be attempted.",
  },
  ok: false,
});
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
  const xeroConnectionState = xeroStateResult.value.state;
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
    return {
      error: {
        code: "xero_not_connected",
        message:
          "Xero is not connected. Ask an administrator to reconnect Xero before continuing this leave action.",
      },
      ok: false,
    };
  }
  const employee = await externalWritePort.resolveEmployeeId({
    accountId: input.accountId,
    organisationId: input.organisationId,
    personId: record.person_id,
  });
  if (!employee.ok) {
    return resolutionBlocked(employee.error);
  }
  const leaveType = await externalWritePort.resolveLeaveTypeId({
    accountId: input.accountId,
    organisationId: input.organisationId,
    personId: record.person_id,
    recordType: record.record_type,
  });
  if (!leaveType.ok) {
    return resolutionBlocked(leaveType.error);
  }
  const phaseInput7 = {
    accountId: input.accountId,
    allDay: record.all_day,
    endsAt: record.ends_at,
    locationId: record.person.location_id,
    organisationId: input.organisationId,
    startsAt: record.starts_at,
  } satisfies Parameters<typeof computeWorkingDays>[0];
  const duration = await withTenantResult(phaseInput7.accountId, (db) =>
    computeWorkingDays(phaseInput7, db)
  );
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
  failedAction: "submit" | "approve" | "withdraw";
  input: RecordActionInput;
  claimedAt: Date;
  preserveApproved?: boolean;
  record: LoadedRecord;
  error: ProviderWriteError;
}): Promise<Result<AvailabilityRecord, SubmitServiceError>> {
  const plainMessage = input.error.userMessage;
  await withTenantDb(input.input.accountId, async (tx) => {
    const update = await tx.availabilityRecord.updateMany({
      data: {
        approval_status: input.preserveApproved
          ? "approved"
          : "xero_sync_failed",
        failed_action: input.failedAction,
        updated_by_user_id: input.input.actingUserId,
        xero_write_claimed_at: null,
        xero_write_error: plainMessage,
        xero_write_error_raw: {
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
  const updated = await withTenantDb(input.input.accountId, (db) =>
    loadBareRecord(input.input, db)
  );
  if (!updated) {
    return recordNotFound();
  }
  await materialiseSubmitPublication(input.input);
  return { ok: true, value: updated };
}
async function loadScopedRecord(input: RecordActionInput, db: TenantDb) {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;
    return await client.availabilityRecord.findFirst({
      include: {
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
            user_id: true,
          },
        },
      },
      where: {
        ...scoped(input),
        id: input.recordId,
      },
    });
  }
}
async function loadBareRecord(input: RecordActionInput, db: TenantDb) {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;
    return await client.availabilityRecord.findFirst({
      where: {
        ...scoped(input),
        id: input.recordId,
      },
    });
  }
}
async function materialiseSubmitPublication(
  input: RecordActionInput
): Promise<void> {
  const phaseInput8 = {
    accountId: input.accountId,
    availabilityRecordId: input.recordId,
    organisationId: input.organisationId,
  } satisfies Parameters<typeof materialiseAvailabilityPublication>[0];
  const publication = await withTenantResult(
    phaseInput8.accountId,
    (db) => materialiseAvailabilityPublication(phaseInput8, db),
    TENANT_READ_TRANSACTION_OPTIONS
  );
  if (!publication.ok) {
    // Best-effort: the submit/withdraw transition is already persisted. Log the
    // failed feed projection rather than failing the write; it is corrected on
    // the next successful materialisation for the record.
    log.error("Failed to materialise availability publication", {
      accountId: input.accountId,
      availabilityRecordId: input.recordId,
      error: publication.error.message,
      organisationId: input.organisationId,
    });
  }
}
async function loadAndAuthorise(
  input: RecordActionInput,
  mode: "manager_allowed" | "owner_only",
  db: TenantDb
): Promise<Result<LoadedRecord, SubmitServiceError>> {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    const companies = await resolveAccountCompanies(input.accountId, client);
    const [record, actingPerson] = [
      await loadScopedRecord(input, client),
      await client.person.findFirst({
        select: { id: true },
        where: {
          account_id: input.accountId,
          archived_at: null,
          organisation_id: { in: companies.map((company) => company.id) },
          user_id: input.actingUserId,
        },
      }),
    ];
    if (!record) {
      return recordNotFound();
    }
    const isOwner = record.person.user_id === input.actingUserId;
    const isManager =
      Boolean(actingPerson) &&
      record.person.manager_person_id === actingPerson?.id;
    const isAllowed =
      isAdminOrOwner(input.actingRole) ||
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
}
async function notifyManager(
  tx: TenantDb,
  input: RecordActionInput,
  record: LoadedRecord,
  type: "leave_submitted" | "leave_withdrawn",
  options: {
    actionUrl: string;
    publishRealtime?: boolean;
  }
) {
  const recipientUserId = record.person.manager?.user_id;
  if (!recipientUserId) {
    return;
  }
  const result = await dispatchNotification(
    {
      accountId: input.accountId,
      actionUrl: options.actionUrl,
      actorUserId: input.actingUserId,
      body:
        type === "leave_submitted"
          ? `${record.person.first_name} ${record.person.last_name} submitted leave for approval.`
          : `${record.person.first_name} ${record.person.last_name} withdrew a submitted leave request.`,
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
    { publishRealtime: options.publishRealtime },
    tx
  );
  if (!result.ok) {
    throw new NotificationCreateError();
  }
  return result.value.notificationId;
}
async function notifyManagerBestEffort(
  input: RecordActionInput,
  record: LoadedRecord,
  type: "leave_submitted" | "leave_withdrawn",
  options: {
    actionUrl: string;
  }
): Promise<void> {
  try {
    await withTenantDb(input.accountId, (db) =>
      notifyManager(db, input, record, type, options)
    );
  } catch (error) {
    log.error("Failed to dispatch manager notification", {
      accountId: input.accountId,
      availabilityRecordId: record.id,
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
  options: {
    actionUrl: string;
  }
): Promise<void> {
  try {
    await withTenantDb(input.accountId, (db) =>
      notifyOwnerAndManager(db, input, record, type, options)
    );
  } catch (error) {
    log.error("Failed to dispatch failure notification", {
      accountId: input.accountId,
      availabilityRecordId: record.id,
      error: error instanceof Error ? error.message : "Unknown error",
      organisationId: input.organisationId,
      type,
    });
  }
}
async function notifyOwnerAndManager(
  tx: TenantDb,
  input: RecordActionInput,
  record: LoadedRecord,
  type: "leave_xero_sync_failed",
  options: {
    actionUrl: string;
  }
) {
  const recipients = [
    {
      personId: record.person.id,
      userId: record.person.user_id,
    },
    {
      personId: record.person.manager?.id ?? null,
      userId: record.person.manager?.user_id ?? null,
    },
  ].filter(
    (
      recipient
    ): recipient is {
      personId: string | null;
      userId: string;
    } => Boolean(recipient.userId)
  );
  const seen = new Set<string>();
  for (const recipient of recipients) {
    if (seen.has(recipient.userId)) {
      continue;
    }
    seen.add(recipient.userId);
    const result = await dispatchNotification(
      {
        accountId: input.accountId,
        actionUrl: options.actionUrl,
        actorUserId: input.actingUserId,
        body: "Xero could not sync this leave action. Review the record and try again.",
        objectId: record.id,
        objectType: "availability_record",
        organisationId: input.organisationId,
        recipientPersonId: recipient.personId,
        recipientUserId: recipient.userId,
        title: "Xero sync failed",
        type,
      },
      {},
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
    account_id: input.accountId,
    action,
    actor_user_id: input.actingUserId,
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
  return hasPermission(role, { plans: ["manageAll"] });
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
function canWithdrawRecord(record: LoadedRecord): boolean {
  if (record.source_type !== "team_calendar_leave") {
    return false;
  }
  if (record.approval_status === "submitted") {
    return true;
  }
  if (!record.source_remote_id) {
    return false;
  }
  return (
    record.approval_status === "approved" ||
    (record.approval_status === "xero_sync_failed" &&
      record.failed_action === "withdraw")
  );
}
