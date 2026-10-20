import {
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantResult,
} from "@repo/database";
import "server-only";

import type { Result } from "@repo/core";
import {
  fenceSubmitRecoverySideEffectClaim,
  type OutboundOperationAttemptScope,
  withTenantDb,
} from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import {
  dispatchNotification,
  prepareNotificationPublication,
  sendPreparedNotificationPublication,
} from "@repo/notifications";
import { z } from "zod";

class NotificationDispatchRollback extends Error {}

export async function completeSubmitSideEffects(input: {
  actorUserId: string;
  declineReason?: string | null;
  approvalRecipient?: { clerkUserId: string; personId: string } | null;
  attempt: OutboundOperationAttemptScope;
  claimedAt: Date;
  clerkOrgId: string;
  manager: { clerkUserId: string; personId: string } | null;
  notifyManager: boolean;
  organisationId: string;
  recordId: string;
}): Promise<Result<void, { message: string }>> {
  assertNoTenantTransaction("completeSubmitSideEffects");
  const publication = await withTenantDb(input.clerkOrgId, (db) =>
    db.auditEvent.findFirst({
      select: { id: true },
      where: checkpointWhere(
        input,
        "availability_records.submit_publication_completed"
      ),
    })
  );
  if (!publication) {
    const phaseInput1 = {
      availabilityRecordId: input.recordId,
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    } satisfies Parameters<typeof materialiseAvailabilityPublication>[0];
    const result = await withTenantResult(
      phaseInput1.clerkOrgId,
      (db) => materialiseAvailabilityPublication(phaseInput1, db),
      TENANT_READ_TRANSACTION_OPTIONS
    );
    if (!result.ok) {
      return failure("Calendar publication is awaiting retry.");
    }
    await withTenantDb(input.clerkOrgId, (db) =>
      db.auditEvent.create({
        data: checkpointData(
          input,
          "availability_records.submit_publication_completed"
        ),
      })
    );
  }

  const notification = notificationForAction(
    input.attempt.action,
    input.recordId,
    input.declineReason
  );
  const recipient =
    input.approvalRecipient ?? (input.notifyManager ? input.manager : null);
  if (recipient) {
    const manager = recipient;
    let notified: false | { notificationId: string | null } = false;
    try {
      notified = await withTenantDb(input.clerkOrgId, async (tx) => {
        if (
          !(await fenceSubmitRecoverySideEffectClaim(
            input.attempt,
            input.claimedAt,
            tx
          ))
        ) {
          return false;
        }
        const checkpoint = await tx.auditEvent.findFirst({
          select: { id: true, metadata: true },
          where: checkpointWhere(
            input,
            "availability_records.submit_notification_completed"
          ),
        });
        if (checkpoint) {
          const metadata = z
            .object({ notificationId: z.string().nullable().optional() })
            .safeParse(checkpoint.metadata);
          return {
            notificationId: metadata.success
              ? (metadata.data.notificationId ?? null)
              : null,
          };
        }
        const result = await dispatchNotification(
          {
            ...notification,
            actorUserId: input.actorUserId,
            clerkOrgId: input.clerkOrgId,
            objectId: input.recordId,
            objectType: "availability_record",
            organisationId: input.organisationId,
            recipientPersonId: manager.personId,
            recipientUserId: manager.clerkUserId,
          },
          { publishRealtime: false },
          tx
        );
        if (!result.ok) {
          throw new NotificationDispatchRollback();
        }
        await tx.auditEvent.create({
          data: {
            ...checkpointData(
              input,
              "availability_records.submit_notification_completed"
            ),
            metadata: { notificationId: result.value.notificationId },
          },
        });
        return { notificationId: result.value.notificationId };
      });
    } catch (error) {
      if (!(error instanceof NotificationDispatchRollback)) {
        throw error;
      }
    }
    if (!notified) {
      return failure("Leave notification is awaiting retry.");
    }
    if (notified.notificationId) {
      try {
        const { notificationId } = notified;
        const prepared = await withTenantDb(input.clerkOrgId, (db) =>
          prepareNotificationPublication(
            {
              clerkOrgId: input.clerkOrgId,
              notificationId,
              organisationId: input.organisationId,
            },
            db
          )
        );
        await sendPreparedNotificationPublication(prepared);
      } catch {
        return failure("Leave notification delivery is awaiting retry.");
      }
    }
  }
  return { ok: true, value: undefined };
}

function checkpointWhere(
  input: {
    clerkOrgId: string;
    organisationId: string;
    recordId: string;
    attempt?: OutboundOperationAttemptScope;
  },
  action: string
) {
  return {
    action: input.attempt?.action
      ? action.replace(
          "submit_",
          input.attempt.action === "approve"
            ? "approval_"
            : `${input.attempt.action}_`
        )
      : action,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    resource_id: input.recordId,
  };
}

function checkpointData(
  input: {
    actorUserId: string;
    attempt?: OutboundOperationAttemptScope;
    clerkOrgId: string;
    organisationId: string;
    recordId: string;
  },
  action: string
) {
  return {
    ...checkpointWhere(input, action),
    actor_user_id: input.actorUserId,
    resource_type: "availability_record",
  };
}

function failure(message: string): { error: { message: string }; ok: false } {
  return { error: { message }, ok: false };
}

function notificationForAction(
  action: OutboundOperationAttemptScope["action"],
  recordId: string,
  declineReason?: string | null
) {
  switch (action) {
    case "approve":
      return {
        actionUrl: `/plans?recordId=${recordId}`,
        body: "Your leave request has been approved.",
        title: "Leave approved",
        type: "leave_approved" as const,
      };
    case "decline":
      return {
        actionUrl: `/plans?recordId=${recordId}`,
        body: declineReason ?? "Your leave request has been declined.",
        title: "Leave declined",
        type: "leave_declined" as const,
      };
    default:
      return {
        actionUrl: `/leave-approvals?recordId=${recordId}`,
        body: "A leave request has been withdrawn.",
        title: "Leave withdrawn",
        type: "leave_withdrawn" as const,
      };
  }
}
