import "server-only";

import type { Result } from "@repo/core";
import {
  afterTenantCommit,
  assertTenantDb,
  type Database,
  type TenantDb,
  withTenantDb,
} from "@repo/database";
import type { notification_type } from "@repo/database/generated/enums";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
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
  notificationId: string | null;
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
  options: { publishRealtime?: boolean } | undefined,
  db: TenantDb
): Promise<Result<DispatchNotificationResult, DispatchNotificationError>> {
  const parsed = DispatchSchema.safeParse(input);
  if (!parsed.success) {
    return await validationError(parsed.error);
  }
  if (!isKnownNotificationType(parsed.data.type)) {
    return await {
      error: { code: "invalid_type", message: "Unknown notification type." },
      ok: false,
    };
  }
  const validated = { ...parsed.data, type: parsed.data.type };

  {
    assertTenantDb(db, parsed.data.clerkOrgId);
    const client = db;
    return await dispatchNotificationWithClient(
      validated,
      client,
      options ?? {}
    );
  }
}

async function dispatchNotificationWithClient(
  input: z.infer<typeof DispatchSchema> & { type: notification_type },
  client: TenantDb,
  options: { publishRealtime?: boolean }
): Promise<Result<DispatchNotificationResult, DispatchNotificationError>> {
  const notificationType = input.type;

  try {
    const [inAppEnabled, emailEnabled] = [
      await shouldDeliverToChannel(
        client,
        { ...input, type: notificationType },
        "in_app"
      ),
      await shouldDeliverToChannel(
        client,
        { ...input, type: notificationType },
        "email"
      ),
    ];
    let publication: PreparedNotificationPublication | null = null;
    const config = getTypeConfig(notificationType);
    let notificationId: string | null = null;
    let inAppDelivered = false;

    if (inAppEnabled) {
      const row = await client.notification.create({
        data: {
          action_url: input.actionUrl ?? null,
          actor_user_id: input.actorUserId ?? null,
          body: input.body,
          clerk_org_id: input.clerkOrgId,
          object_id: input.objectId ?? null,
          object_type: input.objectType ?? null,
          organisation_id: input.organisationId,
          recipient_person_id: input.recipientPersonId ?? null,
          recipient_user_id: input.recipientUserId,
          title: input.title,
          type: notificationType,
        },
        select: {
          created_at: true,
          id: true,
          organisation: { select: { name: true } },
        },
      });
      notificationId = row.id;
      inAppDelivered = true;
      if (options.publishRealtime !== false) {
        const unreadCount = await client.notification.count({
          where: {
            clerk_org_id: input.clerkOrgId,
            organisation: { clerk_org_id: input.clerkOrgId },
            read_at: null,
            recipient_user_id: input.recipientUserId,
          },
        });
        publication = {
          clerkOrgId: input.clerkOrgId,
          event: {
            payload: {
              actionUrl: input.actionUrl ?? null,
              body: input.body,
              category: config.userFacingCategory,
              createdAt: row.created_at.toISOString(),
              notificationId: row.id,
              organisationId: input.organisationId,
              organisationName: row.organisation.name,
              title: input.title,
              type: notificationType,
              unreadCount,
            },
            type: "notification.created",
          },
          scope: {
            clerkOrgId: input.clerkOrgId,
            userId: input.recipientUserId,
          },
        };
      }
    }

    let emailQueued = false;
    const emailTemplate = emailTemplateForType(notificationType);
    if (emailEnabled && emailTemplate) {
      const recipientEmail = await resolveRecipientEmail(client, input);
      if (recipientEmail) {
        const queued = await enqueueNotificationEmail(
          {
            actionUrl: input.actionUrl ?? null,
            body: input.body,
            clerkOrgId: input.clerkOrgId,
            emailTemplate,
            notificationId,
            notificationType,
            organisationId: input.organisationId,
            recipientEmail,
            recipientUserId: input.recipientUserId,
            title: input.title,
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

    if (publication) {
      const prepared = publication;
      afterTenantCommit(client, () =>
        sendPreparedNotificationPublication(prepared)
      );
    }
    return { ok: true, value: { emailQueued, inAppDelivered, notificationId } };
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
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      clerk_user_id: input.recipientUserId,
      organisation: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        is_active: true,
      },
      ...(input.recipientPersonId ? { id: input.recipientPersonId } : {}),
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

interface NotificationPublicationInput {
  clerkOrgId: string;
  notificationId: string;
  organisationId: string;
}
export interface PreparedNotificationPublication {
  clerkOrgId: string;
  event: Parameters<typeof publishNotificationEvent>[1];
  scope: Parameters<typeof publishNotificationEvent>[0];
}

/** Publish an existing committed row without creating another notification or email. */
export async function publishPersistedNotification(
  input: NotificationPublicationInput
): Promise<void> {
  assertNoTenantTransaction("publishPersistedNotification");
  const prepared = await withTenantDb(input.clerkOrgId, (db) =>
    prepareNotificationPublication(input, db)
  );
  await sendPreparedNotificationPublication(prepared);
}

export function prepareNotificationPublication(
  input: NotificationPublicationInput,
  db: TenantDb
): Promise<PreparedNotificationPublication | null> {
  assertTenantDb(db, input.clerkOrgId);
  return loadNotificationPublication(input, db);
}

async function loadNotificationPublication(
  input: NotificationPublicationInput,
  client: TenantDb
): Promise<PreparedNotificationPublication | null> {
  const row = await client.notification.findFirst({
    include: { organisation: { select: { name: true } } },
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.notificationId,
      organisation_id: input.organisationId,
    },
  });
  if (!row) {
    return null;
  }
  const unreadCount = await client.notification.count({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation: { clerk_org_id: input.clerkOrgId },
      read_at: null,
      recipient_user_id: row.recipient_user_id,
    },
  });
  return {
    clerkOrgId: input.clerkOrgId,
    event: {
      payload: {
        actionUrl: row.action_url,
        body: row.body,
        category: getTypeConfig(row.type).userFacingCategory,
        createdAt: row.created_at.toISOString(),
        notificationId: row.id,
        organisationId: row.organisation_id,
        organisationName: row.organisation.name,
        title: row.title,
        type: row.type,
        unreadCount,
      },
      type: "notification.created",
    },
    scope: {
      clerkOrgId: input.clerkOrgId,
      userId: row.recipient_user_id,
    },
  };
}

export async function sendPreparedNotificationPublication(
  prepared: PreparedNotificationPublication | null
): Promise<void> {
  assertNoTenantTransaction("sendPreparedNotificationPublication");
  if (!prepared) {
    return;
  }
  invalidateUnreadCount({
    clerkOrgId: prepared.clerkOrgId,
    userId: prepared.scope.userId,
  });
  await publishNotificationEvent(prepared.scope, prepared.event);
}
