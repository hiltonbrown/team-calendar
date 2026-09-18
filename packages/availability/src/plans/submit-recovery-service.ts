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
import { dispatchNotification } from "@repo/notifications";
import { z } from "zod";
import { XERO_WRITE_CLAIM_LEASE_MS } from "../xero-write-claim";
import { submitRequestFingerprint } from "./submit-service";

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
    operationAttempt(parsed.data, context.value.operation.attempt_generation),
    candidate.remoteId
  );
  if (!accepted && context.value.operation.status !== "provider_accepted") {
    return recoveryError(
      "not_recoverable",
      "This operation changed. Reload and try again."
    );
  }

  let mergedRecordId: string | null = context.value.operation.merged_record_id;
  const alreadyAttached =
    context.value.record.source_remote_id === candidate.remoteId;
  if (!alreadyAttached) {
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
          where: { id: duplicate.id },
        });
      }

      const updated = await tx.availabilityRecord.updateMany({
        data: {
          approval_status: candidate.approvalStatus,
          derived_sequence: { increment: 1 },
          failed_action: null,
          source_payload_json: candidate.rawResponse as Prisma.InputJsonValue,
          source_remote_id: candidate.remoteId,
          submitted_at: new Date(),
          updated_by_user_id: parsed.data.actingUserId,
          xero_write_claimed_at: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        },
        where: {
          ...scopedTo(parsed.data),
          id: parsed.data.recordId,
          source_remote_id: null,
        },
      });
      if (updated.count !== 1) {
        throw new Error("Recovery target changed");
      }
      if (
        !(await persistSubmitRecoveryMerge(
          operationAttempt(
            parsed.data,
            context.value.operation.attempt_generation
          ),
          mergedRecordId,
          tx
        ))
      ) {
        throw new Error("Recovery operation changed");
      }
      await tx.auditEvent.create({
        data: {
          action: "availability_records.submit_recovery_attached",
          actor_user_id: parsed.data.actingUserId,
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          payload: {
            mergedRecordId,
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
    context.value.operation.attempt_generation
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
    candidate,
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
  candidate: ProviderLeaveCandidate;
  context: RecoveryContext;
  input: z.infer<typeof AttachSchema>;
  mergedRecordId: string | null;
}): Promise<Result<void, SubmitRecoveryError>> {
  const publicationCheckpoint = await database.auditEvent.findFirst({
    select: { id: true },
    where: {
      action: "availability_records.submit_recovery_publication_completed",
      clerk_org_id: input.input.clerkOrgId,
      organisation_id: input.input.organisationId,
      resource_id: input.input.recordId,
    },
  });
  if (!publicationCheckpoint) {
    const targetPublication = await materialiseAvailabilityPublication({
      availabilityRecordId: input.input.recordId,
      clerkOrgId: input.input.clerkOrgId,
      organisationId: input.input.organisationId,
    });
    if (!targetPublication.ok) {
      return recoveryError(
        "provider_error",
        "The Xero record was attached, but calendar publication is awaiting retry."
      );
    }
    await database.auditEvent.create({
      data: checkpointAuditData(
        input.input,
        "availability_records.submit_recovery_publication_completed"
      ),
    });
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

  const { manager } = input.context.record.person;
  if (
    input.candidate.approvalStatus === "submitted" &&
    manager?.clerk_user_id
  ) {
    const managerUserId = manager.clerk_user_id;
    const notificationCheckpoint = await database.auditEvent.findFirst({
      select: { id: true },
      where: {
        action: "availability_records.submit_recovery_notification_completed",
        clerk_org_id: input.input.clerkOrgId,
        organisation_id: input.input.organisationId,
        resource_id: input.input.recordId,
      },
    });
    if (!notificationCheckpoint) {
      const notified = await database.$transaction(async (tx) => {
        const result = await dispatchNotification(
          {
            actionUrl: `/plans?record=${input.input.recordId}`,
            actorUserId: input.input.actingUserId,
            body: "A leave request recovered from Xero is ready for review.",
            clerkOrgId: input.input.clerkOrgId,
            objectId: input.input.recordId,
            objectType: "availability_record",
            organisationId: input.input.organisationId,
            recipientPersonId: manager.id,
            recipientUserId: managerUserId,
            title: "Leave submitted for approval",
            type: "leave_submitted",
          },
          tx
        );
        if (!result.ok) {
          return false;
        }
        await tx.auditEvent.create({
          data: checkpointAuditData(
            input.input,
            "availability_records.submit_recovery_notification_completed"
          ),
        });
        return true;
      });
      if (!notified) {
        return recoveryError(
          "provider_error",
          "The Xero record and calendar were recovered, but the notification is awaiting retry."
        );
      }
    }
  }
  return { ok: true, value: undefined };
}

function checkpointAuditData(
  input: z.infer<typeof RecoveryScopeSchema>,
  action: string
) {
  return {
    action,
    actor_user_id: input.actingUserId,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    resource_id: input.recordId,
    resource_type: "availability_record",
  };
}

export async function resolveSubmitAsNotCreated(
  input: z.input<typeof DefinitiveNotCreatedSchema>
): Promise<Result<void, SubmitRecoveryError>> {
  const parsed = DefinitiveNotCreatedSchema.safeParse(input);
  if (!parsed.success) {
    return recoveryError("invalid_input", "Invalid recovery request.");
  }
  const operation = await getSubmitOperation(operationScope(parsed.data));
  if (operation?.status !== "outcome_unknown") {
    return recoveryError(
      "not_recoverable",
      "No unknown submission is awaiting resolution."
    );
  }
  const resolved = await database.$transaction(async (tx) => {
    const marked = await markSubmitDefinitiveFailure(
      operationAttempt(parsed.data, operation.attempt_generation),
      "verified_not_created",
      tx
    );
    if (!marked) {
      return false;
    }
    await tx.auditEvent.create({
      data: {
        action: "availability_records.submit_recovery_not_created",
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
            location_id: true,
            manager: { select: { clerk_user_id: true, id: true } },
          },
        },
      },
      where: { ...scopedTo(parsed.data), id: parsed.data.recordId },
    }),
    getSubmitOperation(operationScope(parsed.data)),
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
      "This submission does not require recovery."
    );
  }
  if (
    !(
      operation.request_employee_id &&
      operation.request_leave_type_id &&
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
    leaveTypeId: operation.request_leave_type_id,
    startsAt: operation.request_starts_at,
    title: operation.request_title,
    units: Number(operation.request_units),
  });
  if (immutableFingerprint !== operation.request_fingerprint) {
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
      leaveTypeId: operation.request_leave_type_id,
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
      request_ends_at: Date;
      request_fingerprint: string;
      request_starts_at: Date;
      request_title: string | null;
    };
  },
  candidate: ProviderLeaveCandidate
): boolean =>
  candidate.employeeId === context.employeeId &&
  candidate.leaveTypeId === context.leaveTypeId &&
  candidate.startsAt ===
    context.operation.request_starts_at.toISOString().slice(0, 10) &&
  candidate.endsAt ===
    context.operation.request_ends_at.toISOString().slice(0, 10) &&
  candidate.units === context.duration &&
  candidate.title === (context.operation.request_title ?? "Leave request") &&
  submitRequestFingerprint({
    employeeId: candidate.employeeId,
    endsAt: context.operation.request_ends_at,
    leaveTypeId: candidate.leaveTypeId,
    startsAt: context.operation.request_starts_at,
    title: candidate.title,
    units: candidate.units,
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
  attemptGeneration: number
) => ({ ...operationScope(input), attemptGeneration });

const recoveryError = (
  code: SubmitRecoveryError["code"],
  message: string
): { error: SubmitRecoveryError; ok: false } => ({
  error: { code, message },
  ok: false,
});
