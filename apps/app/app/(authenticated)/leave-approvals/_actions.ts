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
  managerScopePersonIds,
  prepareApprovalSync,
  requestMoreInfo,
  retryApproval,
  retryDecline,
  revertApprovalAttempt,
  sendPreparedApprovalSync,
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
import { z } from "zod";

const RecordActionSchema = z.object({
  recordId: z.string().uuid(),
});
const DeclineActionSchema = RecordActionSchema.extend({
  reason: z.string().trim().max(1000),
});
const RequestInfoActionSchema = RecordActionSchema.extend({
  question: z.string().trim().min(3).max(1000),
});
export type ApprovalActionError =
  | ApprovalServiceError
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    };
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
  recordId: string;
}): Promise<ApprovalActionResult> {
  assertNoTenantTransaction("approveAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await approve(context.value, XeroWriteAdapter);
    if (!result.ok) {
      return result;
    }
    if (result.value.approvedAt) {
      try {
        const first = await withTenantDb(context.value.clerkOrgId, (db) =>
          db.availabilityRecord.findFirst({
            orderBy: { approved_at: "asc" },
            select: { approved_at: true },
            where: {
              approved_at: { not: null },
              clerk_org_id: context.value.clerkOrgId,
              organisation_id: context.value.organisationId,
            },
          })
        );
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
  })();
}
export async function declineAction(input: {
  reason: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  assertNoTenantTransaction("declineAction");
  const parsed = DeclineActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveRecordActionContext(parsed.data);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
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
  })();
}
export async function requestMoreInfoAction(input: {
  question: string;
  recordId: string;
}): Promise<ApprovalActionResult> {
  assertNoTenantTransaction("requestMoreInfoAction");
  const parsed = RequestInfoActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await authenticatedApprovalActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(actor.value.clerkOrgId, async (db) => {
      const context = await loadRecordActionContext(
        actor.value,
        parsed.data.recordId,
        db
      );
      if (!context.ok) {
        return context;
      }
      const result = await requestMoreInfo(
        { ...context.value, question: parsed.data.question },
        db
      );
      if (!result.ok) {
        return result;
      }
      afterTenantCommit(db, () => {
        revalidatePath("/leave-approvals");
        revalidatePath("/notifications");

        return Promise.resolve();
      });
      return approvalValue(result.value);
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to request more information.",
      },
      ok: false,
    };
  }
}
export async function retryApprovalAction(input: {
  recordId: string;
}): Promise<ApprovalActionResult> {
  assertNoTenantTransaction("retryApprovalAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await retryApproval(context.value, XeroWriteAdapter);
    if (!result.ok) {
      return result;
    }
    revalidateApprovalWritePaths();
    return approvalValue(result.value);
  })();
}
export async function retryDeclineAction(input: {
  recordId: string;
}): Promise<ApprovalActionResult> {
  assertNoTenantTransaction("retryDeclineAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await retryDecline(context.value, XeroWriteAdapter);
    if (!result.ok) {
      return result;
    }
    revalidateApprovalWritePaths();
    return approvalValue(result.value);
  })();
}
export async function revertApprovalAttemptAction(input: {
  recordId: string;
}): Promise<ApprovalActionResult> {
  assertNoTenantTransaction("revertApprovalAttemptAction");
  const context = await resolveRecordActionContext(input);
  if (!context.ok) {
    return context;
  }
  return await (async () => {
    const result = await revertApprovalAttempt(context.value);
    if (!result.ok) {
      return result;
    }
    revalidatePath("/leave-approvals");
    revalidatePath("/plans");
    return approvalValue(result.value);
  })();
}
export interface AccountApprovalSyncResult {
  companies: {
    companyId: string;
    companyName: string;
    result: ApprovalActionResult<{ queued: boolean; reason?: string }>;
  }[];
}
export async function dispatchApprovalReconciliationAction(): Promise<
  ApprovalActionResult<AccountApprovalSyncResult>
> {
  assertNoTenantTransaction("dispatchApprovalReconciliationAction");
  return await dispatchAccountApprovalSync("approval_state_reconciliation");
}
export async function dispatchXeroLeaveSyncAction(): Promise<
  ApprovalActionResult<AccountApprovalSyncResult>
> {
  assertNoTenantTransaction("dispatchXeroLeaveSyncAction");
  return await dispatchAccountApprovalSync("leave_records");
}
async function dispatchAccountApprovalSync(
  runType: "leave_records" | "approval_state_reconciliation"
): Promise<ApprovalActionResult<AccountApprovalSyncResult>> {
  const actor = await authenticatedApprovalActor(true);
  if (!actor.ok) {
    return actor;
  }
  try {
    const prepared = await withTenantDb(actor.value.clerkOrgId, async (db) => {
      const companies = await resolveAccountCompanies(
        actor.value.clerkOrgId,
        db
      );
      const connections = await db.xeroConnection.findMany({
        select: { organisation_id: true },
        where: {
          archived_at: null,
          clerk_org_id: actor.value.clerkOrgId,
          organisation_id: { in: companies.map((company) => company.id) },
          released_at: null,
          sync_paused_at: null,
        },
      });
      const snapshots: Array<{
        company: Awaited<ReturnType<typeof resolveAccountCompanies>>[number];
        prepared: Awaited<ReturnType<typeof prepareApprovalSync>>;
      }> = [];
      for (const company of companies.filter((preparedCompany) =>
        connections.some(
          (connection) => connection.organisation_id === preparedCompany.id
        )
      )) {
        snapshots.push({
          company,
          prepared: await prepareApprovalSync(
            { ...actor.value, organisationId: company.id },
            runType,
            db
          ),
        });
      }
      return snapshots;
    });
    const companies: AccountApprovalSyncResult["companies"] = [];
    for (const item of prepared) {
      let result: ApprovalActionResult<{ queued: boolean; reason?: string }>;
      try {
        result = item.prepared.ok
          ? await sendPreparedApprovalSync(item.prepared.value)
          : item.prepared;
      } catch {
        result = {
          error: { code: "unknown_error", message: "Failed to dispatch sync." },
          ok: false,
        };
      }
      companies.push({
        companyId: item.company.id,
        companyName: item.company.name,
        result,
      });
    }
    revalidatePath("/leave-approvals");
    revalidatePath("/");
    return { ok: true, value: { companies } };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to prepare account sync.",
      },
      ok: false,
    };
  }
}
interface ApprovalActor {
  actingUserId: string;
  clerkOrgId: ClerkOrgId;
  role: ApprovalRole;
}
interface RecordActionContext extends ApprovalActor {
  actingPersonId: string | null;
  organisationId: string;
  recordId: string;
}
async function authenticatedApprovalActor(
  adminOnly = false
): Promise<ApprovalActionResult<ApprovalActor>> {
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  const role = effectiveRole(orgRole);
  if (!(orgId && user && role) || (adminOnly && role === "manager")) {
    return notAuthorised();
  }
  // Clerk supplied this authenticated account before SQL preparation.
  return {
    ok: true,
    value: { actingUserId: user.id, clerkOrgId: orgId as ClerkOrgId, role },
  };
}
async function loadRecordActionContext(
  actor: ApprovalActor,
  recordId: string,
  db: TenantDb
): Promise<ApprovalActionResult<RecordActionContext>> {
  assertTenantDb(db, actor.clerkOrgId);
  const companies = await resolveAccountCompanies(actor.clerkOrgId, db);
  const companyIds = companies.map((company) => company.id);
  const record = await db.availabilityRecord.findFirst({
    select: { organisation_id: true, person_id: true },
    where: {
      archived_at: null,
      clerk_org_id: actor.clerkOrgId,
      id: recordId,
      organisation_id: { in: companyIds },
    },
  });
  if (!record) {
    return notAuthorised();
  }
  const person = await db.person.findFirst({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
    where: {
      archived_at: null,
      clerk_org_id: actor.clerkOrgId,
      clerk_user_id: actor.actingUserId,
      organisation_id: { in: companyIds },
    },
  });
  if (actor.role === "manager") {
    if (!person) {
      return notAuthorised();
    }
    const managed = await managerScopePersonIds(
      {
        actingPersonId: person.id,
        clerkOrgId: actor.clerkOrgId,
        excludeSelf: true,
      },
      db
    );
    if (!managed.includes(record.person_id)) {
      return notAuthorised();
    }
  }
  return {
    ok: true,
    value: {
      ...actor,
      actingPersonId: person?.id ?? null,
      organisationId: record.organisation_id,
      recordId,
    },
  };
}
async function resolveRecordActionContext(input: {
  recordId: string;
}): Promise<ApprovalActionResult<RecordActionContext>> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await authenticatedApprovalActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantDb(actor.value.clerkOrgId, (db) =>
      loadRecordActionContext(actor.value, parsed.data.recordId, db)
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to load leave request.",
      },
      ok: false,
    };
  }
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
