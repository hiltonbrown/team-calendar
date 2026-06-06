import "server-only";

export {
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangeError,
  type DateRangePreset,
  type ResolvedDateRange,
  resolveDateRange,
  zonedStartOfDayToUtc,
} from "./src/analytics/date-range";
export {
  type AnalyticsRecordListItem,
  type AnalyticsRole,
  type AnalyticsServiceError,
  aggregateLeaveReports,
  type LeaveReportsData,
  type LeaveReportsFilters,
  listLeaveReportRecordsForDrilldown,
  type RecordListPage,
  type XeroLeaveRecordType,
} from "./src/analytics/leave-reports-service";
export {
  aggregateOutOfOffice,
  type LocalOnlyRecordType,
  listOutOfOfficeRecordsForDrilldown,
  type OutOfOfficeData,
  type OutOfOfficeFilters,
} from "./src/analytics/out-of-office-service";
export {
  type AggregationCache,
  aggregationFingerprint,
  createAggregationCache,
  stableStringify,
} from "./src/analytics/request-cache";
export {
  type ApprovalAction,
  type ApprovalDetail,
  type ApprovalListItem,
  type ApprovalRole,
  type ApprovalServiceError,
  type ApprovalSummaryCounts,
  approve,
  decline,
  dispatchApprovalReconciliation,
  getApprovalDetail,
  getApprovalSummaryCounts,
  listForApprover,
  requestMoreInfo,
  retryApproval,
  retryDecline,
  revertApprovalAttempt,
} from "./src/approvals/approval-service";
export {
  type CalendarDay,
  type CalendarEvent,
  type CalendarEventDetail,
  type CalendarPerson,
  type CalendarRange,
  type CalendarRole,
  type CalendarScope,
  type CalendarServiceError,
  type CalendarView,
  getCalendarRange,
  getEventDetail,
} from "./src/calendar/calendar-service";
export {
  createDashboardCache,
  type DashboardCache,
} from "./src/dashboard/dashboard-cache";
export {
  type AdminDashboardView,
  type DashboardRole,
  type DashboardSection,
  type DashboardServiceError,
  type EmployeeDashboardView,
  getAdminView,
  getEmployeeView,
  getManagerView,
  type ManagerDashboardView,
  resolveDashboardRole,
} from "./src/dashboard/dashboard-service";
export { computeWorkingDays } from "./src/duration/working-days";
export {
  addCustomHoliday,
  deleteCustomHoliday,
  importForJurisdiction,
  listForOrganisation,
  restoreHoliday,
  suppressHoliday,
} from "./src/holidays/holiday-service";
export {
  type AlternativeContactServiceError,
  addAlternativeContact,
  deleteAlternativeContact,
  reorderAlternativeContacts,
  updateAlternativeContact,
} from "./src/people/alternative-contact-service";
export {
  type CurrentStatus,
  type CurrentStatusKey,
  computeCurrentStatus,
} from "./src/people/current-status";
export {
  type FieldOwnership,
  fieldOwnershipForPerson,
} from "./src/people/field-ownership";
export {
  type ManualBalanceServiceError,
  setManualLeaveBalance,
} from "./src/people/manual-balance-service";
export {
  type AlternativeContactSnapshot,
  type AvailabilityRecordSummary,
  type BalanceRow,
  getPersonProfile,
  listHistoryPage,
  listPeople,
  listUpcomingRecords,
  type PeopleRole,
  type PeopleServiceError,
  type PersonListItem,
  type PersonProfile,
} from "./src/people/people-service";
export {
  archiveRecord,
  type BalanceChip,
  createRecord,
  deleteDraftRecord,
  type EditableAction,
  getRecord,
  listMyRecords,
  listTeamRecords,
  type PlanRecord,
  type PlanServiceError,
  type RecordDetail,
  type RecordListItem,
  restoreRecord,
  updateRecord,
} from "./src/plans/plan-service";
export {
  retrySubmission,
  revertToDraft,
  submitDraftRecord,
  withdrawSubmission,
} from "./src/plans/submit-service";
export {
  type AuditEventDetail,
  type AuditEventListItem,
  AuditLogFilterSchema,
  type AuditLogServiceError,
  exportCsv as exportAuditLogCsv,
  getEventDetail as getAuditEventDetail,
  listEvents as listAuditLogEvents,
} from "./src/settings/audit-log-service";
export {
  type BillingServiceError,
  type BillingSummary,
  type DashboardBillingSummary,
  getBillingSummary,
  getBillingSummaryForDashboard,
} from "./src/settings/billing-service";
export {
  defaultOrganisationSettingsPatch,
  getSettings,
  type SettingsServiceError,
  updateSettings,
} from "./src/settings/organisation-settings-service";
export type {
  OrganisationSettings,
  OrganisationSettingsPatch,
} from "./src/settings/shared";
export {
  deriveXeroStableSourceKey,
  type InboundLeaveApprovalStatus,
  type InboundLeaveRecordInput,
  type NormalisedInboundLeaveRecord,
  normaliseInboundLeaveRecord,
} from "./src/sync/inbound-leave-normaliser";
export {
  cancelRun,
  dispatchManualSync,
  exportFailedRecordsCsv,
  getRunDetail,
  listRuns,
  listTenantSummaries,
  type RunDetail,
  type RunListItem,
  type SyncMonitorError,
  type SyncMonitorRole,
  type SyncRunFilters,
  type SyncRunStatus,
  type SyncRunType,
  type SyncTriggerType,
  type TenantSummary,
  type TimelineEvent,
} from "./src/sync/sync-monitor-service";
export { hasActiveXeroConnection } from "./src/xero-connection-state";

import { randomUUID } from "node:crypto";
import {
  appError,
  type ClerkOrgId,
  type OrganisationId,
  type Result,
} from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { z } from "zod";

const WHITESPACE_PATTERN = /\s+/;

const RecordTypeSchema = z.enum([
  "leave",
  "wfh",
  "travel",
  "training",
  "client_site",
]);

const PrivacyModeSchema = z.enum(["named", "masked", "private"]);
const ContactabilityStatusSchema = z.enum([
  "contactable",
  "limited",
  "unavailable",
]);

export const ManualAvailabilityInputSchema = z
  .object({
    personId: z.string().uuid(),
    recordType: RecordTypeSchema,
    title: z.string().min(1).max(200),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    allDay: z.boolean().default(true),
    workingLocation: z.string().max(200).optional(),
    contactability: ContactabilityStatusSchema.default("contactable"),
    preferredContactMethod: z.string().max(200).optional(),
    notesInternal: z.string().max(2000).optional(),
    includeInFeed: z.boolean().default(true),
    privacyMode: PrivacyModeSchema.default("named"),
  })
  .refine((value) => value.endsAt >= value.startsAt, {
    message: "End date must be after start date",
    path: ["endsAt"],
  });

export type ManualAvailabilityInput = z.infer<
  typeof ManualAvailabilityInputSchema
>;

export interface TenantContext {
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
}

export interface OrganisationSettingsInput {
  clerkOrgId: string;
  countryCode: string;
  fiscalYearStart?: number;
  locale?: string;
  name: string;
  reportingUnit?: string;
  timezone?: string;
  workingHoursPerDay?: number;
}

export interface CurrentUserPersonInput {
  avatarUrl?: string | null;
  clerkUserId: string;
  displayName?: string | null;
  email?: string | null;
  firstName?: string | null;
  jobTitle?: string;
  lastName?: string | null;
}

export interface PersonView {
  email: string | null;
  id: string;
  initials: string;
  jobTitle: string | null;
  locationName: string | null;
  name: string;
  teamName: string | null;
}

export interface AvailabilityRecordView {
  allDay: boolean;
  contactability: string;
  endsAt: Date;
  id: string;
  includeInFeed: boolean;
  notesInternal: string | null;
  personEmail: string | null;
  personId: string;
  personName: string;
  privacyMode: string;
  recordType: string;
  startsAt: Date;
  title: string;
  workingLocation: string | null;
}

export const getInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(WHITESPACE_PATTERN)
    .filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
};

const mapPerson = (person: {
  email: string | null;
  id: string;
  job_title: string | null;
  display_name: string | null;
  first_name?: string;
  last_name?: string;
  location?: { name: string } | null;
  team?: { name: string } | null;
}): PersonView => {
  const fullName =
    person.display_name ??
    `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  return {
    email: person.email,
    id: person.id,
    initials: getInitials(fullName),
    jobTitle: person.job_title,
    locationName: person.location?.name ?? null,
    name: fullName,
    teamName: person.team?.name ?? null,
  };
};

const mapRecord = (record: {
  all_day: boolean;
  contactability: string | null;
  ends_at: Date;
  id: string;
  include_in_feed: boolean;
  notes_internal: string | null;
  person: {
    display_name: string | null;
    email: string | null;
    first_name: string;
    id: string;
    last_name: string;
  };
  privacy_mode: string | null;
  record_type: string;
  starts_at: Date;
  title: string | null;
  working_location: string | null;
}): AvailabilityRecordView => ({
  allDay: record.all_day,
  contactability: record.contactability ?? "contactable",
  endsAt: record.ends_at,
  id: record.id,
  includeInFeed: record.include_in_feed,
  notesInternal: record.notes_internal,
  personEmail: record.person.email,
  personId: record.person.id,
  personName:
    record.person.display_name ??
    `${record.person.first_name} ${record.person.last_name}`,
  privacyMode: record.privacy_mode ?? "named",
  recordType: record.record_type,
  startsAt: record.starts_at,
  title: record.title ?? "",
  workingLocation: record.working_location,
});

export const ensureOrganisationForClerk = async (
  input: OrganisationSettingsInput
): Promise<TenantContext> => {
  const existingOrganisation = await database.organisation.findFirst({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
    },
    orderBy: { created_at: "asc" },
  });

  const organisation = existingOrganisation
    ? await database.organisation.update({
        where: { id: existingOrganisation.id },
        data: {
          country_code: input.countryCode,
          fiscal_year_start: input.fiscalYearStart ?? 7,
          locale: input.locale ?? "en-AU",
          name: input.name,
          reporting_unit: input.reportingUnit ?? "hours",
          timezone: input.timezone ?? "UTC",
          working_hours_per_day: input.workingHoursPerDay ?? 7.6,
        },
      })
    : await database.organisation.create({
        data: {
          clerk_org_id: input.clerkOrgId,
          country_code: input.countryCode,
          fiscal_year_start: input.fiscalYearStart ?? 7,
          locale: input.locale ?? "en-AU",
          name: input.name,
          reporting_unit: input.reportingUnit ?? "hours",
          timezone: input.timezone ?? "UTC",
          working_hours_per_day: input.workingHoursPerDay ?? 7.6,
        },
      });

  return {
    clerkOrgId: input.clerkOrgId as ClerkOrgId,
    organisationId: organisation.id as OrganisationId,
  };
};

export const ensureCurrentUserPerson = async (
  tenant: TenantContext,
  input: CurrentUserPersonInput
): Promise<Result<PersonView>> => {
  const scoped = scopedQuery(tenant.clerkOrgId, tenant.organisationId);
  const profile = normaliseCurrentUserProfile(input);
  const safeProfilePatch = safeCurrentUserProfilePatch(profile);

  try {
    const existingLinkedPerson = await database.person.findFirst({
      where: {
        ...scoped,
        archived_at: null,
        clerk_user_id: input.clerkUserId,
      },
      include: { location: true, team: true },
    });

    if (existingLinkedPerson) {
      return { ok: true, value: mapPerson(existingLinkedPerson) };
    }

    if (profile.email) {
      const sameEmailPeople = await database.person.findMany({
        where: {
          ...scoped,
          archived_at: null,
          clerk_user_id: null,
          email: { equals: profile.email, mode: "insensitive" },
        },
        include: { location: true, team: true },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      });

      if (sameEmailPeople.length > 1) {
        return {
          ok: false,
          error: appError(
            "conflict",
            "Multiple people match this Clerk user's email. Review the people directory before opening plans."
          ),
        };
      }

      const sameEmailPerson = sameEmailPeople[0];
      if (sameEmailPerson) {
        const person = await database.person.update({
          where: { id: sameEmailPerson.id },
          data: {
            ...safeProfilePatch,
            clerk_user_id: input.clerkUserId,
          },
          include: { location: true, team: true },
        });

        return { ok: true, value: mapPerson(person) };
      }
    }

    const person = await database.person.create({
      data: {
        avatar_url: profile.avatarUrl,
        clerk_org_id: tenant.clerkOrgId,
        clerk_user_id: input.clerkUserId,
        display_name: profile.displayName,
        email: profile.email ?? `${input.clerkUserId}@internal`,
        employment_type: "employee",
        first_name: profile.firstName,
        job_title: input.jobTitle ?? null,
        last_name: profile.lastName,
        organisation_id: tenant.organisationId,
        source_system: "MANUAL",
      },
      include: { location: true, team: true },
    });

    return { ok: true, value: mapPerson(person) };
  } catch {
    return {
      ok: false,
      error: appError(
        "internal",
        "Failed to ensure the current user has a person profile."
      ),
    };
  }
};

interface NormalisedCurrentUserProfile {
  avatarUrl: string | null;
  displayName: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

function normaliseCurrentUserProfile(
  input: CurrentUserPersonInput
): NormalisedCurrentUserProfile {
  const email = normaliseEmail(input.email);
  const displayName =
    cleanString(input.displayName) ??
    cleanString(
      [cleanString(input.firstName), cleanString(input.lastName)]
        .filter(Boolean)
        .join(" ")
    ) ??
    email ??
    input.clerkUserId;
  const nameParts = displayName.split(WHITESPACE_PATTERN);
  const firstName = cleanString(input.firstName) ?? nameParts[0] ?? "User";
  const lastName =
    cleanString(input.lastName) ??
    cleanString(nameParts.slice(1).join(" ")) ??
    input.clerkUserId;

  return {
    avatarUrl: cleanString(input.avatarUrl) ?? null,
    displayName,
    email,
    firstName,
    lastName,
  };
}

function safeCurrentUserProfilePatch(profile: NormalisedCurrentUserProfile): {
  avatar_url?: string | null;
  display_name?: string;
} {
  return {
    ...(profile.avatarUrl ? { avatar_url: profile.avatarUrl } : {}),
    ...(profile.displayName ? { display_name: profile.displayName } : {}),
  };
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normaliseEmail(value: string | null | undefined): string | null {
  const trimmed = cleanString(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

export const listPersonViews = async (
  tenant: TenantContext
): Promise<PersonView[]> => {
  const people = await database.person.findMany({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
    },
    include: { location: true, team: true },
    orderBy: [{ display_name: "asc" }, { first_name: "asc" }],
  });

  return people.map(mapPerson);
};

export const listAvailabilityRecords = async (
  tenant: TenantContext,
  range?: { startsBefore?: Date; endsAfter?: Date; personId?: string }
): Promise<AvailabilityRecordView[]> => {
  const records = await database.availabilityRecord.findMany({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      ...(range?.personId ? { person_id: range.personId } : {}),
      ...(range?.startsBefore
        ? { starts_at: { lte: range.startsBefore } }
        : {}),
      ...(range?.endsAfter ? { ends_at: { gte: range.endsAfter } } : {}),
    },
    include: { person: true },
    orderBy: [{ starts_at: "asc" }, { title: "asc" }],
  });

  return records.map(mapRecord);
};

export const createManualAvailability = async (
  tenant: TenantContext,
  input: unknown,
  userId: string
): Promise<Result<AvailabilityRecordView>> => {
  const parsed = ManualAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: appError(
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid availability record"
      ),
    };
  }

  const person = await database.person.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: parsed.data.personId,
    },
  });

  if (!person) {
    return { ok: false, error: appError("not_found", "Person not found") };
  }

  const duplicate = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      ends_at: parsed.data.endsAt,
      person_id: parsed.data.personId,
      record_type: parsed.data.recordType,
      source_remote_id: null,
      source_type: "manual",
      starts_at: parsed.data.startsAt,
    },
    select: { id: true },
  });

  if (duplicate) {
    return {
      ok: false,
      error: appError(
        "conflict",
        "A matching manual availability record already exists."
      ),
    };
  }

  const id = randomUUID();
  const record = await database.availabilityRecord.create({
    data: {
      id,
      person_id: parsed.data.personId,
      record_type: parsed.data.recordType,
      title: parsed.data.title,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      all_day: parsed.data.allDay,
      working_location: parsed.data.workingLocation,
      contactability: parsed.data.contactability,
      preferred_contact_method: parsed.data.preferredContactMethod,
      notes_internal: parsed.data.notesInternal,
      include_in_feed: parsed.data.includeInFeed,
      privacy_mode: parsed.data.privacyMode,
      approval_status: "approved",
      approved_at: new Date(),
      clerk_org_id: tenant.clerkOrgId,
      created_by_user_id: userId,
      derived_uid_key: `leavesync:manual:${tenant.organisationId}:${id}`,
      organisation_id: tenant.organisationId,
      source_type: "manual",
      updated_by_user_id: userId,
    },
    include: { person: true },
  });

  return { ok: true, value: mapRecord(record) };
};

export const updateManualAvailability = async (
  tenant: TenantContext,
  recordId: string,
  input: unknown,
  userId: string
): Promise<Result<AvailabilityRecordView>> => {
  const parsed = ManualAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: appError(
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid availability record"
      ),
    };
  }

  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
  });

  if (!existing) {
    return { ok: false, error: appError("not_found", "Record not found") };
  }

  const record = await database.availabilityRecord.update({
    where: { id: recordId },
    data: {
      record_type: parsed.data.recordType,
      title: parsed.data.title,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      all_day: parsed.data.allDay,
      working_location: parsed.data.workingLocation,
      contactability: parsed.data.contactability,
      preferred_contact_method: parsed.data.preferredContactMethod,
      notes_internal: parsed.data.notesInternal,
      include_in_feed: parsed.data.includeInFeed,
      privacy_mode: parsed.data.privacyMode,
      updated_by_user_id: userId,
    },
    include: { person: true },
  });

  return { ok: true, value: mapRecord(record) };
};

export const updateAvailabilityApprovalStatus = async (
  tenant: TenantContext,
  recordId: string,
  approvalStatus: "approved" | "declined",
  userId: string
): Promise<Result<void>> => {
  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      approval_status: "submitted",
      id: recordId,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: appError("not_found", "Pending availability record not found"),
    };
  }

  await database.availabilityRecord.update({
    where: { id: recordId },
    data: {
      approval_status: approvalStatus,
      approved_at: approvalStatus === "approved" ? new Date() : null,
      publish_status:
        approvalStatus === "approved" ? existing.publish_status : "suppressed",
      updated_by_user_id: userId,
    },
  });

  return { ok: true, value: undefined };
};

export const archiveManualAvailability = async (
  tenant: TenantContext,
  recordId: string,
  userId: string
): Promise<Result<void>> => {
  const existing = await database.availabilityRecord.findFirst({
    where: {
      ...scopedQuery(tenant.clerkOrgId, tenant.organisationId),
      archived_at: null,
      id: recordId,
      source_type: "manual",
    },
  });

  if (!existing) {
    return { ok: false, error: appError("not_found", "Record not found") };
  }

  await database.availabilityRecord.update({
    where: { id: recordId },
    data: {
      archived_at: new Date(),
      publish_status: "archived",
      updated_by_user_id: userId,
    },
  });

  return { ok: true, value: undefined };
};

export type {
  ApproveLeaveInput,
  DeclineLeaveInput,
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  SubmitLeaveInput,
  WithdrawLeaveInput,
} from "@repo/core";
export * from "./src/approvals/approval-service";
export * from "./src/calendar/calendar-service";
export * from "./src/duration/working-days";
export * from "./src/holidays/holiday-service";
export * from "./src/holidays/nager-client";
export * from "./src/people/alternative-contact-service";
export * from "./src/people/balance-refresh";
export * from "./src/people/current-status";
export * from "./src/people/field-ownership";
export * from "./src/people/manual-balance-service";
export * from "./src/people/people-service";
export * from "./src/plans/plan-service";
export * from "./src/plans/submit-service";
export * from "./src/records/record-type-categories";
export * from "./src/xero-connection-state";
