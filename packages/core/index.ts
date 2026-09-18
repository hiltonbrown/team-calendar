export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AppErrorCode =
  | "bad_request"
  | "not_found"
  | "unauthorised"
  | "forbidden"
  | "conflict"
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

export type PlanKey = "basic" | "premium" | "enterprise";
export type LimitType = "payroll_entities" | "seats" | "feeds";
export type FeatureKey = "analytics" | "priority_support";

export const planKeys = [
  "basic",
  "premium",
  "enterprise",
] as const satisfies readonly PlanKey[];
export const limitTypes = [
  "payroll_entities",
  "seats",
  "feeds",
] as const satisfies readonly LimitType[];
export const featureKeys = [
  "analytics",
  "priority_support",
] as const satisfies readonly FeatureKey[];

export type { PublicPlanDefinition } from "./src/plan-catalogue";
export {
  getPublicPlanDefinition,
  PUBLIC_PLAN_CATALOGUE,
} from "./src/plan-catalogue";

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

export type { AvailabilityRecordType } from "./src/availability-record-label";
export {
  AVAILABILITY_RECORD_TYPE_LABELS,
  AVAILABILITY_RECORD_TYPES,
  formatAvailabilityRecordType,
  getAvailabilityRecordLabel,
} from "./src/availability-record-label";

export type {
  HolidayApplicabilityHoliday,
  HolidayApplicabilityInput,
  HolidayApplicabilityLocationAssignment,
  HolidayApplicabilitySubject,
} from "./src/holiday-applicability";
export { holidayIsNonWorking } from "./src/holiday-applicability";
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
  ExecuteRedisRestCommandInput,
  RedisRestEnvelope,
  RedisRestTransportError,
  RedisRestTransportErrorCode,
} from "./src/redis-rest-transport";
export { executeRedisRestCommand } from "./src/redis-rest-transport";
export type {
  SupportIssuePayload,
  SupportSubmissionCategory,
  SupportSubmissionContext,
  SupportSubmissionIssueInput,
  SupportSubmissionPayload,
  SupportSubmissionPriority,
} from "./src/support-submission";
export {
  buildSupportIssueMarkdownBody,
  buildSupportIssuePayload,
  buildSupportIssueTitle,
  createDynamicCodeFence,
  getSupportIssueLabels,
  MAX_ACTUAL_OUTCOME_LENGTH,
  MAX_EXPECTED_OUTCOME_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_REPRODUCTION_STEPS_LENGTH,
  MAX_SUBJECT_LENGTH,
  SupportSubmissionCategorySchema,
  SupportSubmissionContextSchema,
  SupportSubmissionIssueInputSchema,
  SupportSubmissionPayloadSchema,
  SupportSubmissionPrioritySchema,
  sanitizeTitleText,
  wrapUntrustedContent,
} from "./src/support-submission";
