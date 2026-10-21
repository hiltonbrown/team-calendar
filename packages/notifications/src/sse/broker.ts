import type { notification_type } from "@repo/database/generated/enums";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import type { NotificationCategory } from "../types/notification-type-registry";
import {
  getNotificationSseStreamClient,
  type NotificationSseStreamEntry,
} from "./redis-stream";

export type NotificationSseEvent =
  | {
      type: "notification.created";
      payload: {
        notificationId: string;
        type: notification_type;
        category: NotificationCategory;
        title: string;
        body: string;
        actionUrl: string | null;
        createdAt: string;
        organisationId: string;
        organisationName: string;
        unreadCount: number;
      };
    }
  | {
      type: "notification.read";
      payload: {
        notificationId: string;
        readAt: string;
        unreadCount: number;
      };
    }
  | {
      type: "notification.all_read";
      payload: {
        unreadCount: 0;
      };
    }
  | {
      type: "sync.run_status_changed";
      payload: {
        organisationId: string;
        runId: string;
        runType: string;
        status: string;
        connectionId: string | null;
      };
    };

export function streamKey(input: {
  clerkOrgId: string;
  userId: string;
}): string {
  return `account:${input.clerkOrgId}:${input.userId}`;
}

export function notificationSseChannel(input: {
  clerkOrgId: string;
  userId: string;
}): string {
  return `sse:${streamKey(input)}`;
}

export function pollNotificationStream(
  input: { clerkOrgId: string; userId: string },
  sinceId: string
): Promise<NotificationSseStreamEntry[]> {
  assertNoTenantTransaction("pollNotificationStream");
  const client = getNotificationSseStreamClient();
  if (!client) {
    return Promise.resolve([]);
  }
  return client.readSince(notificationSseChannel(input), sinceId);
}

export async function publishNotificationEvent(
  input: { clerkOrgId: string; userId: string },
  event: NotificationSseEvent
): Promise<void> {
  assertNoTenantTransaction("publishNotificationEvent");
  const client = getNotificationSseStreamClient();
  if (!client) {
    return;
  }
  await client.append(notificationSseChannel(input), event);
}

export async function publishOrganisationNotificationEvent(
  input: { clerkOrgId: string; organisationId: string },
  event: NotificationSseEvent
): Promise<void> {
  assertNoTenantTransaction("publishOrganisationNotificationEvent");
  const streamClient = getNotificationSseStreamClient();
  if (!streamClient) {
    return;
  }

  const { withTenantDb } = await import("@repo/database");
  const recipients = await withTenantDb(input.clerkOrgId, (db) =>
    db.person.findMany({
      select: { clerk_user_id: true },
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        clerk_user_id: { not: null },
        is_active: true,
        organisation: { clerk_org_id: input.clerkOrgId },
      },
    })
  );
  const userIds = new Set(
    recipients.flatMap((recipient) =>
      recipient.clerk_user_id ? [recipient.clerk_user_id] : []
    )
  );
  await Promise.all(
    [...userIds].map((userId) =>
      streamClient.append(
        notificationSseChannel({ clerkOrgId: input.clerkOrgId, userId }),
        event
      )
    )
  );
}
