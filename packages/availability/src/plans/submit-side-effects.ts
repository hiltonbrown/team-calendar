import "server-only";

import type { Result } from "@repo/core";
import {
  database,
  fenceSubmitRecoverySideEffectClaim,
  type OutboundOperationAttemptScope,
} from "@repo/database";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import {
  dispatchNotification,
  publishPersistedNotification,
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
  const publication = await database.auditEvent.findFirst({
    select: { id: true },
    where: checkpointWhere(
      input,
      "availability_records.submit_publication_completed"
    ),
  });
  if (!publication) {
    const result = await materialiseAvailabilityPublication({
      availabilityRecordId: input.recordId,
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    });
    if (!result.ok) {
      return failure("Calendar publication is awaiting retry.");
    }
    await database.auditEvent.create({
      data: checkpointData(
        input,
        "availability_records.submit_publication_completed"
      ),
    });
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
      notified = await database.$transaction(async (tx) => {
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
          tx,
          { publishRealtime: false }
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
        await publishPersistedNotification({
          clerkOrgId: input.clerkOrgId,
          notificationId: notified.notificationId,
          organisationId: input.organisationId,
        });
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
