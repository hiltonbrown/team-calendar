import "server-only";

import type { Result } from "@repo/core";
import { type Database, tenantDatabase } from "@repo/database";
import type { notification_type } from "@repo/database/generated/enums";
import { z } from "zod";
import {
  getDefaultChannels,
  getTypeConfig,
  isKnownNotificationType,
  listAllTypes,
  type NotificationCategory,
} from "./types/notification-type-registry";

export type PreferencesServiceError =
  | { code: "at_least_one_channel_required"; message: string }
  | { code: "invalid_type"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface NotificationPreferenceRow {
  category: NotificationCategory;
  description: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  isDefault: boolean;
  label: string;
  type: notification_type;
}

export interface PreferencesServiceDatabase {
  notificationPreference: Pick<
    Database["notificationPreference"],
    "findMany" | "findUnique" | "upsert"
  >;
}

const ScopedUserSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  userId: z.string().min(1),
});

const UpsertSchema = ScopedUserSchema.extend({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  notificationType: z.string().min(1),
});

const ChannelSchema = ScopedUserSchema.extend({
  channel: z.enum(["email", "in_app"]),
  notificationType: z.string().min(1),
});

export async function listPreferences(
  input: z.input<typeof ScopedUserSchema>,
  providedClient?: PreferencesServiceDatabase
): Promise<Result<NotificationPreferenceRow[], PreferencesServiceError>> {
  const parsed = ScopedUserSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const client = providedClient ?? tenantDatabase(parsed.data.clerkOrgId);

  try {
    const storedRows = await client.notificationPreference.findMany({
      select: {
        email_enabled: true,
        in_app_enabled: true,
        notification_type: true,
      },
      where: {
        clerk_org_id: parsed.data.clerkOrgId,
        organisation_id: parsed.data.organisationId,
        user_id: parsed.data.userId,
      },
    });
    const stored = new Map(
      storedRows.map((row) => [row.notification_type, row])
    );
    return {
      ok: true,
      value: listAllTypes().map((config) => {
        const row = stored.get(config.type);
        return {
          category: config.userFacingCategory,
          description: config.description,
          emailEnabled: row?.email_enabled ?? config.defaultChannels.email,
          inAppEnabled: row?.in_app_enabled ?? config.defaultChannels.inApp,
          isDefault: !row,
          label: config.label,
          type: config.type,
        };
      }),
    };
  } catch {
    return unknownError("Failed to load notification preferences.");
  }
}

export async function upsertPreference(
  input: z.input<typeof UpsertSchema>,
  providedClient?: PreferencesServiceDatabase
): Promise<Result<NotificationPreferenceRow, PreferencesServiceError>> {
  const parsed = UpsertSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const client = providedClient ?? tenantDatabase(parsed.data.clerkOrgId);
  if (!isKnownNotificationType(parsed.data.notificationType)) {
    return invalidType();
  }
  if (!(parsed.data.inAppEnabled || parsed.data.emailEnabled)) {
    return {
      error: {
        code: "at_least_one_channel_required",
        message: "At least one notification channel must be enabled.",
      },
      ok: false,
    };
  }

  try {
    const row = await client.notificationPreference.upsert({
      create: {
        clerk_org_id: parsed.data.clerkOrgId,
        email_enabled: parsed.data.emailEnabled,
        in_app_enabled: parsed.data.inAppEnabled,
        notification_type: parsed.data.notificationType,
        organisation_id: parsed.data.organisationId,
        user_id: parsed.data.userId,
      },
      select: {
        email_enabled: true,
        in_app_enabled: true,
        notification_type: true,
      },
      update: {
        email_enabled: parsed.data.emailEnabled,
        in_app_enabled: parsed.data.inAppEnabled,
      },
      where: {
        user_id_organisation_id_notification_type: {
          notification_type: parsed.data.notificationType,
          organisation_id: parsed.data.organisationId,
          user_id: parsed.data.userId,
        },
      },
    });
    return {
      ok: true,
      value: toPreferenceRow(row.notification_type, {
        emailEnabled: row.email_enabled,
        inAppEnabled: row.in_app_enabled,
        isDefault: false,
      }),
    };
  } catch {
    return unknownError("Failed to update notification preference.");
  }
}

export async function shouldDeliverToChannel(
  input: z.input<typeof ChannelSchema>,
  providedClient?: PreferencesServiceDatabase
): Promise<Result<boolean, PreferencesServiceError>> {
  const parsed = ChannelSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const client = providedClient ?? tenantDatabase(parsed.data.clerkOrgId);
  if (!isKnownNotificationType(parsed.data.notificationType)) {
    return invalidType();
  }

  try {
    const row = await client.notificationPreference.findUnique({
      select: {
        email_enabled: true,
        in_app_enabled: true,
      },
      where: {
        user_id_organisation_id_notification_type: {
          notification_type: parsed.data.notificationType,
          organisation_id: parsed.data.organisationId,
          user_id: parsed.data.userId,
        },
      },
    });
    if (row) {
      return {
        ok: true,
        value:
          parsed.data.channel === "in_app"
            ? row.in_app_enabled
            : row.email_enabled,
      };
    }
    const defaults = getDefaultChannels(parsed.data.notificationType);
    return {
      ok: true,
      value: parsed.data.channel === "in_app" ? defaults.inApp : defaults.email,
    };
  } catch {
    return unknownError("Failed to check notification preference.");
  }
}

function toPreferenceRow(
  type: notification_type,
  values: {
    inAppEnabled: boolean;
    emailEnabled: boolean;
    isDefault: boolean;
  }
): NotificationPreferenceRow {
  const config = getTypeConfig(type);
  return {
    category: config.userFacingCategory,
    description: config.description,
    emailEnabled: values.emailEnabled,
    inAppEnabled: values.inAppEnabled,
    isDefault: values.isDefault,
    label: config.label,
    type,
  };
}

function invalidType(): Result<never, PreferencesServiceError> {
  return {
    error: {
      code: "invalid_type",
      message: "Unknown notification type.",
    },
    ok: false,
  };
}

function validationError(
  error: z.ZodError
): Result<never, PreferencesServiceError> {
  return {
    error: {
      code: "validation_error",
      message:
        error.issues[0]?.message ?? "Invalid notification preference request.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, PreferencesServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}
