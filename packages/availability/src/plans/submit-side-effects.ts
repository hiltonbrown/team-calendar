import "server-only";

import type { Result } from "@repo/core";
import {
  database,
  fenceSubmitRecoverySideEffectClaim,
  type OutboundOperationAttemptScope,
} from "@repo/database";
import { materialiseAvailabilityPublication } from "@repo/feeds";
import { dispatchNotification } from "@repo/notifications";

class NotificationDispatchRollback extends Error {}

export async function completeSubmitSideEffects(input: {
  actorUserId: string;
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

  if (input.notifyManager && input.manager) {
    const { manager } = input;
    let notified = false;
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
          select: { id: true },
          where: checkpointWhere(
            input,
            "availability_records.submit_notification_completed"
          ),
        });
        if (checkpoint) {
          return true;
        }
        const result = await dispatchNotification(
          {
            actionUrl: `/leave-approvals?recordId=${input.recordId}`,
            actorUserId: input.actorUserId,
            body: "A leave request is ready for review.",
            clerkOrgId: input.clerkOrgId,
            objectId: input.recordId,
            objectType: "availability_record",
            organisationId: input.organisationId,
            recipientPersonId: manager.personId,
            recipientUserId: manager.clerkUserId,
            title: "Leave submitted for approval",
            type: "leave_submitted",
          },
          tx,
          { publishRealtime: false }
        );
        if (!result.ok) {
          throw new NotificationDispatchRollback();
        }
        await tx.auditEvent.create({
          data: checkpointData(
            input,
            "availability_records.submit_notification_completed"
          ),
        });
        return true;
      });
    } catch (error) {
      if (!(error instanceof NotificationDispatchRollback)) {
        throw error;
      }
    }
    if (!notified) {
      return failure("Manager notification is awaiting retry.");
    }
  }
  return { ok: true, value: undefined };
}

function checkpointWhere(
  input: { clerkOrgId: string; organisationId: string; recordId: string },
  action: string
) {
  return {
    action,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    resource_id: input.recordId,
  };
}

function checkpointData(
  input: {
    actorUserId: string;
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
