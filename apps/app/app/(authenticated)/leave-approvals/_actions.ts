"use server";

import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { auth, currentUser } from "@repo/auth/server";
import {
  type ApprovalListItem,
  type ApprovalRole,
  type ApprovalServiceError,
  approve,
  decline,
  dispatchApprovalReconciliation,
  dispatchXeroLeaveSync,
  requestMoreInfo,
  retryApproval,
  retryDecline,
  revertApprovalAttempt,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { log } from "@repo/observability/log";
import { XeroWriteAdapter } from "@repo/xero";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const RecordActionSchema = z.object({
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

const DeclineActionSchema = RecordActionSchema.extend({
  reason: z.string().trim().min(3).max(1000),
});

const RequestInfoActionSchema = RecordActionSchema.extend({
  question: z.string().trim().min(3).max(1000),
});

const ReconciliationActionSchema = z.object({
  organisationId: z.string().uuid(),
});

export type ApprovalActionError =
  | ApprovalServiceError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string };

export type ApprovalActionResult<T = ApprovalActionValue> = Result<
  T,
  ApprovalActionError
>;

export interface ApprovalActionValue {
  approvalStatus: string;
  failedAction: string | null;
  id: string;
  xeroWriteError: string | null;
}

export async function approveAction(input: {
  organisationId: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  const result = await approve(context.value, XeroWriteAdapter);
  if (!result.ok) {
    return result;
  }
  if (result.value.approvedAt) {
    try {
      const first = await database.availabilityRecord.findFirst({
        orderBy: { approved_at: "asc" },
        select: { approved_at: true },
        where: {
          approved_at: { not: null },
          clerk_org_id: context.value.clerkOrgId,
          organisation_id: context.value.organisationId,
        },
      });
      if (!first?.approved_at) {
        revalidateApprovalWritePaths();
        return approvalValue(result.value);
      }
      const event = createActivationEvent({
        deduplicationKey: `${context.value.clerkOrgId}:${context.value.organisationId}`,
        name: "First Leave Approved",
        occurredAt: first.approved_at,
        subjectId: context.value.clerkOrgId,
      });
      analytics?.capture({
        distinctId: event.distinctId,
        event: event.event,
        properties: event.properties,
        timestamp: event.timestamp,
        uuid: event.uuid,
      });
      await analytics?.flush();
    } catch (error) {
      log.warn("Leave approval activation capture failed", { error });
    }
  }
  revalidateApprovalWritePaths();
  return approvalValue(result.value);
}

export async function declineAction(input: {
  organisationId: string;
  reason: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  const parsed = DeclineActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await decline(
    {
      ...context.value,
      reason: parsed.data.reason,
      recordId: parsed.data.recordId,
    },
    XeroWriteAdapter
  );
  if (!result.ok) {
    return result;
  }
  revalidateApprovalWritePaths();
  return approvalValue(result.value);
}

export async function requestMoreInfoAction(input: {
  organisationId: string;
  question: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  const parsed = RequestInfoActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await requestMoreInfo({
    ...context.value,
    question: parsed.data.question,
    recordId: parsed.data.recordId,
  });
  if (!result.ok) {
    return result;
  }
  revalidatePath("/leave-approvals");
  revalidatePath("/notifications");
  return approvalValue(result.value);
}

export async function retryApprovalAction(input: {
  organisationId: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  const result = await retryApproval(context.value, XeroWriteAdapter);
  if (!result.ok) {
    return result;
  }
  revalidateApprovalWritePaths();
  return approvalValue(result.value);
}

export async function retryDeclineAction(input: {
  organisationId: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  const result = await retryDecline(context.value, XeroWriteAdapter);
  if (!result.ok) {
    return result;
  }
  revalidateApprovalWritePaths();
  return approvalValue(result.value);
}

export async function revertApprovalAttemptAction(input: {
  organisationId: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  const result = await revertApprovalAttempt(context.value);
  if (!result.ok) {
    return result;
  }
  revalidatePath("/leave-approvals");
  revalidatePath("/plans");
  return approvalValue(result.value);
}

export async function dispatchApprovalReconciliationAction(input: {
  organisationId: string;
}): Promise<ApprovalActionResult<{ queued: boolean; reason?: string }>> {
  const parsed = ReconciliationActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId, {
    adminOnly: true,
  });
  if (!context.ok) {
    return context;
  }
  const result = await dispatchApprovalReconciliation(context.value);
  if (!result.ok) {
    return result;
  }
  revalidatePath("/leave-approvals");
  return result;
}

export async function dispatchXeroLeaveSyncAction(input: {
  organisationId: string;
}): Promise<ApprovalActionResult<{ queued: boolean; reason?: string }>> {
  const parsed = ReconciliationActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId, {
    adminOnly: true,
  });
  if (!context.ok) {
    return context;
  }
  const result = await dispatchXeroLeaveSync(context.value);
  if (!result.ok) {
    return result;
  }
  revalidatePath("/leave-approvals");
  revalidatePath("/");
  return result;
}

async function resolveRecordActionContext(input: {
  organisationId: string;
  recordId: string;
}): Promise<
  ApprovalActionResult<{
    actingPersonId: string | null;
    actingUserId: string;
    clerkOrgId: string;
    organisationId: string;
    recordId: string;
    role: ApprovalRole;
  }>
> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return {
    ok: true,
    value: {
      ...context.value,
      recordId: parsed.data.recordId,
    },
  };
}

async function resolveActionContext(
  organisationId: string,
  options: { adminOnly?: boolean } = {}
): Promise<
  ApprovalActionResult<{
    actingPersonId: string | null;
    actingUserId: string;
    clerkOrgId: string;
    organisationId: string;
    role: ApprovalRole;
  }>
> {
  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
  ]);
  const role = effectiveRole(orgRole);
  if (!(user && role) || (options.adminOnly && role === "manager")) {
    return notAuthorised();
  }
  if (!context.ok) {
    return notAuthorised(context.error.message);
  }

  const actingPerson = await database.person.findFirst({
    select: { id: true },
    where: {
      archived_at: null,
      clerk_org_id: context.value.clerkOrgId,
      clerk_user_id: user.id,
      organisation_id: context.value.organisationId,
    },
  });

  return {
    ok: true,
    value: {
      actingPersonId: actingPerson?.id ?? null,
      actingUserId: user.id,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      role,
    },
  };
}

function effectiveRole(role: string | null | undefined): ApprovalRole | null {
  if (role === "org:owner") {
    return "owner";
  }
  if (role === "org:admin") {
    return "admin";
  }
  if (role === "org:manager") {
    return "manager";
  }
  return null;
}

function revalidateApprovalWritePaths() {
  revalidatePath("/leave-approvals");
  revalidatePath("/plans");
  revalidatePath("/calendar");
  revalidatePath("/notifications");
  revalidatePath("/");
}

function approvalValue(
  record: ApprovalListItem
): ApprovalActionResult<ApprovalActionValue> {
  return {
    ok: true,
    value: {
      approvalStatus: record.approvalStatus,
      failedAction: record.failedAction,
      id: record.id,
      xeroWriteError: record.xeroWriteError,
    },
  };
}

function notAuthorised(message?: string): ApprovalActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: message ?? "You do not have permission to manage approvals.",
    },
    ok: false,
  };
}

function validationError(message?: string): ApprovalActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid approval request.",
    },
    ok: false,
  };
}
