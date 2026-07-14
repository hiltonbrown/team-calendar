import "server-only";

import type { Result } from "@repo/core";
import { type Database, database } from "@repo/database";
import type { notification_type } from "@repo/database/generated/enums";
import { z } from "zod";
import { enqueueNotificationEmail } from "./email-queue-service";
import { invalidateUnreadCount } from "./notification-service";
import { publishNotificationEvent } from "./sse/broker";
import {
  emailTemplateForType,
  getTypeConfig,
  isKnownNotificationType,
} from "./types/notification-type-registry";

export type DispatchNotificationError =
  | { code: "invalid_type"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface DispatchNotificationResult {
  emailQueued: boolean;
  inAppDelivered: boolean;
}

export interface NotificationDispatchDatabase {
  notification: Pick<Database["notification"], "create" | "count">;
  notificationEmailQueue: Pick<Database["notificationEmailQueue"], "create">;
  notificationPreference: Pick<
    Database["notificationPreference"],
    "findUnique"
  >;
  person: Pick<Database["person"], "findFirst">;
}

const DispatchSchema = z.object({
  actionUrl: z.string().min(1).nullable().optional(),
  actorUserId: z.string().min(1).nullable().optional(),
  body: z.string().min(1),
  clerkOrgId: z.string().min(1),
  objectId: z.string().uuid().nullable().optional(),
  objectType: z.string().min(1).nullable().optional(),
  organisationId: z.string().uuid(),
  recipientPersonId: z.string().uuid().nullable().optional(),
  recipientUserId: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
});

export async function dispatchNotification(
  input: z.input<typeof DispatchSchema>,
  client: NotificationDispatchDatabase = database
): Promise<Result<DispatchNotificationResult, DispatchNotificationError>> {
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isKnownNotificationType(parsed.data.type)) {
    return {
      ok: false,
      error: { code: "invalid_type", message: "Unknown notification type." },
    };
  }
  const notificationType = parsed.data.type;

  try {
    const [inAppEnabled, emailEnabled] = await Promise.all([
      shouldDeliverToChannel(
        client,
        { ...parsed.data, type: notificationType },
        "in_app"
      ),
      shouldDeliverToChannel(
        client,
        { ...parsed.data, type: notificationType },
        "email"
      ),
    ]);
    const config = getTypeConfig(notificationType);
    let notificationId: string | null = null;
    let inAppDelivered = false;

    if (inAppEnabled) {
      const row = await client.notification.create({
        data: {
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          recipient_user_id: parsed.data.recipientUserId,
          recipient_person_id: parsed.data.recipientPersonId ?? null,
          type: notificationType,
          title: parsed.data.title,
          body: parsed.data.body,
          action_url: parsed.data.actionUrl ?? null,
          object_type: parsed.data.objectType ?? null,
          object_id: parsed.data.objectId ?? null,
          actor_user_id: parsed.data.actorUserId ?? null,
        },
        select: {
          id: true,
          created_at: true,
        },
      });
      notificationId = row.id;
      inAppDelivered = true;
      invalidateUnreadCount({
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        userId: parsed.data.recipientUserId,
      });
      const unreadCount = await client.notification.count({
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          organisation_id: parsed.data.organisationId,
          read_at: null,
          recipient_user_id: parsed.data.recipientUserId,
        },
      });
      publishNotificationEvent(
        {
          organisationId: parsed.data.organisationId,
          userId: parsed.data.recipientUserId,
        },
        {
          type: "notification.created",
          payload: {
            notificationId: row.id,
            type: notificationType,
            category: config.userFacingCategory,
            title: parsed.data.title,
            body: parsed.data.body,
            actionUrl: parsed.data.actionUrl ?? null,
            createdAt: row.created_at.toISOString(),
            unreadCount,
          },
        }
      ).catch(() => undefined);
    }

    let emailQueued = false;
    const emailTemplate = emailTemplateForType(notificationType);
    if (emailEnabled && emailTemplate) {
      const recipientEmail = await resolveRecipientEmail(client, parsed.data);
      if (recipientEmail) {
        const queued = await enqueueNotificationEmail(
          {
            actionUrl: parsed.data.actionUrl ?? null,
            body: parsed.data.body,
            clerkOrgId: parsed.data.clerkOrgId,
            emailTemplate,
            notificationId,
            notificationType,
            organisationId: parsed.data.organisationId,
            recipientEmail,
            recipientUserId: parsed.data.recipientUserId,
            title: parsed.data.title,
          },
          client
        );
        if (!queued.ok) {
          return {
            ok: false,
            error: {
              code: "unknown_error",
              message: queued.error.message,
            },
          };
        }
        emailQueued = queued.value.queued;
      }
    }

    return { ok: true, value: { inAppDelivered, emailQueued } };
  } catch {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to dispatch notification.",
      },
    };
  }
}

async function shouldDeliverToChannel(
  client: NotificationDispatchDatabase,
  input: {
    clerkOrgId: string;
    organisationId: string;
    recipientUserId: string;
    type: notification_type;
  },
  channel: "email" | "in_app"
): Promise<boolean> {
  const row = await client.notificationPreference.findUnique({
    where: {
      user_id_organisation_id_notification_type: {
        user_id: input.recipientUserId,
        organisation_id: input.organisationId,
        notification_type: input.type,
      },
    },
    select: {
      in_app_enabled: true,
      email_enabled: true,
    },
  });
  if (row) {
    return channel === "in_app" ? row.in_app_enabled : row.email_enabled;
  }
  const defaults = getTypeConfig(input.type).defaultChannels;
  return channel === "in_app" ? defaults.inApp : defaults.email;
}

async function resolveRecipientEmail(
  client: NotificationDispatchDatabase,
  input: {
    clerkOrgId: string;
    organisationId: string;
    recipientPersonId?: string | null;
    recipientUserId: string;
  }
): Promise<string | null> {
  const person = await client.person.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      ...(input.recipientPersonId
        ? { id: input.recipientPersonId }
        : { clerk_user_id: input.recipientUserId }),
    },
    select: { email: true },
  });
  return person?.email ?? null;
}

function validationError(
  error: z.ZodError
): Result<never, DispatchNotificationError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid notification request.",
    },
  };
}
