import { z } from "zod";

const CSV_ESCAPE_PATTERN = /[",\r\n]/;

export const OrganisationSettingsSchema = z.object({
  clerkOrgId: z.string().min(1),
  createdAt: z.date(),
  defaultFeedPrivacyMode: z.enum(["named", "masked", "private"]),
  defaultLeaveRequestAdvanceDays: z.number().int().min(0),
  defaultPrivacyMode: z.enum(["named", "masked", "private"]),
  feedsIncludePublicHolidaysDefault: z.boolean(),
  id: z.string().uuid(),
  managerVisibilityScope: z.enum(["all_team_leave", "direct_reports_only"]),
  notifyManagersOnStatusChange: z.boolean(),
  organisationId: z.string().uuid(),
  requireDeclineReason: z.boolean(),
  showDeclinedOnApprovals: z.boolean(),
  showPendingOnCalendar: z.boolean(),
  updatedAt: z.date(),
});

export const OrganisationSettingsPatchSchema = z
  .object({
    defaultFeedPrivacyMode: z.enum(["named", "masked", "private"]).optional(),
    defaultLeaveRequestAdvanceDays: z.coerce.number().int().min(0).optional(),
    defaultPrivacyMode: z.enum(["named", "masked", "private"]).optional(),
    feedsIncludePublicHolidaysDefault: z.boolean().optional(),
    managerVisibilityScope: z
      .enum(["all_team_leave", "direct_reports_only"])
      .optional(),
    notifyManagersOnStatusChange: z.boolean().optional(),
    requireDeclineReason: z.literal(true).optional(),
    showDeclinedOnApprovals: z.boolean().optional(),
    showPendingOnCalendar: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose at least one setting to update.",
  });

export type OrganisationSettings = z.infer<typeof OrganisationSettingsSchema>;
export type OrganisationSettingsPatch = z.infer<
  typeof OrganisationSettingsPatchSchema
>;

export function mapOrganisationSettingsRow(input: {
  clerk_org_id: string;
  created_at: Date;
  default_feed_privacy_mode: "masked" | "named" | "private";
  default_leave_request_advance_days: number;
  default_privacy_mode: "masked" | "named" | "private";
  feeds_include_public_holidays_default: boolean;
  id: string;
  manager_visibility_scope: string;
  notify_managers_on_status_change: boolean;
  organisation_id: string;
  require_decline_reason: boolean;
  show_declined_on_approvals: boolean;
  show_pending_on_calendar: boolean;
  updated_at: Date;
}): OrganisationSettings {
  return {
    clerkOrgId: input.clerk_org_id,
    createdAt: input.created_at,
    defaultFeedPrivacyMode: input.default_feed_privacy_mode,
    defaultLeaveRequestAdvanceDays: input.default_leave_request_advance_days,
    defaultPrivacyMode: input.default_privacy_mode,
    feedsIncludePublicHolidaysDefault:
      input.feeds_include_public_holidays_default,
    id: input.id,
    // Stored as plain string in DB; cast to enum type
    managerVisibilityScope: input.manager_visibility_scope as
      | "all_team_leave"
      | "direct_reports_only",
    notifyManagersOnStatusChange: input.notify_managers_on_status_change,
    organisationId: input.organisation_id,
    requireDeclineReason: input.require_decline_reason,
    showDeclinedOnApprovals: input.show_declined_on_approvals,
    showPendingOnCalendar: input.show_pending_on_calendar,
    updatedAt: input.updated_at,
  };
}

export function toStableJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
}

export function scrubXeroWriteErrorRaw(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubXeroWriteErrorRaw(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "xero_write_error_raw")
      .map(([key, nestedValue]) => [key, scrubXeroWriteErrorRaw(nestedValue)])
  );
}

export function csvEscape(value: string): string {
  return CSV_ESCAPE_PATTERN.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}
