import type { AccountId, OrganisationId, Result } from "@repo/core";
import { appError } from "@repo/core";
import type { notification_type } from "../../generated/enums";
import { assertTenantDb, type TenantDb } from "../tenant-db";

export interface NotificationData {
  accountId: string;
  actionUrl: string | null;
  body: string;
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
  accountId: string;
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
  accountId: AccountId,
  organisationId: OrganisationId,
  userId: string,
  filters: NotificationFilters | undefined,
  db: TenantDb
): Promise<Result<NotificationData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb2 = db;

    try {
      const notifications = await tenantDb2.notification.findMany({
        orderBy: { created_at: "desc" },
        select: {
          account_id: true,
          action_url: true,
          body: true,
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
          account_id: accountId,
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
          accountId: notification.account_id,
          actionUrl: notification.action_url,
          body: notification.body,
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
    } catch (error) {
      if (tenantDb2) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list notifications"),
        ok: false,
      };
    }
  }
}

export async function countUnreadNotifications(
  accountId: AccountId,
  organisationId: OrganisationId,
  userId: string,
  db: TenantDb
): Promise<Result<number>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const count = await tenantDb.notification.count({
        where: {
          account_id: accountId,
          organisation_id: organisationId,
          read_at: null,
          recipient_user_id: userId,
        },
      });
      return { ok: true, value: count };
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to count unread notifications"),
        ok: false,
      };
    }
  }
}

export async function markNotificationRead(
  accountId: AccountId,
  organisationId: OrganisationId,
  userId: string,
  notificationId: string,
  db: TenantDb
): Promise<Result<void>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb3 = db;

    try {
      await tenantDb3.notification.updateMany({
        data: { read_at: new Date() },
        where: {
          account_id: accountId,
          id: notificationId,
          organisation_id: organisationId,
          read_at: null,
          recipient_user_id: userId,
        },
      });
      return { ok: true, value: undefined };
    } catch (error) {
      if (tenantDb3) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to mark notification as read"),
        ok: false,
      };
    }
  }
}

export async function markAllNotificationsRead(
  accountId: AccountId,
  organisationId: OrganisationId,
  userId: string,
  db: TenantDb
): Promise<Result<{ updatedCount: number }>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb4 = db;

    try {
      const result = await tenantDb4.notification.updateMany({
        data: { read_at: new Date() },
        where: {
          account_id: accountId,
          organisation_id: organisationId,
          read_at: null,
          recipient_user_id: userId,
        },
      });
      return { ok: true, value: { updatedCount: result.count } };
    } catch (error) {
      if (tenantDb4) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to mark notifications as read"),
        ok: false,
      };
    }
  }
}

export async function listNotificationPreferencesForUser(
  accountId: AccountId,
  organisationId: OrganisationId,
  userId: string,
  db: TenantDb
): Promise<Result<NotificationPreferenceData[]>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb5 = db;

    try {
      const preferences = await tenantDb5.notificationPreference.findMany({
        orderBy: { notification_type: "asc" },
        select: {
          account_id: true,
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
          account_id: accountId,
          organisation_id: organisationId,
          user_id: userId,
        },
      });

      return {
        ok: true,
        value: preferences.map((preference) => ({
          accountId: preference.account_id,
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
    } catch (error) {
      if (tenantDb5) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to list notification preferences"),
        ok: false,
      };
    }
  }
}

export async function upsertNotificationPreference(
  accountId: AccountId,
  organisationId: OrganisationId,
  userId: string,
  input: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    notificationType: notification_type;
  },
  db: TenantDb
): Promise<Result<NotificationPreferenceData>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb6 = db;

    try {
      const preference = await tenantDb6.notificationPreference.upsert({
        create: {
          account_id: accountId,
          email_enabled: input.emailEnabled,
          in_app_enabled: input.inAppEnabled,
          notification_type: input.notificationType,
          organisation_id: organisationId,
          user_id: userId,
        },
        select: {
          account_id: true,
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
          accountId: preference.account_id,
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
    } catch (error) {
      if (tenantDb6) {
        throw error;
      }
      return {
        error: appError("internal", "Failed to update notification preference"),
        ok: false,
      };
    }
  }
}
