import { z } from "zod";

export const calendarRecordTypes = [
  "annual_leave",
  "personal_leave",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
  "holiday",
  "wfh",
  "travelling",
  "client_site",
  "another_office",
  "training",
  "offsite_meeting",
  "contractor_unavailable",
  "limited_availability",
  "alternative_contact",
  "other",
] as const;

export const calendarApprovalStatuses = [
  "approved",
  "submitted",
  "xero_sync_failed",
  "draft",
] as const;

const csvArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value
        .flatMap((item) => String(item).split(","))
        .filter((item) => item !== "all" && item.length > 0);
    }
    if (typeof value === "string" && value.length > 0) {
      return value
        .split(",")
        .filter((item) => item !== "all" && item.length > 0);
    }
    return;
  }, z.array(schema).optional());

const optionalDateOnly = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
);

export const CalendarFilterSchema = z.object({
  anchor: optionalDateOnly,
  approvalStatus: csvArray(z.enum(calendarApprovalStatuses)),
  includeDrafts: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
  locationId: csvArray(z.string().uuid()),
  personType: csvArray(z.enum(["employee", "contractor"])),
  recordType: csvArray(z.enum(calendarRecordTypes)),
  recordTypeCategory: z
    .enum(["all", "local_only", "xero_leave"])
    .default("all"),
  scopeType: z
    .enum(["my_self", "my_team", "all_teams", "team", "person"])
    .optional(),
  scopeValue: z.string().uuid().optional(),
  surface: z.enum(["calendar", "coverage"]).default("calendar"),
  view: z.enum(["day", "week", "month"]).default("week"),
});

export type CalendarFilterInput = z.infer<typeof CalendarFilterSchema>;
