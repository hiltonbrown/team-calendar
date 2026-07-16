import type { Database } from "@repo/database";
import type { notification_type } from "@repo/database/generated/enums";
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
        xeroTenantId: string | null;
      };
    };

export interface NotificationSseRecipientDatabase {
  person: Pick<Database["person"], "findMany">;
}

export function streamKey(input: {
  organisationId: string;
  userId: string;
}): string {
  return `${input.userId}:${input.organisationId}`;
}

export function notificationSseChannel(input: {
  organisationId: string;
  userId: string;
}): string {
  return `sse:${streamKey(input)}`;
}

export function pollNotificationStream(
  input: { organisationId: string; userId: string },
  sinceId: string
): Promise<NotificationSseStreamEntry[]> {
  const client = getNotificationSseStreamClient();
  if (!client) {
    return Promise.resolve([]);
  }
  return client.readSince(notificationSseChannel(input), sinceId);
}

export async function publishNotificationEvent(
  input: { organisationId: string; userId: string },
  event: NotificationSseEvent
): Promise<void> {
  const client = getNotificationSseStreamClient();
  if (!client) {
    return;
  }
  await client.append(notificationSseChannel(input), event);
}

export async function publishOrganisationNotificationEvent(
  input: { clerkOrgId: string; organisationId: string },
  event: NotificationSseEvent,
  client?: NotificationSseRecipientDatabase
): Promise<void> {
  const streamClient = getNotificationSseStreamClient();
  if (!streamClient) {
    return;
  }

  const recipientClient = client ?? (await import("@repo/database")).database;
  const recipients = await recipientClient.person.findMany({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      clerk_user_id: { not: null },
      is_active: true,
      organisation_id: input.organisationId,
    },
    select: { clerk_user_id: true },
  });
  await Promise.all(
    recipients.flatMap((recipient) =>
      recipient.clerk_user_id
        ? [
            streamClient.append(
              notificationSseChannel({
                organisationId: input.organisationId,
                userId: recipient.clerk_user_id,
              }),
              event
            ),
          ]
        : []
    )
  );
}
