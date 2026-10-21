"use server";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { auth, currentUser } from "@repo/auth/server";
import {
  archiveRecord,
  attachSubmitRecoveryCandidate,
  createRecord,
  deleteDraftRecord,
  listSubmitRecoveryCandidates,
  type PlanServiceError,
  resolveSubmitAsNotCreated,
  restoreRecord,
  retrySubmission,
  revertToDraft,
  type SubmitRecoveryError,
  type SubmitServiceError,
  submitDraftRecord,
  updateRecord,
  withdrawSubmission,
} from "@repo/availability";
import type { ClerkOrgId, Result } from "@repo/core";
import {
  afterTenantCommit,
  assertTenantDb,
  resolveAccountCompanies,
  type TenantDb,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { log } from "@repo/observability/log";
import { XeroWriteAdapter } from "@repo/xero";
import { revalidatePath } from "next/cache";
import {
  buildFormDate,
  type PlanRecordActionInput,
  PlanRecordActionSchema,
  type PlanRecordFormInput,
  PlanRecordFormSchema,
  type UpdatePlanRecordFormInput,
  UpdatePlanRecordFormSchema,
} from "./_schemas";
import { formatPlanDateTime } from "./plan-form-time";
export type PlanActionError =
  | PlanServiceError
  | SubmitRecoveryError
  | SubmitServiceError
  | {
      code: "xero_write_failed";
      message: string;
    }
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    };
export type PlanActionResult<
  T = {
    id?: string;
  },
> = Result<T, PlanActionError>;
export async function attachSubmitRecoveryCandidateAction(input: {
  organisationId: string;
  reason: string;
  recordId: string;
  remoteId: string;
}): Promise<PlanActionResult<void>> {
  assertNoTenantTransaction("attachSubmitRecoveryCandidateAction");
  const context = await resolveRecoveryContext(
    input.organisationId,
    input.recordId
  );
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await attachSubmitRecoveryCandidate(
      {
        ...context.value,
        reason: input.reason,
        recordId: input.recordId,
        remoteId: input.remoteId,
      },
      XeroWriteAdapter
    );
    if (result.ok) {
      revalidateSubmissionPaths();
    }
    return result;
  })();
}
export async function listSubmitRecoveryCandidatesAction(input: {
  organisationId: string;
  recordId: string;
}) {
  assertNoTenantTransaction("listSubmitRecoveryCandidatesAction");
  const context = await resolveRecoveryContext(
    input.organisationId,
    input.recordId
  );
  if (!context.ok) {
    return context;
  }
  return await (async () =>
    await listSubmitRecoveryCandidates(
      { ...context.value, recordId: input.recordId },
      XeroWriteAdapter
    ))();
}
export async function resolveSubmitAsNotCreatedAction(input: {
  evidenceReference: string;
  independentlyVerified: boolean;
  organisationId: string;
  reason: string;
  recordId: string;
}): Promise<PlanActionResult<void>> {
  assertNoTenantTransaction("resolveSubmitAsNotCreatedAction");
  const context = await resolveRecoveryContext(
    input.organisationId,
    input.recordId
  );
  if (!context.ok) {
    return context;
  }
  if (!input.independentlyVerified) {
    return validationError(
      "Independent provider verification must be confirmed."
    );
  }
  return await (async () => {
    const result = await resolveSubmitAsNotCreated({
      ...context.value,
      evidenceReference: input.evidenceReference,
      independentlyVerified: true,
      reason: input.reason,
      recordId: input.recordId,
    });
    if (result.ok) {
      revalidateSubmissionPaths();
    }
    return result;
  })();
}
export async function createRecordAction(input: PlanRecordFormInput): Promise<
  PlanActionResult<{
    id: string;
  }>
> {
  assertNoTenantTransaction("createRecordAction");
  const parsed = PlanRecordFormSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await authenticatedPlanActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(
      actor.value.clerkOrgId,
      async (db): ReturnType<typeof createRecordAction> => {
        const context = await loadPlanActionContext(
          actor.value,
          parsed.data,
          db
        );
        if (!context.ok) {
          return context;
        }
        const dates = await resolveFormDates(
          parsed.data,
          context.value,
          undefined,
          db
        );
        if (!dates.ok) {
          return dates;
        }
        return await (async () => {
          const result = await createRecord(
            {
              actingOrgRole: context.value.orgRole,
              allDay: parsed.data.allDay,
              clerkOrgId: context.value.clerkOrgId,
              contactabilityStatus: parsed.data.contactabilityStatus,
              createdByUserId: context.value.userId,
              endsAt: dates.value.endsAt,
              notesInternal: parsed.data.notesInternal,
              organisationId: context.value.organisationId,
              personId: parsed.data.personId,
              privacyMode: parsed.data.privacyMode,
              recordType: parsed.data.recordType,
              startsAt: dates.value.startsAt,
            },
            db
          );
          if (!result.ok) {
            return result;
          }
          afterTenantCommit(db, () => {
            revalidatePath("/plans");

            return Promise.resolve();
          });
          afterTenantCommit(db, () => {
            revalidatePath("/calendar");

            return Promise.resolve();
          });
          afterTenantCommit(db, () => {
            revalidatePath("/");

            return Promise.resolve();
          });
          return { ok: true, value: { id: result.value.id } };
        })();
      }
    );
  } catch {
    return {
      error: { code: "unknown_error", message: "Failed to save leave record." },
      ok: false,
    };
  }
}
export async function updateRecordAction(
  input: UpdatePlanRecordFormInput
): Promise<
  PlanActionResult<{
    id: string;
  }>
> {
  assertNoTenantTransaction("updateRecordAction");
  const parsed = UpdatePlanRecordFormSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await authenticatedPlanActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(
      actor.value.clerkOrgId,
      async (db): ReturnType<typeof updateRecordAction> => {
        const context = await loadPlanActionContext(
          actor.value,
          parsed.data,
          db
        );
        if (!context.ok) {
          return context;
        }
        const dates = await resolveFormDates(
          parsed.data,
          context.value,
          parsed.data.recordId,
          db
        );
        if (!dates.ok) {
          return dates;
        }
        return await (async () => {
          const result = await updateRecord(
            {
              actingOrgRole: context.value.orgRole,
              actingUserId: context.value.userId,
              clerkOrgId: context.value.clerkOrgId,
              organisationId: context.value.organisationId,
              patch: {
                allDay: parsed.data.allDay,
                contactabilityStatus: parsed.data.contactabilityStatus,
                endsAt: dates.value.endsAt,
                notesInternal: parsed.data.notesInternal,
                privacyMode: parsed.data.privacyMode,
                recordType: parsed.data.recordType,
                startsAt: dates.value.startsAt,
              },
              recordId: parsed.data.recordId,
            },
            db
          );
          if (!result.ok) {
            return result;
          }
          afterTenantCommit(db, () => {
            revalidatePath("/plans");

            return Promise.resolve();
          });
          afterTenantCommit(db, () => {
            revalidatePath("/calendar");

            return Promise.resolve();
          });
          return { ok: true, value: { id: result.value.id } };
        })();
      }
    );
  } catch {
    return {
      error: { code: "unknown_error", message: "Failed to save leave record." },
      ok: false,
    };
  }
}
async function captureSubmissionActivation(input: {
  clerkOrgId: string;
  organisationId: string;
  submittedAt: Date | null;
}): Promise<void> {
  if (!input.submittedAt) {
    return;
  }
  const first = await withTenantDb(input.clerkOrgId, (db) =>
    db.availabilityRecord.findFirst({
      orderBy: { submitted_at: "asc" },
      select: { submitted_at: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        submitted_at: { not: null },
      },
    })
  );
  if (!first?.submitted_at) {
    return;
  }
  const event = createActivationEvent({
    deduplicationKey: `${input.clerkOrgId}:${input.organisationId}`,
    name: "First Leave Submitted",
    occurredAt: first.submitted_at,
    subjectId: input.clerkOrgId,
  });
  analytics?.capture({
    distinctId: event.distinctId,
    event: event.event,
    properties: event.properties,
    timestamp: event.timestamp,
    uuid: event.uuid,
  });
  await analytics?.flush();
}
export async function deleteDraftAction(
  input: PlanRecordActionInput
): Promise<PlanActionResult<void>> {
  assertNoTenantTransaction("deleteDraftAction");
  const parsed = PlanRecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid record");
  }
  const actor = await authenticatedPlanActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(
      actor.value.clerkOrgId,
      async (db): ReturnType<typeof deleteDraftAction> => {
        const context = await loadPlanActionContext(
          actor.value,
          parsed.data,
          db
        );
        if (!context.ok) {
          return context;
        }
        return await (async () => {
          const result = await deleteDraftRecord(
            {
              actingOrgRole: context.value.orgRole,
              actingUserId: context.value.userId,
              clerkOrgId: context.value.clerkOrgId,
              organisationId: context.value.organisationId,
              recordId: parsed.data.recordId,
            },
            db
          );
          if (!result.ok) {
            return result;
          }
          afterTenantCommit(db, () => {
            revalidatePath("/plans");

            return Promise.resolve();
          });
          return { ok: true, value: undefined };
        })();
      }
    );
  } catch {
    return {
      error: { code: "unknown_error", message: "Failed to save leave record." },
      ok: false,
    };
  }
}
export async function archiveRecordAction(
  input: PlanRecordActionInput
): Promise<PlanActionResult<void>> {
  assertNoTenantTransaction("archiveRecordAction");
  const parsed = PlanRecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid record");
  }
  const actor = await authenticatedPlanActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(
      actor.value.clerkOrgId,
      async (db): ReturnType<typeof archiveRecordAction> => {
        const context = await loadPlanActionContext(
          actor.value,
          parsed.data,
          db
        );
        if (!context.ok) {
          return context;
        }
        return await (async () => {
          const result = await archiveRecord(
            {
              actingOrgRole: context.value.orgRole,
              actingUserId: context.value.userId,
              clerkOrgId: context.value.clerkOrgId,
              organisationId: context.value.organisationId,
              recordId: parsed.data.recordId,
            },
            db
          );
          if (!result.ok) {
            return result;
          }
          afterTenantCommit(db, () => {
            revalidatePath("/plans");

            return Promise.resolve();
          });
          afterTenantCommit(db, () => {
            revalidatePath("/calendar");

            return Promise.resolve();
          });
          return { ok: true, value: undefined };
        })();
      }
    );
  } catch {
    return {
      error: { code: "unknown_error", message: "Failed to save leave record." },
      ok: false,
    };
  }
}
export async function restoreRecordAction(
  input: PlanRecordActionInput
): Promise<PlanActionResult<void>> {
  assertNoTenantTransaction("restoreRecordAction");
  const parsed = PlanRecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid record");
  }
  const actor = await authenticatedPlanActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(
      actor.value.clerkOrgId,
      async (db): ReturnType<typeof restoreRecordAction> => {
        const context = await loadPlanActionContext(
          actor.value,
          parsed.data,
          db
        );
        if (!context.ok) {
          return context;
        }
        return await (async () => {
          const result = await restoreRecord(
            {
              actingOrgRole: context.value.orgRole,
              actingUserId: context.value.userId,
              clerkOrgId: context.value.clerkOrgId,
              organisationId: context.value.organisationId,
              recordId: parsed.data.recordId,
            },
            db
          );
          if (!result.ok) {
            return result;
          }
          afterTenantCommit(db, () => {
            revalidatePath("/plans");

            return Promise.resolve();
          });
          afterTenantCommit(db, () => {
            revalidatePath("/calendar");

            return Promise.resolve();
          });
          return { ok: true, value: undefined };
        })();
      }
    );
  } catch {
    return {
      error: { code: "unknown_error", message: "Failed to save leave record." },
      ok: false,
    };
  }
}
export async function submitForApprovalAction(
  input: PlanRecordActionInput
): Promise<PlanActionResult<SubmissionActionValue>> {
  assertNoTenantTransaction("submitForApprovalAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await submitDraftRecord(context.value, XeroWriteAdapter);
    if (!result.ok) {
      return result;
    }
    try {
      await captureSubmissionActivation({
        clerkOrgId: context.value.clerkOrgId,
        organisationId: context.value.organisationId,
        submittedAt: result.value.submitted_at,
      });
    } catch (error) {
      log.warn("Leave submission activation capture failed", { error });
    }
    revalidateSubmissionPaths();
    return submissionValue(result.value);
  })();
}
export async function withdrawSubmissionAction(
  input: PlanRecordActionInput
): Promise<PlanActionResult<SubmissionActionValue>> {
  assertNoTenantTransaction("withdrawSubmissionAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await withdrawSubmission(context.value, XeroWriteAdapter);
    if (!result.ok) {
      return result;
    }
    revalidatePath("/plans");
    revalidatePath("/calendar");
    revalidatePath("/leave-approvals");
    revalidatePath("/notifications");
    if (
      result.value.approval_status !== "withdrawn" &&
      result.value.xero_write_error
    ) {
      return {
        error: {
          code: "xero_write_failed",
          message: result.value.xero_write_error,
        },
        ok: false,
      };
    }
    return submissionValue(result.value);
  })();
}
export async function retrySubmissionAction(
  input: PlanRecordActionInput
): Promise<PlanActionResult<SubmissionActionValue>> {
  assertNoTenantTransaction("retrySubmissionAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await retrySubmission(context.value, XeroWriteAdapter);
    if (!result.ok) {
      return result;
    }
    try {
      await captureSubmissionActivation({
        clerkOrgId: context.value.clerkOrgId,
        organisationId: context.value.organisationId,
        submittedAt: result.value.submitted_at,
      });
    } catch (error) {
      log.warn("Leave submission activation capture failed", { error });
    }
    revalidateSubmissionPaths();
    return submissionValue(result.value);
  })();
}
export async function revertToDraftAction(
  input: PlanRecordActionInput
): Promise<PlanActionResult<SubmissionActionValue>> {
  assertNoTenantTransaction("revertToDraftAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await revertToDraft(context.value);
    if (!result.ok) {
      return result;
    }
    revalidatePath("/plans");
    revalidatePath("/calendar");
    return submissionValue(result.value);
  })();
}
interface SubmissionActionValue {
  approvalStatus: string;
  id: string;
  xeroWriteError: string | null;
}
interface PlanActor {
  clerkOrgId: ClerkOrgId;
  orgRole: string | null;
  userId: string;
}
async function authenticatedPlanActor(): Promise<PlanActionResult<PlanActor>> {
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (!(orgId && user && canUsePlans(orgRole))) {
    return {
      error: {
        code: "not_authorised",
        message: "You do not have permission to manage plans",
      },
      ok: false,
    };
  }
  // Clerk account is authenticated before SQL preparation.
  return {
    ok: true,
    value: {
      clerkOrgId: orgId as ClerkOrgId,
      orgRole: orgRole ?? null,
      userId: user.id,
    },
  };
}
async function loadPlanActionContext(
  actor: PlanActor,
  input: { organisationId: string; personId?: string; recordId?: string },
  db: TenantDb
): Promise<PlanActionResult<PlanActor & { organisationId: string }>> {
  assertTenantDb(db, actor.clerkOrgId);
  const companies = await resolveAccountCompanies(actor.clerkOrgId, db);
  const companyIds = companies.map((company) => company.id);
  const scope = {
    clerk_org_id: actor.clerkOrgId,
    organisation_id: { in: companyIds },
  };
  let target: { organisation_id: string } | null = null;
  if (input.recordId) {
    target = await db.availabilityRecord.findFirst({
      select: { organisation_id: true },
      where: { ...scope, id: input.recordId },
    });
  } else if (input.personId) {
    target = await db.person.findFirst({
      select: { organisation_id: true },
      where: { ...scope, archived_at: null, id: input.personId },
    });
  }
  if ((input.recordId || input.personId) && !target) {
    return validationError("Person or leave record not found.");
  }
  const organisationId = target?.organisation_id ?? input.organisationId;
  if (
    !companyIds.includes(organisationId) ||
    organisationId !== input.organisationId
  ) {
    return validationError(
      "The company does not match this person or leave record."
    );
  }
  return { ok: true, value: { ...actor, organisationId } };
}
async function resolveActionContext(
  organisationId: string,
  recordId?: string
): Promise<
  PlanActionResult<{
    clerkOrgId: string;
    organisationId: string;
    orgRole: string | null;
    userId: string;
  }>
> {
  const actor = await authenticatedPlanActor();
  if (!actor.ok) {
    return actor;
  }
  return withTenantDb(actor.value.clerkOrgId, (db) =>
    loadPlanActionContext(actor.value, { organisationId, recordId }, db)
  );
}
function canUsePlans(role: string | null | undefined): boolean {
  return (
    role === "org:viewer" ||
    role === "org:manager" ||
    role === "org:admin" ||
    role === "org:owner"
  );
}
async function resolveRecoveryContext(
  organisationId: string,
  recordId?: string
): Promise<
  PlanActionResult<{
    actingOrgRole: "org:admin" | "org:owner";
    actingUserId: string;
    clerkOrgId: string;
    organisationId: string;
  }>
> {
  const context = await resolveActionContext(organisationId, recordId);
  if (!context.ok) {
    return context;
  }
  if (
    context.value.orgRole !== "org:admin" &&
    context.value.orgRole !== "org:owner"
  ) {
    return {
      error: {
        code: "not_authorised",
        message:
          "Administrator access is required to resolve Xero submissions.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: {
      actingOrgRole: context.value.orgRole,
      actingUserId: context.value.userId,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
    },
  };
}
async function resolveRecordActionContext(
  input: PlanRecordActionInput
): Promise<
  PlanActionResult<{
    actingOrgRole: string | null;
    actingUserId: string;
    clerkOrgId: string;
    organisationId: string;
    recordId: string;
  }>
> {
  const parsed = PlanRecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Invalid record");
  }
  const context = await resolveActionContext(
    parsed.data.organisationId,
    parsed.data.recordId
  );
  if (!context.ok) {
    return context;
  }
  return {
    ok: true,
    value: {
      actingOrgRole: context.value.orgRole,
      actingUserId: context.value.userId,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      recordId: parsed.data.recordId,
    },
  };
}
function revalidateSubmissionPaths() {
  revalidatePath("/plans");
  revalidatePath("/calendar");
  revalidatePath("/leave-approvals");
  revalidatePath("/notifications");
  revalidatePath("/");
}
function submissionValue(record: {
  approval_status: string;
  id: string;
  xero_write_error: string | null;
}): PlanActionResult<SubmissionActionValue> {
  return {
    ok: true,
    value: {
      approvalStatus: record.approval_status,
      id: record.id,
      xeroWriteError: record.xero_write_error,
    },
  };
}
function validationError(message?: string): PlanActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid plan record",
    },
    ok: false,
  };
}
async function resolveFormDates(
  input: PlanRecordFormInput,
  context: {
    clerkOrgId: string;
    organisationId: string;
  },
  recordId: string | undefined,
  db: TenantDb
): Promise<
  PlanActionResult<{
    startsAt: Date;
    endsAt: Date;
  }>
> {
  assertTenantDb(db, context.clerkOrgId);
  const organisation = await db.organisation.findFirst({
    select: { timezone: true },
    where: {
      archived_at: null,
      clerk_org_id: context.clerkOrgId,
      id: context.organisationId,
    },
  });
  if (!organisation) {
    return validationError("Organisation not found.");
  }
  const timezone = organisation.timezone ?? "UTC";
  let startsAt = buildFormDate(
    input.startsAt,
    input.startTime,
    input.allDay,
    false,
    timezone
  );
  let endsAt = buildFormDate(
    input.endsAt,
    input.endTime,
    input.allDay,
    true,
    timezone
  );
  const existing = recordId
    ? await db.availabilityRecord.findFirst({
        select: { all_day: true, ends_at: true, starts_at: true },
        where: {
          archived_at: null,
          clerk_org_id: context.clerkOrgId,
          id: recordId,
          organisation_id: context.organisationId,
        },
      })
    : null;
  if (existing && existing.all_day === input.allDay) {
    const displayTimezone = input.allDay ? "UTC" : timezone;
    const originalStart = formatPlanDateTime(
      existing.starts_at,
      displayTimezone
    );
    const originalEnd = formatPlanDateTime(existing.ends_at, displayTimezone);
    if (
      originalStart.date === input.startsAt &&
      (input.allDay || originalStart.time === input.startTime)
    ) {
      startsAt = existing.starts_at;
    }
    if (
      originalEnd.date === input.endsAt &&
      (input.allDay || originalEnd.time === input.endTime)
    ) {
      endsAt = existing.ends_at;
    }
  }
  if (
    !(Number.isFinite(startsAt.getTime()) && Number.isFinite(endsAt.getTime()))
  ) {
    return validationError(
      "This time does not exist in the organisation timezone. Choose another time."
    );
  }
  if (input.allDay ? endsAt < startsAt : endsAt <= startsAt) {
    return validationError("End date must be after start date");
  }
  return { ok: true, value: { endsAt, startsAt } };
}
