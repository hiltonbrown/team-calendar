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
  client: NotificationDispatchDatabase = database,
  options: { publishRealtime?: boolean } = {}
): Promise<Result<DispatchNotificationResult, DispatchNotificationError>> {
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isKnownNotificationType(parsed.data.type)) {
    return {
      error: { code: "invalid_type", message: "Unknown notification type." },
      ok: false,
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
          action_url: parsed.data.actionUrl ?? null,
          actor_user_id: parsed.data.actorUserId ?? null,
          body: parsed.data.body,
          clerk_org_id: parsed.data.clerkOrgId,
          object_id: parsed.data.objectId ?? null,
          object_type: parsed.data.objectType ?? null,
          organisation_id: parsed.data.organisationId,
          recipient_person_id: parsed.data.recipientPersonId ?? null,
          recipient_user_id: parsed.data.recipientUserId,
          title: parsed.data.title,
          type: notificationType,
        },
        select: {
          created_at: true,
          id: true,
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
      if (options.publishRealtime !== false) {
        publishNotificationEvent(
          {
            organisationId: parsed.data.organisationId,
            userId: parsed.data.recipientUserId,
          },
          {
            payload: {
              actionUrl: parsed.data.actionUrl ?? null,
              body: parsed.data.body,
              category: config.userFacingCategory,
              createdAt: row.created_at.toISOString(),
              notificationId: row.id,
              title: parsed.data.title,
              type: notificationType,
              unreadCount,
            },
            type: "notification.created",
          }
        ).catch(() => undefined);
      }
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
            error: {
              code: "unknown_error",
              message: queued.error.message,
            },
            ok: false,
          };
        }
        emailQueued = queued.value.queued;
      }
    }

    return { ok: true, value: { emailQueued, inAppDelivered } };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to dispatch notification.",
      },
      ok: false,
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
    select: {
      email_enabled: true,
      in_app_enabled: true,
    },
    where: {
      user_id_organisation_id_notification_type: {
        notification_type: input.type,
        organisation_id: input.organisationId,
        user_id: input.recipientUserId,
      },
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
    select: { email: true },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      ...(input.recipientPersonId
        ? { id: input.recipientPersonId }
        : { clerk_user_id: input.recipientUserId }),
    },
  });
  return person?.email ?? null;
}

function validationError(
  error: z.ZodError
): Result<never, DispatchNotificationError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid notification request.",
    },
    ok: false,
  };
}
