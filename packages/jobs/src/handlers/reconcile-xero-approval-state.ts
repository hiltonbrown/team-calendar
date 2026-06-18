import "server-only";

import { clerkClient } from "@repo/auth/server";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import {
  dispatchNotification,
  type NotificationDispatchDatabase,
  publishOrganisationNotificationEvent,
} from "@repo/notifications";
import { log } from "@repo/observability/log";
import {
  ensureFreshXeroConnection,
  fetchLeaveApplicationStatusForRegion,
  toPlainLanguageMessage,
  type XeroLeaveApplicationStatus,
  type XeroWriteError,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const ReconcileInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  xeroTenantId: z.string().uuid(),
});

export type ReconcileApprovalStateInput = z.infer<typeof ReconcileInputSchema>;

export type ReconcileApprovalStateError =
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const ACTIVE_STATUSES = ["submitted", "approved", "declined"] as const;
const BATCH_SIZE = 50;
const STALE_RUN_WINDOW_MS = 30 * 60 * 1000;
const FailedRecordTypeSchema = z.enum([
  "people",
  "leave_records",
  "leave_balances",
  "approval_state_reconciliation",
  "leave",
  "annual_leave",
  "personal_leave",
  "holiday",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
  "public_holiday",
  "wfh",
  "travel",
  "travelling",
  "training",
  "client_site",
  "another_office",
  "offsite_meeting",
  "contractor_unavailable",
  "limited_availability",
  "alternative_contact",
  "other",
  "leave_request",
]);

interface ReconciliationRecord {
  approval_status: string;
  id: string;
  person: {
    clerk_user_id: string | null;
    first_name: string;
    id: string;
    last_name: string;
  };
  record_type: string;
  source_remote_id: string | null;
}

export const reconcileXeroApprovalStateFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      cancelOn: [
        {
          event: "cancel-sync-run",
          if: "async.data.runId == event.data.runId",
        },
      ],
      id: "reconcile-xero-approval-state",
      triggers: { event: "reconcile-xero-approval-state" },
    },
    async ({ event, step }) =>
      await step.run("reconcile-approval-state", async () =>
        reconcileXeroApprovalState(event.data)
      )
  );

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This handler coordinates run lifecycle, batching, per-record outcomes and finalisation.
export async function reconcileXeroApprovalState(input: unknown): Promise<
  Result<
    {
      archivedMissing: number;
      approved: number;
      declined: number;
      failed: number;
      matched: number;
      runId: string;
      status: "cancelled" | "failed" | "partial_success" | "succeeded";
      withdrawn: number;
    },
    ReconcileApprovalStateError
  >
> {
  const parsed = ReconcileInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const context = parsed.data;
  const startedAt = new Date();
  let runId: string | null = null;

  try {
    const existingRun = await database.syncRun.findFirst({
      where: {
        ...scoped(context),
        run_type: "approval_state_reconciliation",
        started_at: { gte: new Date(Date.now() - STALE_RUN_WINDOW_MS) },
        status: "running",
        xero_tenant_id: context.xeroTenantId,
      },
      select: { id: true },
    });

    if (existingRun) {
      const cancelled = await database.syncRun.create({
        data: {
          ...scoped(context),
          completed_at: new Date(),
          error_summary: "Another reconciliation run is already in progress",
          run_type: "approval_state_reconciliation",
          started_at: startedAt,
          status: "cancelled",
          trigger_type: context.triggerType,
          triggered_by_user_id: context.triggeredByUserId ?? null,
          xero_tenant_id: context.xeroTenantId,
        },
        select: { id: true },
      });
      return {
        ok: true,
        value: emptyResult(cancelled.id, "cancelled"),
      };
    }

    const run = await database.syncRun.create({
      data: {
        ...scoped(context),
        run_type: "approval_state_reconciliation",
        started_at: startedAt,
        status: "running",
        trigger_type: context.triggerType,
        triggered_by_user_id: context.triggeredByUserId ?? null,
        xero_tenant_id: context.xeroTenantId,
      },
      select: { id: true },
    });
    runId = run.id;

    publishRunStatusChanged(context, run.id, "running");

    const loadedTenant = await loadXeroTenant(context);
    if (loadedTenant?.sync_paused_at) {
      await completeRun(context, run.id, {
        errorSummary: "Tenant sync is paused for this Xero connection",
        status: "cancelled",
      });
      return { ok: true, value: emptyResult(run.id, "cancelled") };
    }
    if (!loadedTenant) {
      await completeRun(context, run.id, {
        errorSummary: "Xero connection not active",
        status: "failed",
      });
      return { ok: true, value: emptyResult(run.id, "failed") };
    }
    // Refresh the access token proactively before any Xero read.
    const freshness = await ensureFreshXeroConnection({
      clerkOrgId: context.clerkOrgId,
      connectionId: loadedTenant.xero_connection_id,
      organisationId: context.organisationId,
    });
    if (!freshness.ok) {
      await completeRun(context, run.id, {
        errorSummary: "Xero connection not active",
        status: "failed",
      });
      return { ok: true, value: emptyResult(run.id, "failed") };
    }
    const xeroTenant = freshness.value.refreshed
      ? await loadXeroTenant(context)
      : loadedTenant;
    if (!xeroTenant) {
      await completeRun(context, run.id, {
        errorSummary: "Xero connection not active",
        status: "failed",
      });
      return { ok: true, value: emptyResult(run.id, "failed") };
    }

    const records = await database.availabilityRecord.findMany({
      where: {
        ...scoped(context),
        archived_at: null,
        approval_status: { in: [...ACTIVE_STATUSES] },
        source_remote_id: { not: null },
      },
      include: {
        person: {
          select: {
            clerk_user_id: true,
            first_name: true,
            id: true,
            last_name: true,
            manager: { select: { clerk_user_id: true, id: true } },
          },
        },
      },
      orderBy: { created_at: "asc" },
    });

    const counts = {
      archivedMissing: 0,
      approved: 0,
      declined: 0,
      failed: 0,
      matched: 0,
      withdrawn: 0,
    };

    for (let index = 0; index < records.length; index += BATCH_SIZE) {
      const runState = await database.syncRun.findFirst({
        where: { ...scoped(context), id: run.id },
        select: { cancel_requested_at: true },
      });
      if (runState?.cancel_requested_at) {
        await completeRun(context, run.id, {
          counts,
          recordsFetched: records.length,
          status: "cancelled",
        });
        return {
          ok: true,
          value: { ...counts, runId: run.id, status: "cancelled" },
        };
      }

      const batch = records.slice(index, index + BATCH_SIZE);
      for (const record of batch) {
        const xeroLeaveApplicationId = record.source_remote_id;
        if (!xeroLeaveApplicationId) {
          continue;
        }
        const status = await fetchLeaveApplicationStatusForRegion(
          xeroTenant.payroll_region,
          { xeroLeaveApplicationId, xeroTenant }
        );
        if (!status.ok) {
          if (isBlanketFailure(status.error)) {
            await completeRun(context, run.id, {
              counts,
              errorSummary: toPlainLanguageMessage(status.error),
              recordsFetched: records.length,
              status: "failed",
            });
            return {
              ok: true,
              value: { ...counts, runId: run.id, status: "failed" },
            };
          }
          await recordFailure(context, {
            error: status.error,
            rawPayload: status.error.rawPayload ?? null,
            recordId: record.id,
            recordType: record.record_type,
            runId: run.id,
            sourceRemoteId: xeroLeaveApplicationId,
          });
          if (status.error.code === "not_found_error") {
            await archiveMissing(
              context,
              run.id,
              record,
              xeroLeaveApplicationId
            );
            counts.archivedMissing += 1;
          }
          counts.failed += 1;
          continue;
        }

        const reconciled = await reconcileRecord(context, run.id, record, {
          approvedAt: status.value.approvedAt,
          rawPayload: status.value.rawResponse,
          status: status.value.status,
          xeroLeaveApplicationId,
        });
        counts[reconciled] += 1;
      }
      if (index + BATCH_SIZE < records.length) {
        await sleep(150);
      }
    }

    const finalStatus = counts.failed > 0 ? "partial_success" : "succeeded";
    await completeRun(context, run.id, {
      counts,
      recordsFetched: records.length,
      status: finalStatus,
    });
    await notifyCompletion(context, run.id, counts);
    return {
      ok: true,
      value: { ...counts, runId: run.id, status: finalStatus },
    };
  } catch (error) {
    log.error("Unhandled exception in reconcileXeroApprovalState:", { error });
    if (runId) {
      await completeRun(context, runId, {
        errorSummary:
          error instanceof Error ? error.message : "Unhandled exception",
        status: "failed",
      });
    }
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to reconcile Xero approval state.",
      },
    };
  }
}

async function reconcileRecord(
  context: ReconcileApprovalStateInput,
  runId: string,
  record: ReconciliationRecord,
  xero: {
    approvedAt: Date | null;
    rawPayload: unknown;
    status: XeroLeaveApplicationStatus;
    xeroLeaveApplicationId: string;
  }
): Promise<"approved" | "declined" | "matched" | "withdrawn"> {
  if (xero.status === "APPROVED" && record.approval_status === "submitted") {
    await transitionRecord(context, runId, record, {
      action: "availability_records.reconciled_to_approved",
      data: {
        approval_status: "approved",
        approved_at: xero.approvedAt ?? new Date(),
        derived_sequence: { increment: 1 },
        xero_write_error: null,
        xero_write_error_raw: Prisma.DbNull,
      },
      notificationType: "leave_approved",
      xeroLeaveApplicationId: xero.xeroLeaveApplicationId,
    });
    return "approved";
  }

  if (xero.status === "REJECTED" && record.approval_status === "submitted") {
    await transitionRecord(context, runId, record, {
      action: "availability_records.reconciled_to_declined",
      data: {
        approval_note: "Declined in Xero Payroll",
        approval_status: "declined",
        derived_sequence: { increment: 1 },
      },
      notificationType: "leave_declined",
      xeroLeaveApplicationId: xero.xeroLeaveApplicationId,
    });
    return "declined";
  }

  if (
    (xero.status === "WITHDRAWN" || xero.status === "DELETED") &&
    record.approval_status !== "withdrawn"
  ) {
    await transitionRecord(context, runId, record, {
      action: "availability_records.reconciled_to_withdrawn",
      data: {
        approval_status: "withdrawn",
        derived_sequence: { increment: 1 },
        withdrawn_at: new Date(),
      },
      notificationType: "leave_withdrawn",
      xeroLeaveApplicationId: xero.xeroLeaveApplicationId,
    });
    return "withdrawn";
  }

  return "matched";
}

async function transitionRecord(
  context: ReconcileApprovalStateInput,
  runId: string,
  record: ReconciliationRecord,
  options: {
    action: string;
    data: Record<string, unknown>;
    notificationType: "leave_approved" | "leave_declined" | "leave_withdrawn";
    xeroLeaveApplicationId: string;
  }
) {
  await database.$transaction(async (tx) => {
    await tx.availabilityRecord.updateMany({
      data: options.data,
      where: { ...scoped(context), id: record.id },
    });
    await tx.auditEvent.create({
      data: {
        ...auditBase(context, options.action, runId, record.id),
        payload: {
          runId,
          xeroLeaveApplicationId: options.xeroLeaveApplicationId,
        },
      },
    });
    await notifyRecordOwner(tx, context, record, options.notificationType);
  });
}

async function archiveMissing(
  context: ReconcileApprovalStateInput,
  runId: string,
  record: ReconciliationRecord,
  xeroLeaveApplicationId: string
) {
  await database.$transaction(async (tx) => {
    await tx.availabilityRecord.updateMany({
      data: {
        archived_at: new Date(),
        publish_status: "archived",
      },
      where: { ...scoped(context), id: record.id },
    });
    await tx.auditEvent.create({
      data: {
        ...auditBase(
          context,
          "availability_records.reconciled_to_archived_missing",
          runId,
          record.id
        ),
        payload: { runId, xeroLeaveApplicationId },
      },
    });
  });
}

async function notifyRecordOwner(
  tx: NotificationDispatchDatabase,
  context: ReconcileApprovalStateInput,
  record: ReconciliationRecord,
  type: "leave_approved" | "leave_declined" | "leave_withdrawn"
) {
  if (!record.person.clerk_user_id) {
    return;
  }
  await dispatchNotification(
    {
      actionUrl: `/plans?recordId=${record.id}`,
      actorUserId: context.triggeredByUserId ?? null,
      body: notificationBody(record, type),
      clerkOrgId: context.clerkOrgId,
      objectId: record.id,
      objectType: "availability_record",
      organisationId: context.organisationId,
      recipientPersonId: record.person.id,
      recipientUserId: record.person.clerk_user_id,
      title: notificationTitle(type),
      type,
    },
    tx
  );
}

async function notifyCompletion(
  context: ReconcileApprovalStateInput,
  runId: string,
  counts: {
    archivedMissing: number;
    approved: number;
    declined: number;
    withdrawn: number;
  }
) {
  const recipients = await completionRecipients(context);
  const body = `Reconciliation completed: ${counts.approved} approved, ${counts.declined} declined, ${counts.withdrawn} withdrawn, ${counts.archivedMissing} archived-missing`;
  for (const userId of recipients) {
    await dispatchNotification({
      actionUrl: `/sync/${runId}`,
      actorUserId: context.triggeredByUserId ?? null,
      body,
      clerkOrgId: context.clerkOrgId,
      objectId: runId,
      objectType: "sync_run",
      organisationId: context.organisationId,
      recipientUserId: userId,
      title: "Approval reconciliation complete",
      type: "sync_reconciliation_complete",
    });
  }
}

async function completionRecipients(
  context: ReconcileApprovalStateInput
): Promise<string[]> {
  if (context.triggeredByUserId) {
    return [context.triggeredByUserId];
  }
  try {
    const clerk = await clerkClient();
    const memberships = await clerk.organizations.getOrganizationMembershipList(
      {
        organizationId: context.clerkOrgId,
        limit: 100,
      }
    );
    return memberships.data
      .filter(
        (membership) =>
          membership.role === "org:admin" || membership.role === "org:owner"
      )
      .map((membership) => membership.publicUserData?.userId)
      .filter((userId): userId is string => Boolean(userId));
  } catch (error) {
    log.error("Failed to load reconciliation notification recipients:", {
      error,
    });
    return [];
  }
}

async function recordFailure(
  context: ReconcileApprovalStateInput,
  input: {
    error: XeroWriteError;
    rawPayload: unknown;
    recordId: string;
    recordType: string;
    runId: string;
    sourceRemoteId: string;
  }
) {
  await database.failedRecord.create({
    data: {
      ...scoped(context),
      entity_type: "leave_records",
      error_code:
        input.error.code === "not_found_error"
          ? "xero_application_missing"
          : input.error.code,
      error_message:
        input.error.code === "not_found_error"
          ? "The Xero leave application no longer exists. The LeaveSync record has been archived."
          : toPlainLanguageMessage(input.error),
      raw_payload: toPrismaJsonValue(input.rawPayload),
      record_type: failedRecordType(input.recordType),
      source_id: input.sourceRemoteId,
      source_remote_id: input.sourceRemoteId,
      sync_run_id: input.runId,
    },
  });
}

function failedRecordType(
  value: string
): z.infer<typeof FailedRecordTypeSchema> {
  const parsed = FailedRecordTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : "leave_records";
}

async function completeRun(
  context: ReconcileApprovalStateInput,
  runId: string,
  input: {
    counts?: {
      archivedMissing: number;
      approved: number;
      declined: number;
      failed: number;
      matched: number;
      withdrawn: number;
    };
    errorSummary?: string;
    recordsFetched?: number;
    status: "cancelled" | "failed" | "partial_success" | "succeeded";
  }
) {
  await database.syncRun.updateMany({
    data: {
      completed_at: new Date(),
      error_summary: input.errorSummary ?? null,
      records_failed: input.counts?.failed ?? 0,
      records_fetched: input.recordsFetched ?? 0,
      records_skipped: input.counts?.matched ?? 0,
      records_synced:
        (input.counts?.approved ?? 0) +
        (input.counts?.declined ?? 0) +
        (input.counts?.withdrawn ?? 0) +
        (input.counts?.archivedMissing ?? 0),
      records_upserted:
        (input.counts?.approved ?? 0) +
        (input.counts?.declined ?? 0) +
        (input.counts?.withdrawn ?? 0) +
        (input.counts?.archivedMissing ?? 0),
      status: input.status,
    },
    where: { ...scoped(context), id: runId },
  });
  publishRunStatusChanged(context, runId, input.status);
}

function loadXeroTenant(context: ReconcileApprovalStateInput) {
  return database.xeroTenant.findFirst({
    include: {
      xero_connection: {
        select: {
          access_token_auth_tag: true,
          access_token_encrypted: true,
          access_token_iv: true,
          expires_at: true,
          last_refreshed_at: true,
          status: true,
          revoked_at: true,
        },
      },
    },
    where: {
      ...scoped(context),
      id: context.xeroTenantId,
      organisation_id: context.organisationId,
    },
  });
}

function isBlanketFailure(error: XeroWriteError): boolean {
  return error.code === "auth_error" || error.code === "rate_limit_error";
}

function publishRunStatusChanged(
  context: ReconcileApprovalStateInput,
  runId: string,
  status: string
) {
  publishOrganisationNotificationEvent(
    { organisationId: context.organisationId },
    {
      type: "sync.run_status_changed",
      payload: {
        organisationId: context.organisationId,
        runId,
        runType: "approval_state_reconciliation",
        status,
        xeroTenantId: context.xeroTenantId,
      },
    }
  );
}

function auditBase(
  context: ReconcileApprovalStateInput,
  action: string,
  _runId: string,
  recordId: string
) {
  return {
    action,
    actor_user_id: context.triggeredByUserId ?? null,
    clerk_org_id: context.clerkOrgId,
    organisation_id: context.organisationId,
    resource_id: recordId,
    resource_type: "availability_record",
  };
}

function notificationTitle(
  type: "leave_approved" | "leave_declined" | "leave_withdrawn"
) {
  if (type === "leave_approved") {
    return "Leave approved";
  }
  if (type === "leave_declined") {
    return "Leave declined";
  }
  return "Leave withdrawn";
}

function notificationBody(
  record: ReconciliationRecord,
  type: "leave_approved" | "leave_declined" | "leave_withdrawn"
) {
  const name = `${record.person.first_name} ${record.person.last_name}`;
  if (type === "leave_approved") {
    return `${name}'s leave request was approved in Xero Payroll.`;
  }
  if (type === "leave_declined") {
    return `${name}'s leave request was declined in Xero Payroll.`;
  }
  return `${name}'s leave request was withdrawn in Xero Payroll.`;
}

function scoped(input: { clerkOrgId: string; organisationId: string }) {
  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
}

function emptyResult(
  runId: string,
  status: "cancelled" | "failed" | "partial_success" | "succeeded"
) {
  return {
    archivedMissing: 0,
    approved: 0,
    declined: 0,
    failed: 0,
    matched: 0,
    runId,
    status,
    withdrawn: 0,
  };
}

function toPrismaJsonValue(
  value: unknown
): Exclude<JsonValue, null> | typeof Prisma.JsonNull {
  const jsonValue = toJsonValue(value);
  return jsonValue === null ? Prisma.JsonNull : jsonValue;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = toJsonValue(item);
    }
    return output;
  }
  return String(value);
}

function validationError(
  error: z.ZodError
): Result<never, ReconcileApprovalStateError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid reconciliation request.",
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
