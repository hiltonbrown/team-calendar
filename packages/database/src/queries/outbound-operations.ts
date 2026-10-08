import { randomUUID } from "node:crypto";
import type { ProviderMutationRequest, XeroMutationIdentity } from "@repo/core";
import type { Prisma } from "../../generated/client";
import type { availability_approval_status } from "../../generated/enums";
import { type Database, database } from "../client";
import { scopedTo } from "../tenant-query";
import { lockActiveScopedXeroConnection } from "../xero-locks";

type OperationClient = Database | Prisma.TransactionClient;

export interface OutboundOperationScope {
  action?: "approve" | "decline" | "withdraw";
  availabilityRecordId: string;
  clerkOrgId: string;
  organisationId: string;
}

export interface PrepareSubmitOperationInput extends OutboundOperationScope {
  actorUserId: string;
  claimableBefore: Date;
  expectedFailedAction: "approve" | "decline" | "withdraw" | null;
  expectedSequence: number;
  expectedStatus: availability_approval_status;
  remoteId?: string | null;
  request: ProviderMutationRequest;
  requestEmployeeId: string;
  requestEndsAt: Date;
  requestFingerprint: string;
  requestLeaveTypeId: string;
  requestReason?: string | null;
  requestStartsAt: Date;
  requestTitle: string | null;
  requestUnits: number;
}

export interface OutboundOperationAttemptScope extends OutboundOperationScope {
  attemptGeneration: number;
}

export interface PreparedSubmitOperation {
  actorUserId: string;
  attemptGeneration: number;
  claimedAt: Date;
  knownRemoteId: string | null;
  mutation: XeroMutationIdentity;
  providerAccepted: boolean;
  replayedUnknown: boolean;
  requestReason: string | null;
}

class SubmitClaimConflictError extends Error {}

export const getSubmitOperation = async (
  scope: OutboundOperationScope,
  client: OperationClient = database
) =>
  client.outboundOperation.findFirst({
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      availability_record_id: scope.availabilityRecordId,
    },
  });

export const prepareAndClaimSubmitOperation = async (
  input: PrepareSubmitOperationInput
): Promise<PreparedSubmitOperation | null> => {
  try {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep the connection guard and payroll operation claim in one atomic transaction.
    return await database.$transaction(async (tx) => {
      if (!(await lockActiveScopedXeroConnection(tx, input))) {
        throw new SubmitClaimConflictError();
      }
      const existing = await getSubmitOperation(input, tx);
      const now = new Date();
      let attemptGeneration = 1;
      let { actorUserId } = input;
      let providerAccepted = false;
      let knownRemoteId: string | null = input.remoteId ?? null;
      let mutation: XeroMutationIdentity = {
        firstDispatchedAt: now,
        idempotencyKey: randomUUID(),
        replayBefore: new Date(now.getTime() + 5 * 60_000),
        request: input.request,
      };
      const requestFields = {
        request_body_json: input.request.body,
        request_method: input.request.method,
        request_url: input.request.url,
        request_xero_tenant_id: input.request.xeroTenantId,
      };
      if (existing) {
        const sameRequest =
          existing.request_fingerprint === input.requestFingerprint &&
          existing.request_xero_tenant_id === input.request.xeroTenantId &&
          existing.request_method === input.request.method &&
          existing.request_url === input.request.url &&
          existing.request_body_json === input.request.body;
        const undispatched =
          existing.status === "prepared" &&
          existing.dispatch_started_at === null;
        const accepted = existing.status === "provider_accepted";
        const replay =
          sameRequest &&
          (undispatched ||
            accepted ||
            (existing.status === "outcome_unknown" &&
              existing.idempotency_replay_before &&
              now.getTime() < existing.idempotency_replay_before.getTime()));
        if (existing.status !== "definitive_failure" && !replay) {
          throw new SubmitClaimConflictError();
        }
        attemptGeneration = existing.attempt_generation + 1;
        if (replay) {
          if (
            !(
              existing.idempotency_key &&
              (undispatched ||
                (existing.idempotency_first_dispatched_at &&
                  existing.idempotency_replay_before))
            )
          ) {
            throw new SubmitClaimConflictError();
          }
          actorUserId = existing.actor_user_id;
          providerAccepted = accepted;
          knownRemoteId = existing.known_remote_id;
          mutation = {
            firstDispatchedAt: existing.idempotency_first_dispatched_at ?? now,
            idempotencyKey: existing.idempotency_key,
            replayBefore:
              existing.idempotency_replay_before ??
              new Date(now.getTime() + 300_000),
            request: input.request,
          };
        }
        const reset = await tx.outboundOperation.updateMany({
          data: replay
            ? {
                attempt_generation: attemptGeneration,
                idempotency_first_dispatched_at: mutation.firstDispatchedAt,
                idempotency_key: mutation.idempotencyKey,
                idempotency_replay_before: mutation.replayBefore,
                status: accepted ? "provider_accepted" : existing.status,
              }
            : {
                actor_user_id: input.actorUserId,
                attempt_generation: attemptGeneration,
                completed_at: null,
                dispatch_started_at: null,
                known_remote_id: input.remoteId ?? null,
                prepared_at: now,
                provider_accepted_at: null,
                request_employee_id: input.requestEmployeeId,
                request_ends_at: input.requestEndsAt,
                request_fingerprint: input.requestFingerprint,
                request_leave_type_id: input.requestLeaveTypeId,
                request_reason: input.requestReason ?? null,
                request_starts_at: input.requestStartsAt,
                request_title: input.requestTitle,
                request_units: input.requestUnits,
                safe_error_code: null,
                ...requestFields,
                idempotency_first_dispatched_at: null,
                idempotency_key: mutation.idempotencyKey,
                idempotency_replay_before: null,
                status: "prepared",
              },
          where: {
            ...scopedTo(input),
            attempt_generation: existing.attempt_generation,
            id: existing.id,
            status: existing.status,
            ...(undispatched ? { dispatch_started_at: null } : {}),
          },
        });
        if (reset.count !== 1) {
          throw new SubmitClaimConflictError();
        }
      } else {
        await tx.outboundOperation.create({
          data: {
            action: input.action ?? "approve",
            actor_user_id: actorUserId,
            attempt_generation: attemptGeneration,
            availability_record_id: input.availabilityRecordId,
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            request_employee_id: input.requestEmployeeId,
            request_ends_at: input.requestEndsAt,
            request_fingerprint: input.requestFingerprint,
            request_leave_type_id: input.requestLeaveTypeId,
            request_reason: input.requestReason ?? null,
            request_starts_at: input.requestStartsAt,
            request_title: input.requestTitle,
            request_units: input.requestUnits,
            ...requestFields,
            dispatch_started_at: null,
            idempotency_first_dispatched_at: null,
            idempotency_key: mutation.idempotencyKey,
            idempotency_replay_before: null,
            known_remote_id: knownRemoteId,
            status: "prepared",
          },
        });
      }

      const claimedAt = new Date();
      const claimed = await tx.availabilityRecord.updateMany({
        data: { xero_write_claimed_at: claimedAt },
        where: {
          ...scopedTo(input),
          approval_status: input.expectedStatus,
          archived_at: null,
          derived_sequence: input.expectedSequence,
          failed_action: input.expectedFailedAction,
          id: input.availabilityRecordId,
          OR: [
            { xero_write_claimed_at: null },
            { xero_write_claimed_at: { lt: input.claimableBefore } },
          ],
          outbound_operations: {
            none: {
              action: { not: input.action ?? "approve" },
              status: {
                in: ["prepared", "outcome_unknown", "provider_accepted"],
              },
            },
          },
          source_remote_id: input.remoteId ?? null,
        },
      });
      if (claimed.count !== 1) {
        throw new SubmitClaimConflictError();
      }
      return {
        actorUserId,
        attemptGeneration,
        claimedAt,
        knownRemoteId,
        mutation,
        providerAccepted,
        replayedUnknown: existing?.status === "outcome_unknown",
        requestReason:
          existing?.status !== "definitive_failure" && existing
            ? existing.request_reason
            : (input.requestReason ?? null),
      };
    });
  } catch (error) {
    if (error instanceof SubmitClaimConflictError) {
      return null;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return null;
    }
    throw error;
  }
};

export const markSubmitDispatchStarted = async (
  scope: OutboundOperationAttemptScope,
  mutation?: XeroMutationIdentity
): Promise<boolean> => {
  const operation = await getSubmitOperation(scope);
  if (!operation) {
    return false;
  }
  const firstDispatchedAt = operation.dispatch_started_at
    ? operation.idempotency_first_dispatched_at
    : new Date();
  if (!firstDispatchedAt) {
    return false;
  }
  const replayBefore = operation.dispatch_started_at
    ? operation.idempotency_replay_before
    : new Date(firstDispatchedAt.getTime() + 300_000);
  if (
    !(firstDispatchedAt && replayBefore) ||
    Date.now() >= replayBefore.getTime()
  ) {
    return false;
  }
  const updated = await database.outboundOperation.updateMany({
    data: {
      dispatch_started_at: operation.dispatch_started_at ?? firstDispatchedAt,
      idempotency_first_dispatched_at: firstDispatchedAt,
      idempotency_replay_before: replayBefore,
      status: "outcome_unknown",
    },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      status: { in: ["prepared", "outcome_unknown"] },
    },
  });
  if (updated.count === 1 && mutation) {
    mutation.firstDispatchedAt = firstDispatchedAt;
    mutation.replayBefore = replayBefore;
  }
  return updated.count === 1;
};

export const markSubmitDefinitiveFailure = async (
  scope: OutboundOperationAttemptScope,
  safeErrorCode: string,
  client: OperationClient = database
): Promise<boolean> => {
  const updated = await client.outboundOperation.updateMany({
    data: { safe_error_code: safeErrorCode, status: "definitive_failure" },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      status: { in: ["prepared", "outcome_unknown"] },
    },
  });
  return updated.count === 1;
};

export const markSubmitOutcomeUnknown = async (
  scope: OutboundOperationAttemptScope,
  safeErrorCode: string
): Promise<boolean> => {
  const updated = await database.outboundOperation.updateMany({
    data: { safe_error_code: safeErrorCode, status: "outcome_unknown" },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      dispatch_started_at: { not: null },
      status: { in: ["prepared", "outcome_unknown"] },
    },
  });
  return updated.count === 1;
};

export const markSubmitProviderAccepted = async (
  scope: OutboundOperationAttemptScope,
  remoteId: string
): Promise<boolean> => {
  const updated = await database.outboundOperation.updateMany({
    data: {
      known_remote_id: remoteId,
      provider_accepted_at: new Date(),
      safe_error_code: null,
      status: "provider_accepted",
    },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      status: "outcome_unknown",
    },
  });
  return updated.count === 1;
};

export const markSubmitCompleted = async (
  scope: OutboundOperationAttemptScope,
  client: OperationClient
): Promise<boolean> => {
  const updated = await client.outboundOperation.updateMany({
    data: { completed_at: new Date(), status: "completed" },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      status: "provider_accepted",
    },
  });
  return updated.count === 1;
};

export const persistSubmitRecoveryMerge = async (
  scope: OutboundOperationAttemptScope,
  mergedRecordId: string | null,
  client: OperationClient
): Promise<boolean> => {
  const updated = await client.outboundOperation.updateMany({
    data: { merged_record_id: mergedRecordId },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      status: "provider_accepted",
    },
  });
  return updated.count === 1;
};

export const acquireSubmitRecoverySideEffects = async (
  scope: OutboundOperationAttemptScope,
  claimableBefore: Date
): Promise<Date | null> => {
  const claimedAt = new Date();
  const updated = await database.outboundOperation.updateMany({
    data: { side_effect_claimed_at: claimedAt },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      OR: [
        { side_effect_claimed_at: null },
        { side_effect_claimed_at: { lt: claimableBefore } },
      ],
      status: "provider_accepted",
    },
  });
  return updated.count === 1 ? claimedAt : null;
};

export const releaseSubmitRecoverySideEffects = async (
  scope: OutboundOperationAttemptScope,
  claimedAt: Date
): Promise<void> => {
  await database.outboundOperation.updateMany({
    data: { side_effect_claimed_at: null },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      side_effect_claimed_at: claimedAt,
      status: "provider_accepted",
    },
  });
};

export const fenceSubmitRecoverySideEffectClaim = async (
  scope: OutboundOperationAttemptScope,
  claimedAt: Date,
  client: OperationClient
): Promise<boolean> => {
  const updated = await client.outboundOperation.updateMany({
    data: { side_effect_claimed_at: claimedAt },
    where: {
      ...scopedTo(scope),
      action: scope.action ?? "approve",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      side_effect_claimed_at: claimedAt,
      status: "provider_accepted",
    },
  });
  return updated.count === 1;
};

export const hasUnresolvedSubmitOperation = async (
  scope: OutboundOperationScope,
  client: OperationClient = database
): Promise<boolean> => {
  const count = await client.outboundOperation.count({
    where: {
      ...scopedTo(scope),
      action: scope.action ?? { in: ["approve", "decline", "withdraw"] },
      availability_record_id: scope.availabilityRecordId,
      status: { in: ["prepared", "outcome_unknown", "provider_accepted"] },
    },
  });
  return count > 0;
};
