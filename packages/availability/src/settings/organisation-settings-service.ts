import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import {
  database,
  getOrCreateOrganisationSettings,
  updateOrganisationSettings,
} from "@repo/database";
import { z } from "zod";
import {
  mapOrganisationSettingsRow,
  type OrganisationSettings,
  type OrganisationSettingsPatch,
  OrganisationSettingsPatchSchema,
} from "./shared";

export type SettingsServiceError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

const GetSettingsSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

const UpdateSettingsSchema = GetSettingsSchema.extend({
  actingRole: z.enum(["admin", "owner", "manager", "viewer"]),
  actingUserId: z.string().min(1),
  patch: OrganisationSettingsPatchSchema,
});

export async function getSettings(
  input: z.input<typeof GetSettingsSchema>
): Promise<Result<OrganisationSettings, SettingsServiceError>> {
  const parsed = GetSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const value = await loadSettings(
      parsed.data.clerkOrgId,
      parsed.data.organisationId
    );
    return { ok: true, value };
  } catch {
    return unknownError("Failed to load organisation settings.");
  }
}

export async function updateSettings(
  input: z.input<typeof UpdateSettingsSchema>
): Promise<Result<OrganisationSettings, SettingsServiceError>> {
  const parsed = UpdateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (
    !(parsed.data.actingRole === "admin" || parsed.data.actingRole === "owner")
  ) {
    return notAuthorised();
  }

  try {
    const before = await getOrCreateOrganisationSettings({
      clerkOrgId: parsed.data.clerkOrgId as ClerkOrgId,
      organisationId: parsed.data.organisationId as OrganisationId,
    });
    const after = await updateOrganisationSettings({
      clerkOrgId: parsed.data.clerkOrgId as ClerkOrgId,
      organisationId: parsed.data.organisationId as OrganisationId,
      patch: mapPatch(parsed.data.patch),
    });
    settingsCache.delete(
      settingsCacheKey(parsed.data.clerkOrgId, parsed.data.organisationId)
    );

    await database.auditEvent.create({
      data: {
        action: "organisation_settings.updated",
        actor_user_id: parsed.data.actingUserId,
        after_value: mapOrganisationSettingsRow(after),
        before_value: mapOrganisationSettingsRow(before),
        clerk_org_id: parsed.data.clerkOrgId,
        entity_id: parsed.data.organisationId,
        entity_type: "organisation_settings",
        metadata: {
          actingUserId: parsed.data.actingUserId,
          changedKeys: Object.keys(parsed.data.patch).sort(),
        },
        organisation_id: parsed.data.organisationId,
        payload: {
          actingUserId: parsed.data.actingUserId,
          changedKeys: Object.keys(parsed.data.patch).sort(),
        },
        resource_id: parsed.data.organisationId,
        resource_type: "organisation_settings",
      },
    });

    return { ok: true, value: mapOrganisationSettingsRow(after) };
  } catch {
    return unknownError("Failed to update organisation settings.");
  }
}

export function defaultOrganisationSettingsPatch(): OrganisationSettingsPatch {
  return {
    defaultFeedPrivacyMode: "named",
    defaultLeaveRequestAdvanceDays: 0,
    defaultPrivacyMode: "named",
    feedsIncludePublicHolidaysDefault: false,
    managerVisibilityScope: "direct_reports_only",
    notifyManagersOnStatusChange: true,
    requireDeclineReason: true,
    showDeclinedOnApprovals: true,
    showPendingOnCalendar: true,
  };
}

function mapPatch(input: OrganisationSettingsPatch) {
  return {
    ...(input.defaultFeedPrivacyMode && {
      default_feed_privacy_mode: input.defaultFeedPrivacyMode,
    }),
    ...(input.defaultLeaveRequestAdvanceDays !== undefined && {
      default_leave_request_advance_days: input.defaultLeaveRequestAdvanceDays,
    }),
    ...(input.defaultPrivacyMode && {
      default_privacy_mode: input.defaultPrivacyMode,
    }),
    ...(input.feedsIncludePublicHolidaysDefault !== undefined && {
      feeds_include_public_holidays_default:
        input.feedsIncludePublicHolidaysDefault,
    }),
    ...(input.managerVisibilityScope && {
      manager_visibility_scope: input.managerVisibilityScope,
    }),
    ...(input.notifyManagersOnStatusChange !== undefined && {
      notify_managers_on_status_change: input.notifyManagersOnStatusChange,
    }),
    ...(input.requireDeclineReason !== undefined && {
      require_decline_reason: input.requireDeclineReason,
    }),
    ...(input.showDeclinedOnApprovals !== undefined && {
      show_declined_on_approvals: input.showDeclinedOnApprovals,
    }),
    ...(input.showPendingOnCalendar !== undefined && {
      show_pending_on_calendar: input.showPendingOnCalendar,
    }),
  };
}

const settingsCache = new Map<string, Promise<OrganisationSettings>>();

function loadSettings(
  clerkOrgId: string,
  organisationId: string
): Promise<OrganisationSettings> {
  const key = settingsCacheKey(clerkOrgId, organisationId);
  const existing = settingsCache.get(key);
  if (existing) {
    return existing;
  }

  const loading = getOrCreateOrganisationSettings({
    clerkOrgId: clerkOrgId as ClerkOrgId,
    organisationId: organisationId as OrganisationId,
  })
    .then((row) => mapOrganisationSettingsRow(row))
    .catch((error: unknown) => {
      if (settingsCache.get(key) === loading) {
        settingsCache.delete(key);
      }
      throw error;
    });
  settingsCache.set(key, loading);
  return loading;
}

function settingsCacheKey(clerkOrgId: string, organisationId: string): string {
  return `${clerkOrgId}:${organisationId}`;
}

function validationError(
  error: z.ZodError
): Result<never, SettingsServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid settings input.",
    },
    ok: false,
  };
}

function notAuthorised(): Result<never, SettingsServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "Only admins and owners can update organisation settings.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, SettingsServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}
