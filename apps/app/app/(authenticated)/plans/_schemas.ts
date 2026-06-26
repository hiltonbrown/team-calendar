import { z } from "zod";

export const xeroLeaveRecordTypes = [
  "annual_leave",
  "personal_leave",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
  "holiday",
] as const;

export const localOnlyRecordTypes = [
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

export const userCreatableRecordTypes = [
  ...xeroLeaveRecordTypes,
  ...localOnlyRecordTypes,
] as const;

export const planApprovalStatuses = [
  "draft",
  "submitted",
  "approved",
  "declined",
  "withdrawn",
  "xero_sync_failed",
] as const;

export const planSourceTypes = ["manual", "team_calendar_leave"] as const;

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

const optionalDateString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

export const PlansFilterSchema = z.object({
  approvalStatus: csvArray(z.enum(planApprovalStatuses)),
  dateFrom: optionalDateString,
  dateTo: optionalDateString,
  includeArchived: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
  personId: csvArray(z.string().uuid()),
  recordType: csvArray(z.enum(userCreatableRecordTypes)),
  recordTypeCategory: z
    .enum(["all", "local_only", "xero_leave"])
    .default("all"),
  sourceType: csvArray(z.enum(planSourceTypes)),
  tab: z.enum(["my", "team"]).default("my"),
});

export type PlansFilterInput = z.infer<typeof PlansFilterSchema>;

export const PlanRecordFormSchema = z
  .object({
    allDay: z.boolean().default(true),
    contactabilityStatus: z
      .enum([
        "contactable",
        "limited",
        "unavailable",
        "use_alternative_contact",
      ])
      .default("contactable"),
    endsAt: z.string().min(1, "End date is required"),
    endTime: z.string().optional(),
    notesInternal: z.string().max(2000).optional(),
    organisationId: z.string().uuid(),
    personId: z.string().uuid(),
    privacyMode: z.enum(["named", "masked", "private"]).default("named"),
    recordType: z.enum(userCreatableRecordTypes),
    startsAt: z.string().min(1, "Start date is required"),
    startTime: z.string().optional(),
  })
  .refine(
    (value) =>
      buildFormDate(value.startsAt, value.startTime, value.allDay) <=
      buildFormDate(value.endsAt, value.endTime, value.allDay, true),
    {
      message: "End date must be after start date",
      path: ["endsAt"],
    }
  );

export const UpdatePlanRecordFormSchema = PlanRecordFormSchema.extend({
  recordId: z.string().uuid(),
});

export const PlanRecordActionSchema = z.object({
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

export type PlanRecordFormInput = z.infer<typeof PlanRecordFormSchema>;
export type UpdatePlanRecordFormInput = z.infer<
  typeof UpdatePlanRecordFormSchema
>;
export type PlanRecordActionInput = z.infer<typeof PlanRecordActionSchema>;

export function buildFormDate(
  date: string,
  time: string | undefined,
  allDay: boolean,
  isEnd = false
): Date {
  if (allDay) {
    return new Date(`${date}T${isEnd ? "23:59:59.999" : "00:00:00.000"}Z`);
  }
  return new Date(`${date}T${time || (isEnd ? "17:00" : "09:00")}:00.000Z`);
}
