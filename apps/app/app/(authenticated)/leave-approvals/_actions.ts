"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  type ApprovalListItem,
  type ApprovalRole,
  type ApprovalServiceError,
  approve,
  decline,
  dispatchApprovalReconciliation,
  requestMoreInfo,
  retryApproval,
  retryDecline,
  revertApprovalAttempt,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
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
    where: {
      clerk_org_id: context.value.clerkOrgId,
      organisation_id: context.value.organisationId,
      archived_at: null,
      clerk_user_id: user.id,
    },
    select: { id: true },
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
    ok: false,
    error: {
      code: "not_authorised",
      message: message ?? "You do not have permission to manage approvals.",
    },
  };
}

function validationError(message?: string): ApprovalActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid approval request.",
    },
  };
}
