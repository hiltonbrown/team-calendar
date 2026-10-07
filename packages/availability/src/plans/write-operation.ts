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
  database,
  markSubmitCompleted,
  markSubmitDefinitiveFailure,
  markSubmitDispatchStarted,
  markSubmitOutcomeUnknown,
  markSubmitProviderAccepted,
  type OutboundOperationAttemptScope,
  type PreparedSubmitOperation,
  prepareAndClaimSubmitOperation,
  releaseSubmitRecoverySideEffects,
} from "@repo/database";
import type { availability_approval_status } from "@repo/database/generated/enums";
import {
  releaseXeroWriteClaim,
  XERO_WRITE_CLAIM_LEASE_MS,
} from "../xero-write-claim";
import { completeSubmitSideEffects } from "./submit-side-effects";

export interface PrepareXeroWriteInput {
  action: "approve" | "decline" | "withdraw";
  actorUserId: string;
  clerkOrgId: string;
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
  const descriptor = await port.prepareLeaveMutation({
    action: input.remoteId ? input.action : "create",
    clerkOrgId: input.clerkOrgId,
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
    action: input.action,
    actorUserId: input.actorUserId,
    availabilityRecordId: input.recordId,
    claimableBefore: new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS),
    clerkOrgId: input.clerkOrgId,
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
    action: input.action,
    attemptGeneration: prepared.attemptGeneration,
    availabilityRecordId: input.recordId,
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  };
  if (
    !(
      prepared.providerAccepted ||
      (await markSubmitDispatchStarted(
        {
          action: input.action,
          attemptGeneration: prepared.attemptGeneration,
          availabilityRecordId: input.recordId,
          clerkOrgId: input.clerkOrgId,
          organisationId: input.organisationId,
        },
        prepared.mutation
      ))
    )
  ) {
    if (prepared.replayedUnknown) {
      await markSubmitOutcomeUnknown(attempt, "replay_not_dispatched");
    }
    await releaseXeroWriteClaim({
      claimedAt: prepared.claimedAt,
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
      recordId: input.recordId,
    });
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
  if (outcome.ok) {
    return remoteId ? await markSubmitProviderAccepted(scope, remoteId) : false;
  }
  const { error } = outcome;
  if (preserveUncertainty) {
    return await markSubmitOutcomeUnknown(scope, error.code);
  }
  return isDefinitiveWriteFailure(error)
    ? await markSubmitDefinitiveFailure(scope, error.code)
    : await markSubmitOutcomeUnknown(scope, error.code);
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
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
  recipient: { clerkUserId: string; personId: string } | null;
  manager: { clerkUserId: string; personId: string } | null;
}): Promise<boolean> {
  const claimedAt = await acquireSubmitRecoverySideEffects(
    input.attempt,
    new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS)
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
    await releaseSubmitRecoverySideEffects(input.attempt, claimedAt);
    return false;
  }
  return await markSubmitCompleted(input.attempt, database);
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
