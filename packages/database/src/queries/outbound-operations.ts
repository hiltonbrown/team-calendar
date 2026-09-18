import type { Prisma } from "../../generated/client";
import { type Database, database } from "../client";
import { scopedTo } from "../tenant-query";

type OperationClient = Database | Prisma.TransactionClient;

export interface OutboundOperationScope {
  availabilityRecordId: string;
  clerkOrgId: string;
  organisationId: string;
}

export interface PrepareSubmitOperationInput extends OutboundOperationScope {
  actorUserId: string;
  claimableBefore: Date;
  expectedFailedAction: "submit" | null;
  expectedSequence: number;
  expectedStatus: "draft" | "xero_sync_failed";
  requestFingerprint: string;
}

export interface OutboundOperationAttemptScope extends OutboundOperationScope {
  attemptGeneration: number;
}

export interface PreparedSubmitOperation {
  attemptGeneration: number;
  claimedAt: Date;
}

class SubmitClaimConflictError extends Error {}

export const getSubmitOperation = async (
  scope: OutboundOperationScope,
  client: OperationClient = database
) =>
  client.outboundOperation.findFirst({
    where: {
      ...scopedTo(scope),
      action: "submit",
      availability_record_id: scope.availabilityRecordId,
    },
  });

export const prepareAndClaimSubmitOperation = async (
  input: PrepareSubmitOperationInput
): Promise<PreparedSubmitOperation | null> => {
  try {
    return await database.$transaction(async (tx) => {
      const existing = await getSubmitOperation(input, tx);
      let attemptGeneration = 1;
      if (existing) {
        const safelyRetryablePrepared =
          existing.status === "prepared" &&
          existing.dispatch_started_at === null;
        if (
          existing.status !== "definitive_failure" &&
          !safelyRetryablePrepared
        ) {
          throw new SubmitClaimConflictError();
        }
        attemptGeneration = existing.attempt_generation + 1;
        const reset = await tx.outboundOperation.updateMany({
          data: {
            actor_user_id: input.actorUserId,
            attempt_generation: attemptGeneration,
            completed_at: null,
            dispatch_started_at: null,
            known_remote_id: null,
            prepared_at: new Date(),
            provider_accepted_at: null,
            request_fingerprint: input.requestFingerprint,
            safe_error_code: null,
            status: "prepared",
          },
          where: {
            attempt_generation: existing.attempt_generation,
            id: existing.id,
            status: safelyRetryablePrepared ? "prepared" : "definitive_failure",
            ...scopedTo(input),
          },
        });
        if (reset.count !== 1) {
          throw new SubmitClaimConflictError();
        }
      } else {
        await tx.outboundOperation.create({
          data: {
            action: "submit",
            actor_user_id: input.actorUserId,
            attempt_generation: attemptGeneration,
            availability_record_id: input.availabilityRecordId,
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            request_fingerprint: input.requestFingerprint,
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
          derived_sequence: input.expectedSequence,
          failed_action: input.expectedFailedAction,
          id: input.availabilityRecordId,
          OR: [
            { xero_write_claimed_at: null },
            { xero_write_claimed_at: { lt: input.claimableBefore } },
          ],
        },
      });
      if (claimed.count !== 1) {
        throw new SubmitClaimConflictError();
      }
      return { attemptGeneration, claimedAt };
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
  scope: OutboundOperationAttemptScope
): Promise<boolean> => {
  const updated = await database.outboundOperation.updateMany({
    data: { dispatch_started_at: new Date(), status: "outcome_unknown" },
    where: {
      ...scopedTo(scope),
      action: "submit",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      status: "prepared",
    },
  });
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
      action: "submit",
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
      action: "submit",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
      status: "outcome_unknown",
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
      action: "submit",
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
      action: "submit",
      attempt_generation: scope.attemptGeneration,
      availability_record_id: scope.availabilityRecordId,
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
      action: "submit",
      availability_record_id: scope.availabilityRecordId,
      status: { in: ["prepared", "outcome_unknown", "provider_accepted"] },
    },
  });
  return count > 0;
};
