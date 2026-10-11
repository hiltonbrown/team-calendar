import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import type { notification_type } from "../../generated/enums";
import { tenantDatabase } from "../tenant-client";

export interface NotificationData {
  actionUrl: string | null;
  body: string;
  clerkOrgId: string;
  createdAt: Date;
  id: string;
  organisationId: string;
  readAt: Date | null;
  recipientUserId: string;
  title: string;
  type: string;
  updatedAt: Date;
}

export interface NotificationPreferenceData {
  clerkOrgId: string;
  createdAt: Date;
  emailEnabled: boolean;
  id: string;
  inAppEnabled: boolean;
  notificationType: string;
  organisationId: string;
  updatedAt: Date;
  userId: string;
}

interface NotificationFilters {
  isRead?: boolean;
  types?: notification_type[];
}

export async function listNotificationsForUser(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  userId: string,
  filters?: NotificationFilters
): Promise<Result<NotificationData[]>> {
  try {
    const notifications = await tenantDatabase(
      clerkOrgId
    ).notification.findMany({
      orderBy: { created_at: "desc" },
      select: {
        action_url: true,
        body: true,
        clerk_org_id: true,
        created_at: true,
        id: true,
        organisation_id: true,
        read_at: true,
        recipient_user_id: true,
        title: true,
        type: true,
        updated_at: true,
      },
      where: {
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
        recipient_user_id: userId,
        ...(filters?.isRead === true ? { read_at: { not: null } } : {}),
        ...(filters?.isRead === false ? { read_at: null } : {}),
        ...(filters?.types?.length ? { type: { in: filters.types } } : {}),
      },
    });

    return {
      ok: true,
      value: notifications.map((notification) => ({
        actionUrl: notification.action_url,
        body: notification.body,
        clerkOrgId: notification.clerk_org_id,
        createdAt: notification.created_at,
        id: notification.id,
        organisationId: notification.organisation_id,
        readAt: notification.read_at,
        recipientUserId: notification.recipient_user_id,
        title: notification.title,
        type: notification.type,
        updatedAt: notification.updated_at,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list notifications"),
      ok: false,
    };
  }
}

export async function countUnreadNotifications(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  userId: string
): Promise<Result<number>> {
  try {
    const count = await tenantDatabase(clerkOrgId).notification.count({
      where: {
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
        read_at: null,
        recipient_user_id: userId,
      },
    });
    return { ok: true, value: count };
  } catch {
    return {
      error: appError("internal", "Failed to count unread notifications"),
      ok: false,
    };
  }
}

export async function markNotificationRead(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  userId: string,
  notificationId: string
): Promise<Result<void>> {
  try {
    await tenantDatabase(clerkOrgId).notification.updateMany({
      data: { read_at: new Date() },
      where: {
        clerk_org_id: clerkOrgId,
        id: notificationId,
        organisation_id: organisationId,
        read_at: null,
        recipient_user_id: userId,
      },
    });
    return { ok: true, value: undefined };
  } catch {
    return {
      error: appError("internal", "Failed to mark notification as read"),
      ok: false,
    };
  }
}

export async function markAllNotificationsRead(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  userId: string
): Promise<Result<{ updatedCount: number }>> {
  try {
    const result = await tenantDatabase(clerkOrgId).notification.updateMany({
      data: { read_at: new Date() },
      where: {
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
        read_at: null,
        recipient_user_id: userId,
      },
    });
    return { ok: true, value: { updatedCount: result.count } };
  } catch {
    return {
      error: appError("internal", "Failed to mark notifications as read"),
      ok: false,
    };
  }
}

export async function listNotificationPreferencesForUser(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  userId: string
): Promise<Result<NotificationPreferenceData[]>> {
  try {
    const preferences = await tenantDatabase(
      clerkOrgId
    ).notificationPreference.findMany({
      orderBy: { notification_type: "asc" },
      select: {
        clerk_org_id: true,
        created_at: true,
        email_enabled: true,
        id: true,
        in_app_enabled: true,
        notification_type: true,
        organisation_id: true,
        updated_at: true,
        user_id: true,
      },
      where: {
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
        user_id: userId,
      },
    });

    return {
      ok: true,
      value: preferences.map((preference) => ({
        clerkOrgId: preference.clerk_org_id,
        createdAt: preference.created_at,
        emailEnabled: preference.email_enabled,
        id: preference.id,
        inAppEnabled: preference.in_app_enabled,
        notificationType: preference.notification_type,
        organisationId: preference.organisation_id,
        updatedAt: preference.updated_at,
        userId: preference.user_id,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list notification preferences"),
      ok: false,
    };
  }
}

export async function upsertNotificationPreference(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  userId: string,
  input: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    notificationType: notification_type;
  }
): Promise<Result<NotificationPreferenceData>> {
  try {
    const preference = await tenantDatabase(
      clerkOrgId
    ).notificationPreference.upsert({
      create: {
        clerk_org_id: clerkOrgId,
        email_enabled: input.emailEnabled,
        in_app_enabled: input.inAppEnabled,
        notification_type: input.notificationType,
        organisation_id: organisationId,
        user_id: userId,
      },
      select: {
        clerk_org_id: true,
        created_at: true,
        email_enabled: true,
        id: true,
        in_app_enabled: true,
        notification_type: true,
        organisation_id: true,
        updated_at: true,
        user_id: true,
      },
      update: {
        email_enabled: input.emailEnabled,
        in_app_enabled: input.inAppEnabled,
      },
      where: {
        user_id_organisation_id_notification_type: {
          notification_type: input.notificationType,
          organisation_id: organisationId,
          user_id: userId,
        },
      },
    });

    return {
      ok: true,
      value: {
        clerkOrgId: preference.clerk_org_id,
        createdAt: preference.created_at,
        emailEnabled: preference.email_enabled,
        id: preference.id,
        inAppEnabled: preference.in_app_enabled,
        notificationType: preference.notification_type,
        organisationId: preference.organisation_id,
        updatedAt: preference.updated_at,
        userId: preference.user_id,
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to update notification preference"),
      ok: false,
    };
  }
}
