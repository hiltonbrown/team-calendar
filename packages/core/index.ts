export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AppErrorCode =
  | "bad_request"
  | "not_found"
  | "unauthorised"
  | "forbidden"
  | "conflict"
  | "validation_error"
  | "internal";

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export const appError = (code: AppErrorCode, message: string): AppError => ({
  code,
  message,
});

export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type ClerkOrgId = Brand<string, "ClerkOrgId">;
export type OrganisationId = Brand<string, "OrganisationId">;
export type PersonId = Brand<string, "PersonId">;
export type AvailabilityRecordId = Brand<string, "AvailabilityRecordId">;
export type FeedId = Brand<string, "FeedId">;

// Billing entitlement vocabulary. These are the canonical sets the whole
// billing slice types against: PLAN_CATALOGUE, plan_limits, usage_counters,
// and the entitlement helpers all reference them, so a typo is a compile error
// and the set is discoverable in one place. Hard limits are counted numbers
// enforced through usage_counters; feature keys are booleans gated through
// Clerk plan features. Adding a new hard limit or feature starts here.
export const LIMIT_TYPES = ["payroll_entities", "seats", "feeds"] as const;
export type LimitType = (typeof LIMIT_TYPES)[number];

export const FEATURE_KEYS = ["analytics", "priority_support"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const toDateOnly = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const startOfUtcDay = (dateOnly: string): Date =>
  new Date(`${dateOnly}T00:00:00.000Z`);

export const endOfUtcDay = (dateOnly: string): Date =>
  new Date(`${dateOnly}T23:59:59.999Z`);

export const formatDateRangeLabel = (startsAt: Date, endsAt: Date): string => {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const start = formatter.format(startsAt);
  const end = formatter.format(endsAt);
  return start === end ? start : `${start} to ${end}`;
};

export type {
  ApproveLeaveInput,
  DeclineLeaveInput,
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  SubmitLeaveInput,
  WithdrawLeaveInput,
} from "./src/ports/external-write-port";
export type {
  SupportSubmissionCategory,
  SupportSubmissionContext,
  SupportSubmissionIssueInput,
  SupportSubmissionPayload,
  SupportSubmissionPriority,
} from "./src/support-submission";
export {
  buildSupportIssueMarkdownBody,
  buildSupportIssueTitle,
  getSupportIssueLabels,
  SupportSubmissionCategorySchema,
  SupportSubmissionContextSchema,
  SupportSubmissionIssueInputSchema,
  SupportSubmissionPayloadSchema,
  SupportSubmissionPrioritySchema,
} from "./src/support-submission";
