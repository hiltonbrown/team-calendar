import type { TenantDb } from "@repo/database";
import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import {
  assertTenantDb,
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
  input: z.input<typeof GetSettingsSchema>,
  db: TenantDb
): Promise<Result<OrganisationSettings, SettingsServiceError>> {
  const parsed = GetSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  assertTenantDb(db, parsed.data.clerkOrgId);
  {
    assertTenantDb(db, parsed.data.clerkOrgId);
    const tenantDb = db;
    return await {
      ok: true,
      value: mapOrganisationSettingsRow(
        await getOrCreateOrganisationSettings(
          {
            clerkOrgId: parsed.data.clerkOrgId as ClerkOrgId,
            organisationId: parsed.data.organisationId as OrganisationId,
          },
          tenantDb
        )
      ),
    };
  }
}

export async function updateSettings(
  input: z.input<typeof UpdateSettingsSchema>,
  db: TenantDb
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
  assertTenantDb(db, parsed.data.clerkOrgId);
  const run = async (
    tenantDb2: TenantDb
  ): ReturnType<typeof updateSettings> => {
    const before = await getOrCreateOrganisationSettings(
      {
        clerkOrgId: parsed.data.clerkOrgId as ClerkOrgId,
        organisationId: parsed.data.organisationId as OrganisationId,
      },
      tenantDb2
    );
    const after = await updateOrganisationSettings(
      {
        clerkOrgId: parsed.data.clerkOrgId as ClerkOrgId,
        organisationId: parsed.data.organisationId as OrganisationId,
        patch: mapPatch(parsed.data.patch),
      },
      tenantDb2
    );
    await tenantDb2.auditEvent.create({
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
  };
  return await (async () => {
    assertTenantDb(db, parsed.data.clerkOrgId);
    return await run(db);
  })();
}

export function defaultOrganisationSettingsPatch(): OrganisationSettingsPatch {
  return {
    defaultFeedPrivacyMode: "named",
    defaultLeaveRequestAdvanceDays: 0,
    defaultPrivacyMode: "named",
    feedsIncludePublicHolidaysDefault: false,
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
