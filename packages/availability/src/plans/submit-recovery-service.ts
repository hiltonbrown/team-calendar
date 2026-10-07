import "server-only";

import type {
  ExternalWritePort,
  ProviderLeaveCandidate,
  Result,
} from "@repo/core";
import {
  acquireSubmitRecoverySideEffects,
  database,
  getSubmitOperation,
  markSubmitCompleted,
  markSubmitDefinitiveFailure,
  markSubmitProviderAccepted,
  persistSubmitRecoveryMerge,
  releaseSubmitRecoverySideEffects,
  scopedTo,
} from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import { z } from "zod";
import { XERO_WRITE_CLAIM_LEASE_MS } from "../xero-write-claim";
import { submitRequestFingerprint } from "./submit-service";
import { completeSubmitSideEffects } from "./submit-side-effects";
import { mutationRequestFingerprint } from "./write-operation";

const RecoveryScopeSchema = z.object({
  actingOrgRole: z.enum(["org:owner", "org:admin"]),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

const AttachSchema = RecoveryScopeSchema.extend({
  reason: z.string().trim().min(10).max(500),
  remoteId: z.string().trim().min(1).max(200),
});

const DefinitiveNotCreatedSchema = RecoveryScopeSchema.extend({
  evidenceReference: z.string().trim().min(10).max(200),
  independentlyVerified: z.literal(true),
  reason: z.string().trim().min(10).max(500),
});

export interface SubmitRecoveryError {
  code:
    | "candidate_mismatch"
    | "invalid_input"
    | "not_authorised"
    | "not_recoverable"
    | "provider_error"
    | "record_not_found";
  message: string;
}

export interface SubmitRecoveryCandidate {
  approvalStatus: ProviderLeaveCandidate["approvalStatus"];
  employeeId: string;
  endsAt: string;
  leaveTypeId: string;
  remoteId: string;
  startsAt: string;
  title: string | null;
  units: number;
}

export async function listSubmitRecoveryCandidates(
  input: z.input<typeof RecoveryScopeSchema>,
  externalWritePort: ExternalWritePort
): Promise<
  Result<
    { candidates: SubmitRecoveryCandidate[]; complete: boolean },
    SubmitRecoveryError
  >
> {
  const context = await loadRecoveryContext(input);
  if (!context.ok) {
    return context;
  }
  const candidates = await externalWritePort.findLeaveApplicationCandidates?.({
    clerkOrgId: context.value.input.clerkOrgId,
    employeeId: context.value.employeeId,
    expectedXeroTenantId:
      context.value.operation.request_xero_tenant_id ?? undefined,
    organisationId: context.value.input.organisationId,
  });
  if (!candidates?.ok) {
    return recoveryError("provider_error", "Could not load Xero candidates.");
  }
  return {
    ok: true,
    value: {
      candidates: candidates.value.candidates
        .filter((candidate) => candidateMatches(context.value, candidate))
        .slice(0, 20)
        .map(({ rawResponse: _rawResponse, ...candidate }) => candidate),
      complete: candidates.value.complete,
    },
  };
}

export async function attachSubmitRecoveryCandidate(
  input: z.input<typeof AttachSchema>,
  externalWritePort: ExternalWritePort
): Promise<Result<void, SubmitRecoveryError>> {
  const parsed = AttachSchema.safeParse(input);
  if (!parsed.success) {
    return recoveryError("invalid_input", "Invalid recovery request.");
  }
  const context = await loadRecoveryContext(parsed.data);
  if (!context.ok) {
    return context;
  }
  const candidates = await externalWritePort.findLeaveApplicationCandidates?.({
    clerkOrgId: parsed.data.clerkOrgId,
    employeeId: context.value.employeeId,
    expectedXeroTenantId:
      context.value.operation.request_xero_tenant_id ?? undefined,
    organisationId: parsed.data.organisationId,
  });
  if (!candidates?.ok) {
    return recoveryError("provider_error", "Could not verify the Xero record.");
  }
  const candidate = candidates.value.candidates.find(
    (item) =>
      item.remoteId === parsed.data.remoteId &&
      candidateMatches(context.value, item)
  );
  if (!candidate) {
    return recoveryError(
      "candidate_mismatch",
      "The selected Xero record does not match this leave request."
    );
  }
  if (
    context.value.operation.status === "provider_accepted" &&
    context.value.operation.known_remote_id !== candidate.remoteId
  ) {
    return recoveryError(
      "candidate_mismatch",
      "The accepted Xero record ID does not match this candidate."
    );
  }

  const accepted = await markSubmitProviderAccepted(
    operationAttempt(
      parsed.data,
      context.value.operation.attempt_generation,
      context.value.operation.action
    ),
    candidate.remoteId
  );
  if (!accepted && context.value.operation.status !== "provider_accepted") {
    return recoveryError(
      "not_recoverable",
      "This operation changed. Reload and try again."
    );
  }

  let mergedRecordId: string | null = context.value.operation.merged_record_id;
  const remoteTransition = isRemoteTransition(context.value.operation);
  const targetStatus =
    context.value.operation.action === "withdraw"
      ? "withdrawn"
      : candidate.approvalStatus;
  const alreadyAttached =
    context.value.record.source_remote_id === candidate.remoteId &&
    context.value.record.approval_status === targetStatus;
  const originalApprover =
    context.value.operation.action === "approve"
      ? await database.person.findFirst({
          select: { id: true },
          where: {
            ...scopedTo(parsed.data),
            archived_at: null,
            clerk_user_id: context.value.operation.actor_user_id,
          },
        })
      : null;
  if (!alreadyAttached) {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep verified recovery state, original actor and reason, merge fencing and audit in one transaction.
    await database.$transaction(async (tx) => {
      const duplicate = await tx.availabilityRecord.findFirst({
        where: {
          ...scopedTo(parsed.data),
          id: { not: parsed.data.recordId },
          source_remote_id: candidate.remoteId,
        },
      });
      if (duplicate) {
        mergedRecordId = duplicate.id;
        await tx.availabilityRecord.update({
          data: {
            archived_at: new Date(),
            publish_status: "archived",
            source_remote_id: null,
          },
          where: { ...scopedTo(parsed.data), id: duplicate.id },
        });
      }

      const updated = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: targetStatus,
          ...(context.value.operation.action === "decline"
            ? { approval_note: context.value.operation.request_reason }
            : {}),
          derived_sequence: { increment: 1 },
          failed_action: null,
          source_payload_json: candidate.rawResponse as Prisma.InputJsonValue,
          source_remote_id: candidate.remoteId,
          ...(context.value.operation.action === "approve"
            ? {
                approved_at:
                  context.value.operation.provider_accepted_at ?? new Date(),
                approved_by_person_id: originalApprover?.id ?? null,
              }
            : {}),
          updated_by_user_id: parsed.data.actingUserId,
          xero_write_claimed_at: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scopedTo(parsed.data),
          id: parsed.data.recordId,
          source_remote_id: remoteTransition ? candidate.remoteId : null,
        },
      });
      if (updated.count !== 1) {
        throw new Error("Recovery target changed");
      }
      if (
        !(await persistSubmitRecoveryMerge(
          operationAttempt(
            parsed.data,
            context.value.operation.attempt_generation,
            context.value.operation.action
          ),
          mergedRecordId,
          tx
        ))
      ) {
        throw new Error("Recovery operation changed");
      }
      await tx.auditEvent.create({
        data: {
          action:
            context.value.operation.action === "approve"
              ? "availability_records.approval_recovery_attached"
              : `availability_records.${context.value.operation.action}_recovery_attached`,
          actor_user_id: parsed.data.actingUserId,
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          payload: {
            mergedRecordId,
            originalActorUserId: context.value.operation.actor_user_id,
            reason: parsed.data.reason,
            remoteId: candidate.remoteId,
          },
          resource_id: parsed.data.recordId,
          resource_type: "availability_record",
        },
      });
    });
  }

  const attempt = operationAttempt(
    parsed.data,
    context.value.operation.attempt_generation,
    context.value.operation.action
  );
  const sideEffectClaimedAt = await acquireSubmitRecoverySideEffects(
    attempt,
    new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS)
  );
  if (!sideEffectClaimedAt) {
    return recoveryError(
      "not_recoverable",
      "Recovery side effects are already being processed."
    );
  }
  const sideEffects = await completeRecoverySideEffects({
    attempt,
    candidate,
    claimedAt: sideEffectClaimedAt,
    context: context.value,
    input: parsed.data,
    mergedRecordId,
  });
  if (!sideEffects.ok) {
    await releaseSubmitRecoverySideEffects(attempt, sideEffectClaimedAt);
    return sideEffects;
  }

  if (!(await markSubmitCompleted(attempt, database))) {
    return recoveryError(
      "not_recoverable",
      "This operation changed. Reload and try again."
    );
  }
  return { ok: true, value: undefined };
}

type RecoveryContext = Extract<
  Awaited<ReturnType<typeof loadRecoveryContext>>,
  { ok: true }
>["value"];

async function completeRecoverySideEffects(input: {
  attempt: ReturnType<typeof operationAttempt>;
  candidate: ProviderLeaveCandidate;
  claimedAt: Date;
  context: RecoveryContext;
  input: z.infer<typeof AttachSchema>;
  mergedRecordId: string | null;
}): Promise<Result<void, SubmitRecoveryError>> {
  const { manager } = input.context.record.person;
  const primary = await completeSubmitSideEffects({
    actorUserId: input.context.operation.actor_user_id,
    approvalRecipient:
      input.context.operation.action !== "withdraw" &&
      input.context.record.person.clerk_user_id
        ? {
            clerkUserId: input.context.record.person.clerk_user_id,
            personId: input.context.record.person.id,
          }
        : null,
    attempt: input.attempt,
    claimedAt: input.claimedAt,
    clerkOrgId: input.input.clerkOrgId,
    declineReason: input.context.operation.request_reason,
    manager: manager?.clerk_user_id
      ? { clerkUserId: manager.clerk_user_id, personId: manager.id }
      : null,
    notifyManager: input.context.operation.action === "withdraw",
    organisationId: input.input.organisationId,
    recordId: input.input.recordId,
  });
  if (!primary.ok) {
    return recoveryError("provider_error", primary.error.message);
  }
  if (input.mergedRecordId) {
    const duplicatePublication = await materialiseAvailabilityPublication({
      availabilityRecordId: input.mergedRecordId,
      clerkOrgId: input.input.clerkOrgId,
      organisationId: input.input.organisationId,
    });
    if (!duplicatePublication.ok) {
      return recoveryError(
        "provider_error",
        "The Xero record was attached, but duplicate calendar cancellation is awaiting retry."
      );
    }
  }

  return { ok: true, value: undefined };
}

export async function resolveSubmitAsNotCreated(
  input: z.input<typeof DefinitiveNotCreatedSchema>
): Promise<Result<void, SubmitRecoveryError>> {
  const parsed = DefinitiveNotCreatedSchema.safeParse(input);
  if (!parsed.success) {
    return recoveryError("invalid_input", "Invalid recovery request.");
  }
  const operation = await getRecoveryOperation(parsed.data);
  if (operation?.status !== "outcome_unknown") {
    return recoveryError(
      "not_recoverable",
      "No uncertain leave action is awaiting resolution."
    );
  }
  const resolved = await database.$transaction(async (tx) => {
    const marked = await markSubmitDefinitiveFailure(
      operationAttempt(
        parsed.data,
        operation.attempt_generation,
        operation.action
      ),
      "verified_not_created",
      tx
    );
    if (!marked) {
      return false;
    }
    await tx.auditEvent.create({
      data: {
        action:
          operation.action === "approve"
            ? "availability_records.approval_recovery_not_created"
            : `availability_records.${operation.action}_recovery_not_processed`,
        actor_user_id: parsed.data.actingUserId,
        clerk_org_id: parsed.data.clerkOrgId,
        organisation_id: parsed.data.organisationId,
        payload: {
          evidenceReference: parsed.data.evidenceReference,
          independentlyVerified: true,
          reason: parsed.data.reason,
        },
        resource_id: parsed.data.recordId,
        resource_type: "availability_record",
      },
    });
    return true;
  });
  if (!resolved) {
    return recoveryError(
      "not_recoverable",
      "This operation changed. Reload and try again."
    );
  }
  return { ok: true, value: undefined };
}

async function loadRecoveryContext(input: z.input<typeof RecoveryScopeSchema>) {
  const parsed = RecoveryScopeSchema.safeParse(input);
  if (!parsed.success) {
    return recoveryError("not_authorised", "Administrator access is required.");
  }
  const [record, operation] = await Promise.all([
    database.availabilityRecord.findFirst({
      include: {
        person: {
          select: {
            clerk_user_id: true,
            id: true,
            location_id: true,
            manager: { select: { clerk_user_id: true, id: true } },
          },
        },
      },
      where: { ...scopedTo(parsed.data), id: parsed.data.recordId },
    }),
    getRecoveryOperation(parsed.data),
  ]);
  if (!record) {
    return recoveryError("record_not_found", "Leave record not found.");
  }
  if (
    !(
      operation &&
      ["outcome_unknown", "provider_accepted"].includes(operation.status)
    )
  ) {
    return recoveryError(
      "not_recoverable",
      "This leave action does not require recovery."
    );
  }
  if (
    !(
      operation.request_employee_id &&
      (operation.request_leave_type_id || isRemoteTransition(operation)) &&
      operation.request_starts_at &&
      operation.request_ends_at
    ) ||
    operation.request_units === null
  ) {
    return recoveryError(
      "provider_error",
      "The original immutable Xero request is unavailable."
    );
  }
  const immutableFingerprint = submitRequestFingerprint({
    employeeId: operation.request_employee_id,
    endsAt: operation.request_ends_at,
    leaveTypeId: operation.request_leave_type_id ?? "",
    startsAt: operation.request_starts_at,
    title: operation.request_title,
    units: Number(operation.request_units),
  });
  const fingerprint = isRemoteTransition(operation)
    ? mutationRequestFingerprint({
        body: operation.request_body_json,
        method: operation.request_method as "POST",
        url: operation.request_url ?? "",
        xeroTenantId: operation.request_xero_tenant_id ?? "",
      })
    : immutableFingerprint;
  if (fingerprint !== operation.request_fingerprint) {
    return recoveryError(
      "not_recoverable",
      "The original request fingerprint is invalid."
    );
  }
  return {
    ok: true as const,
    value: {
      duration: Number(operation.request_units),
      employeeId: operation.request_employee_id,
      input: parsed.data,
      leaveTypeId: operation.request_leave_type_id ?? "",
      operation: {
        ...operation,
        request_employee_id: operation.request_employee_id,
        request_ends_at: operation.request_ends_at,
        request_leave_type_id: operation.request_leave_type_id,
        request_starts_at: operation.request_starts_at,
        request_units: operation.request_units,
      },
      record,
    },
  };
}

const candidateMatches = (
  context: {
    duration: number;
    employeeId: string;
    leaveTypeId: string;
    operation: {
      action?: "approve" | "decline" | "withdraw";
      request_ends_at: Date;
      request_fingerprint: string;
      request_starts_at: Date;
      request_title: string | null;
      known_remote_id?: string | null;
      request_url?: string | null;
    };
  },
  candidate: ProviderLeaveCandidate
): boolean =>
  isRemoteTransition(context.operation)
    ? candidate.remoteId === context.operation.known_remote_id &&
      candidate.employeeId === context.employeeId &&
      (context.operation.action === "approve"
        ? candidate.approvalStatus === "approved"
        : ["declined", "withdrawn", "cancelled"].includes(
            candidate.approvalStatus
          ))
    : !(
        context.operation.action === "approve" &&
        candidate.approvalStatus === "submitted"
      ) &&
      candidate.employeeId === context.employeeId &&
      candidate.leaveTypeId === context.leaveTypeId &&
      candidate.startsAt ===
        context.operation.request_starts_at.toISOString().slice(0, 10) &&
      candidate.endsAt ===
        context.operation.request_ends_at.toISOString().slice(0, 10) &&
      candidate.title === context.operation.request_title &&
      submitRequestFingerprint({
        employeeId: candidate.employeeId,
        endsAt: context.operation.request_ends_at,
        leaveTypeId: candidate.leaveTypeId,
        startsAt: context.operation.request_starts_at,
        title: candidate.title,
        units: context.duration,
      }) === context.operation.request_fingerprint;

const operationScope = (input: {
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}) => ({
  availabilityRecordId: input.recordId,
  clerkOrgId: input.clerkOrgId,
  organisationId: input.organisationId,
});

const operationAttempt = (
  input: { clerkOrgId: string; organisationId: string; recordId: string },
  attemptGeneration: number,
  action: "approve" | "decline" | "withdraw" = "approve"
) => ({ ...operationScope(input), action, attemptGeneration });

const recoveryError = (
  code: SubmitRecoveryError["code"],
  message: string
): { error: SubmitRecoveryError; ok: false } => ({
  error: { code, message },
  ok: false,
});

async function getRecoveryOperation(input: {
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}) {
  const operations = await Promise.all([
    getSubmitOperation({ ...operationScope(input), action: "approve" }),
    getSubmitOperation({ ...operationScope(input), action: "decline" }),
    getSubmitOperation({ ...operationScope(input), action: "withdraw" }),
  ]);
  const unresolved = operations.filter(
    (operation) =>
      operation &&
      ["outcome_unknown", "provider_accepted"].includes(operation.status)
  );
  // Multiple unresolved operations violate the record invariant. Fail
  // closed rather than choosing an actor or payroll request arbitrarily.
  return unresolved.length === 1 ? unresolved[0] : null;
}

const REMOTE_TRANSITION_PATH = /\/(approve|reject)$/;
function isRemoteTransition(operation: {
  request_url?: string | null;
  known_remote_id?: string | null;
}) {
  return (
    !!operation.known_remote_id &&
    REMOTE_TRANSITION_PATH.test(operation.request_url ?? "")
  );
}
