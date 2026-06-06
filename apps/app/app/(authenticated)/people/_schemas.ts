import { z } from "zod";

export const peopleStatusKeys = [
  "alternative_contact",
  "another_office",
  "available",
  "client_site",
  "limited_availability",
  "offsite_meeting",
  "on_leave",
  "other",
  "pending_leave",
  "public_holiday",
  "training",
  "travelling",
  "wfh",
] as const;

const arrayParam = <T extends z.ZodTypeAny>(schema: T) =>
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

const boolParam = z.preprocess(
  (value) => value === "true" || value === true,
  z.boolean()
);

const stringParam = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.string().trim().optional()
);

export const PeopleFilterSchema = z.object({
  cursor: stringParam,
  includeArchived: boolParam.default(false),
  locationId: arrayParam(z.string().uuid()),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  personType: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.enum(["all", "contractor", "employee"]).optional()
    )
    .default("all"),
  search: stringParam,
  status: arrayParam(z.enum(peopleStatusKeys)),
  teamId: arrayParam(z.string().uuid()),
  xeroLinked: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.enum(["all", "false", "true"]).optional()
    )
    .default("all"),
  xeroSyncFailedOnly: boolParam.default(false),
});

export type PeopleFilterInput = z.infer<typeof PeopleFilterSchema>;

export const AddAlternativeContactActionSchema = z.object({
  email: z.string().trim().optional(),
  name: z.string().trim().min(1).max(200),
  notes: z.string().trim().optional(),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  phone: z.string().trim().optional(),
  role: z.string().trim().optional(),
});

export const UpdateAlternativeContactActionSchema = z.object({
  contactId: z.string().uuid(),
  organisationId: z.string().uuid(),
  patch: z.object({
    email: z.string().trim().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    role: z.string().trim().optional(),
  }),
});

export const DeleteAlternativeContactActionSchema = z.object({
  contactId: z.string().uuid(),
  organisationId: z.string().uuid(),
});

export const ReorderAlternativeContactsActionSchema = z.object({
  orderedContactIds: z.array(z.string().uuid()),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
});

export const RefreshBalancesActionSchema = z.object({
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
});

export const SetManualBalanceActionSchema = z.object({
  balance: z.coerce.number().finite(),
  balanceUnit: z.enum(["days", "hours"]).nullable().optional(),
  leaveTypeName: z.string().trim().max(200).nullable().optional(),
  leaveTypeXeroId: z.string().trim().min(1).max(200),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  recordType: z
    .enum([
      "leave",
      "annual_leave",
      "personal_leave",
      "holiday",
      "sick_leave",
      "long_service_leave",
      "unpaid_leave",
      "public_holiday",
      "wfh",
      "travel",
      "travelling",
      "training",
      "client_site",
      "another_office",
      "offsite_meeting",
      "contractor_unavailable",
      "limited_availability",
      "alternative_contact",
      "other",
      "leave_request",
    ])
    .nullable()
    .optional(),
});

export type AddAlternativeContactActionInput = z.infer<
  typeof AddAlternativeContactActionSchema
>;
export type UpdateAlternativeContactActionInput = z.infer<
  typeof UpdateAlternativeContactActionSchema
>;
export type DeleteAlternativeContactActionInput = z.infer<
  typeof DeleteAlternativeContactActionSchema
>;
export type ReorderAlternativeContactsActionInput = z.infer<
  typeof ReorderAlternativeContactsActionSchema
>;
export type RefreshBalancesActionInput = z.infer<
  typeof RefreshBalancesActionSchema
>;
export type SetManualBalanceActionInput = z.infer<
  typeof SetManualBalanceActionSchema
>;
