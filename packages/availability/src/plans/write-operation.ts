import "server-only";
import { createHash } from "node:crypto";
import type {
  ExternalWritePort,
  ProviderMutationRequest,
  ProviderWriteError,
  Result,
} from "@repo/core";
import {
  acquireSubmitRecoverySideEffects,
  markSubmitCompleted,
  markSubmitDefinitiveFailure,
  markSubmitDispatchStarted,
  markSubmitOutcomeUnknown,
  markSubmitProviderAccepted,
  type OutboundOperationAttemptScope,
  type PreparedSubmitOperation,
  prepareAndClaimSubmitOperation,
  releaseSubmitRecoverySideEffects,
  withTenantDb,
} from "@repo/database";
import type { availability_approval_status } from "@repo/database/generated/enums";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import {
  releaseXeroWriteClaim,
  XERO_WRITE_CLAIM_LEASE_MS,
} from "../xero-write-claim";
import { completeSubmitSideEffects } from "./submit-side-effects";

export interface PrepareXeroWriteInput {
  accountId: string;
  action: "approve" | "decline" | "withdraw";
  actorUserId: string;
  employeeId: string;
  endsAt: Date;
  expectedFailedAction: "approve" | "decline" | "withdraw" | null;
  expectedSequence: number;
  expectedStatus: availability_approval_status;
  leaveTypeId?: string;
  organisationId: string;
  reason?: string;
  recordId: string;
  remoteId?: string | null;
  requestFingerprint?: string;
  startsAt: Date;
  title: string | null;
  units: number;
}
const unknownOutcome: ProviderWriteError = {
  certainty: "outcome_unknown",
  code: "outcome_unknown",
  message: "This Xero operation requires recovery.",
  recoveryReason: "outcome_unknown",
  userMessage:
    "Xero may have received this leave action. An administrator must resolve it before another action can be attempted.",
};
export async function prepareXeroWrite(
  input: PrepareXeroWriteInput,
  port: ExternalWritePort
): Promise<Result<PreparedSubmitOperation, ProviderWriteError>> {
  assertNoTenantTransaction("prepareXeroWrite");
  const descriptor = await port.prepareLeaveMutation({
    accountId: input.accountId,
    action: input.remoteId ? input.action : "create",
    employeeId: input.employeeId,
    endsAt: input.endsAt,
    leaveTypeId: input.leaveTypeId,
    organisationId: input.organisationId,
    reason: input.reason,
    remoteId: input.remoteId ?? undefined,
    startsAt: input.startsAt,
    title: input.title ?? "Leave request",
    units: input.units,
  });
  if (!descriptor.ok) {
    return descriptor;
  }
  const prepared = await prepareAndClaimSubmitOperation({
    accountId: input.accountId,
    action: input.action,
    actorUserId: input.actorUserId,
    availabilityRecordId: input.recordId,
    claimableBefore: new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS),
    expectedFailedAction: input.expectedFailedAction,
    expectedSequence: input.expectedSequence,
    expectedStatus: input.expectedStatus,
    organisationId: input.organisationId,
    remoteId: input.remoteId,
    request: descriptor.value,
    requestEmployeeId: input.employeeId,
    requestEndsAt: input.endsAt,
    requestFingerprint:
      input.requestFingerprint ?? mutationRequestFingerprint(descriptor.value),
    requestLeaveTypeId: input.leaveTypeId ?? "",
    requestReason: input.reason ?? null,
    requestStartsAt: input.startsAt,
    requestTitle: input.title,
    requestUnits: input.units,
  });
  if (!prepared) {
    return { error: unknownOutcome, ok: false };
  }
  const attempt = {
    accountId: input.accountId,
    action: input.action,
    attemptGeneration: prepared.attemptGeneration,
    availabilityRecordId: input.recordId,
    organisationId: input.organisationId,
  };
  if (
    !(
      prepared.providerAccepted ||
      (await withTenantDb(
        {
          accountId: input.accountId,
          action: input.action,
          attemptGeneration: prepared.attemptGeneration,
          availabilityRecordId: input.recordId,
          organisationId: input.organisationId,
        }.accountId,
        (db) =>
          markSubmitDispatchStarted(
            {
              accountId: input.accountId,
              action: input.action,
              attemptGeneration: prepared.attemptGeneration,
              availabilityRecordId: input.recordId,
              organisationId: input.organisationId,
            },
            prepared.mutation,
            db
          )
      ))
    )
  ) {
    if (prepared.replayedUnknown) {
      await withTenantDb(attempt.accountId, (db) =>
        markSubmitOutcomeUnknown(attempt, "replay_not_dispatched", db)
      );
    }
    const phaseInput1 = {
      accountId: input.accountId,
      claimedAt: prepared.claimedAt,
      organisationId: input.organisationId,
      recordId: input.recordId,
    } satisfies Parameters<typeof releaseXeroWriteClaim>[0];
    await withTenantDb(phaseInput1.accountId, (db) =>
      releaseXeroWriteClaim(phaseInput1, db)
    );
    return { error: unknownOutcome, ok: false };
  }
  return { ok: true, value: prepared };
}
export async function recordXeroWriteOutcome(
  scope: OutboundOperationAttemptScope,
  outcome: Result<unknown, ProviderWriteError>,
  remoteId?: string,
  preserveUncertainty = false
): Promise<boolean> {
  assertNoTenantTransaction("recordXeroWriteOutcome");
  if (outcome.ok) {
    return remoteId
      ? await withTenantDb(scope.accountId, (db) =>
          markSubmitProviderAccepted(scope, remoteId, db)
        )
      : false;
  }
  const { error } = outcome;
  if (preserveUncertainty) {
    return await withTenantDb(scope.accountId, (db) =>
      markSubmitOutcomeUnknown(scope, error.code, db)
    );
  }
  return isDefinitiveWriteFailure(error)
    ? await withTenantDb(scope.accountId, (db) =>
        markSubmitDefinitiveFailure(scope, error.code, db)
      )
    : await withTenantDb(scope.accountId, (db) =>
        markSubmitOutcomeUnknown(scope, error.code, db)
      );
}

export const isDefinitiveWriteFailure = (error: ProviderWriteError): boolean =>
  error.certainty === "definitive_failure" ||
  error.dispatchPhase === "before_dispatch" ||
  (error.certainty === undefined &&
    error.recoveryReason !== "outcome_unknown" &&
    [
      "auth_error",
      "conflict_error",
      "not_found_error",
      "permission_error",
      "rate_limit_error",
      "region_not_supported_error",
      "validation_error",
    ].includes(error.code));

export async function completeXeroWriteSideEffects(input: {
  actorUserId: string;
  declineReason?: string | null;
  attempt: OutboundOperationAttemptScope;
  accountId: string;
  organisationId: string;
  recordId: string;
  recipient: { userId: string; personId: string } | null;
  manager: { userId: string; personId: string } | null;
}): Promise<boolean> {
  assertNoTenantTransaction("completeXeroWriteSideEffects");
  const claimedAt = await withTenantDb(input.attempt.accountId, (db) =>
    acquireSubmitRecoverySideEffects(
      input.attempt,
      new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS),
      db
    )
  );
  if (!claimedAt) {
    return false;
  }
  const outcome = await completeSubmitSideEffects({
    ...input,
    approvalRecipient:
      input.attempt.action === "withdraw" ? null : input.recipient,
    claimedAt,
    notifyManager: input.attempt.action === "withdraw",
  });
  if (!outcome.ok) {
    await withTenantDb(input.attempt.accountId, (db) =>
      releaseSubmitRecoverySideEffects(input.attempt, claimedAt, db)
    );
    return false;
  }
  return await withTenantDb(input.accountId, (db) =>
    markSubmitCompleted(input.attempt, db)
  );
}

export const mutationRequestFingerprint = (
  request: ProviderMutationRequest
): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        request.xeroTenantId,
        request.method,
        request.url,
        request.body,
      ])
    )
    .digest("hex");
