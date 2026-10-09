import "server-only";
import {
  type ClerkOrgId,
  dateKeyInTimeZone,
  type OrganisationId,
  type Result,
  startOfUtcDay,
  toDateOnly,
} from "@repo/core";
import { database } from "@repo/database";
import type {
  availability_approval_status,
  availability_record_type,
  availability_source_type,
  notification_type,
} from "@repo/database/generated/enums";
import { listForUser } from "@repo/notifications";
import { z } from "zod";
import {
  type ApprovalListItem,
  type ApprovalRole,
  listForApprover,
} from "../approvals/approval-service";
import {
  type CalendarRange,
  type CalendarRole,
  type CalendarScope,
  type CalendarServiceError,
  getCalendarRange,
} from "../calendar/calendar-service";
import {
  computeWorkingDaysFromReferenceData,
  loadWorkingDaysReferenceData,
} from "../duration/working-days";
import { resolvePublicHolidays } from "../holidays/resolve-public-holidays";
import {
  type BalanceRow,
  getPersonProfile,
  listPeople,
} from "../people/people-service";
import { listMyRecords, type RecordListItem } from "../plans/plan-service";
import { managerScopePersonIds } from "../settings/manager-scope";
import { getSettings } from "../settings/organisation-settings-service";
import type { CoverageMap } from "../team-coverage/coverage-map";
import { loadManagerCoverage } from "../team-coverage/load-manager-coverage";
import { getXeroConnectionStateForScope } from "../xero-connection-state";
import { createDashboardCache, type DashboardCache } from "./dashboard-cache";
import { buildTimelineWeek, type TimelineWeek } from "./timeline-week";
export type DashboardRole =
  | "owner"
  | "admin"
  | "manager"
  | "employee"
  | "viewer";
export type DashboardServiceError =
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "person_not_found";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    }
  | {
      code: "unknown_error";
      message: string;
    };
export type DashboardSection<TData> =
  | {
      status: "error";
      message: string;
    }
  | {
      data: TData;
      status: "ready";
    };
export interface DashboardInfoRequest {
  actionUrl: string | null;
  body: string;
  createdAt: Date;
  notificationId: string;
  title: string;
  type: notification_type;
}
export interface DashboardMyRequest {
  approvalStatus: availability_approval_status;
  canEdit: boolean;
  canWithdraw: boolean;
  /** Working days, or null when the duration cannot be computed. */
  dayCount: number | null;
  endsAt: Date;
  recordId: string;
  recordType: availability_record_type;
  sourceType: availability_source_type;
  startsAt: Date;
}
export interface DashboardApprovalRow {
  durationWorkingDays: number | null;
  endsAt: Date;
  personFirstName: string;
  personLastName: string;
  recordId: string;
  recordType: availability_record_type;
  sourceType: string;
  startsAt: Date;
  submittedAt: Date | null;
}
export interface DashboardApprovalQueue {
  count: number;
  /** Oldest submitted first, at most five. */
  rows: DashboardApprovalRow[];
}
interface DashboardBaseView {
  actionItems: DashboardSection<{
    infoRequestedNotifications: DashboardInfoRequest[];
  }>;
  balances: DashboardSection<{
    xeroConnectionState: import("@repo/core").XeroConnectionDisplayState;
    isXeroLinked: boolean;
    lastFetchedAt: Date | null;
    rows: BalanceRow[];
  }>;
  header: {
    firstName: string;
    lastName: string;
    locationName: string | null;
    roleLabel: "Admin" | "Employee" | "Manager" | "Owner";
    timezone: string | null;
  };
  publicHolidays: DashboardSection<{
    daysUntil: number | null;
    next: DashboardHoliday | null;
  }>;
  timeline: DashboardSection<TimelineWeek>;
}
export interface EmployeeDashboardView extends DashboardBaseView {
  myRequests: DashboardSection<{ records: DashboardMyRequest[] }>;
}
export interface ManagerDashboardView extends DashboardBaseView {
  approvalQueue: DashboardSection<DashboardApprovalQueue>;
  coverage: DashboardSection<CoverageMap>;
  header: DashboardBaseView["header"] & {
    directReportCount: number;
    roleLabel: "Manager";
    scopeLabel: string;
  };
}
export interface AdminDashboardView extends DashboardBaseView {
  approvalQueue: DashboardSection<DashboardApprovalQueue>;
  header: DashboardBaseView["header"] & {
    organisationName: string;
    roleLabel: "Admin" | "Owner";
    totalActivePeopleCount: number;
  };
}
const ResolveRoleSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  orgRole: z.string().nullable().optional(),
  userId: z.string().min(1),
});
const ViewSchema = z.object({
  actingRole: z.enum(["admin", "employee", "manager", "owner", "viewer"]),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  userId: z.string().min(1),
  /** Any date in the timeline week to show; defaults to the current week. */
  weekAnchor: z.coerce.date().optional(),
});
type ViewInput = z.infer<typeof ViewSchema>;
export interface DashboardHoliday {
  /** UTC midnight of the holiday's calendar date. */
  holidayDate: Date;
  name: string;
  /** "HH:mm" for part-day holidays, otherwise null. */
  startsAt: string | null;
}
const LIST_ROW_LIMIT = 5;
const EMPLOYEE_TIMELINE_ROW_LIMIT = 1;
const MANAGER_TIMELINE_ROW_LIMIT = 12;
const ADMIN_TIMELINE_ROW_LIMIT = 10;
const COVERAGE_SECOND_WEEK_OFFSET_DAYS = 7;
const DEFAULT_TIMEZONE = "Australia/Brisbane";
const MY_REQUEST_STATUSES: availability_approval_status[] = [
  "submitted",
  "approved",
  "declined",
];
export async function resolveDashboardRole(
  input: z.input<typeof ResolveRoleSchema>
): Promise<Result<DashboardRole, DashboardServiceError>> {
  const parsed = ResolveRoleSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  try {
    const person = await database.person.findFirst({
      select: { id: true },
      where: {
        archived_at: null,
        clerk_org_id: parsed.data.clerkOrgId,
        clerk_user_id: parsed.data.userId,
        organisation_id: parsed.data.organisationId,
      },
    });
    if (parsed.data.orgRole === "org:owner") {
      return { ok: true, value: "owner" };
    }
    if (parsed.data.orgRole === "org:admin") {
      return { ok: true, value: "admin" };
    }
    if (!person) {
      return { ok: true, value: "viewer" };
    }
    const directReportCount = await database.person.count({
      where: {
        archived_at: null,
        clerk_org_id: parsed.data.clerkOrgId,
        manager_person_id: person.id,
        organisation_id: parsed.data.organisationId,
      },
    });
    if (directReportCount > 0) {
      return { ok: true, value: "manager" };
    }
    return { ok: true, value: "employee" };
  } catch {
    return unknownError("Failed to resolve dashboard role.");
  }
}
export async function getEmployeeView(
  input: z.input<typeof ViewSchema>,
  cache: DashboardCache = createDashboardCache()
): Promise<Result<EmployeeDashboardView, DashboardServiceError>> {
  const parsed = ViewSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  return await cache.getOrLoad(
    cacheKey("employee", parsed.data),
    async () => await buildEmployeeView(parsed.data, cache)
  );
}
export async function getManagerView(
  input: z.input<typeof ViewSchema>,
  cache: DashboardCache = createDashboardCache()
): Promise<Result<ManagerDashboardView, DashboardServiceError>> {
  const parsed = ViewSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  try {
    const { data } = parsed;
    const today = new Date();
    const currentWeek = loadCalendarWeek(data, {
      anchorDate: today,
      role: "manager",
      scope: { type: "my_team" },
    });
    const nextWeek = loadCalendarWeek(data, {
      anchorDate: addDays(today, COVERAGE_SECOND_WEEK_OFFSET_DAYS),
      role: "manager",
      scope: { type: "my_team" },
    });
    const timelineWeek = data.weekAnchor
      ? loadCalendarWeek(data, {
          anchorDate: data.weekAnchor,
          role: "manager",
          scope: { type: "my_team" },
        })
      : currentWeek;
    const [
      baseResult,
      settingsResult,
      directReportCount,
      scopePersonIds,
      approvalQueue,
      timeline,
      coverage,
    ] = await Promise.all([
      loadBaseView(data, cache),
      getSettings({
        clerkOrgId: data.clerkOrgId,
        organisationId: data.organisationId,
      }),
      database.person.count({
        where: {
          archived_at: null,
          clerk_org_id: data.clerkOrgId,
          manager_person_id: data.personId,
          organisation_id: data.organisationId,
        },
      }),
      managerScopePersonIds({
        actingPersonId: data.personId,
        clerkOrgId: data.clerkOrgId,
        organisationId: data.organisationId,
      }),
      loadApprovalQueue(data, approvalRole(data.actingRole)),
      timelineSection(timelineWeek, {
        actingPersonId: data.personId,
        onlyPeopleWithEntries: false,
        rowLimit: MANAGER_TIMELINE_ROW_LIMIT,
        today,
      }),
      loadCoverageSection(data, [currentWeek, nextWeek], today),
    ]);
    if (!baseResult.ok) {
      return baseResult;
    }
    const includeIndirectReports =
      settingsResult.ok &&
      settingsResult.value.managerVisibilityScope === "all_team_leave";
    const scopeCount = Math.max(scopePersonIds.length - 1, 0);
    return {
      ok: true,
      value: {
        ...baseResult.value,
        approvalQueue,
        coverage,
        header: {
          ...baseResult.value.header,
          directReportCount,
          roleLabel: "Manager",
          scopeLabel: includeIndirectReports
            ? `${scopeCount} team members (direct + indirect)`
            : `${directReportCount} direct reports`,
        },
        timeline,
      },
    };
  } catch {
    return unknownError("Failed to build manager dashboard.");
  }
}
export async function getAdminView(
  input: z.input<typeof ViewSchema>,
  cache: DashboardCache = createDashboardCache()
): Promise<Result<AdminDashboardView, DashboardServiceError>> {
  const parsed = ViewSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  try {
    const { data } = parsed;
    const adminRole = data.actingRole === "owner" ? "owner" : "admin";
    const today = new Date();
    const [
      baseResult,
      organisation,
      peopleCountResult,
      approvalQueue,
      timeline,
    ] = await Promise.all([
      loadBaseView(data, cache),
      database.organisation.findFirst({
        select: { name: true },
        where: {
          clerk_org_id: data.clerkOrgId,
          id: data.organisationId,
        },
      }),
      listPeople({
        actingPersonId: data.personId,
        clerkOrgId: data.clerkOrgId,
        filters: {
          includeArchived: false,
          personType: "all",
          xeroLinked: "all",
          xeroSyncFailedOnly: false,
        },
        organisationId: data.organisationId,
        pagination: { pageSize: 1 },
        role: adminRole,
      }),
      loadApprovalQueue(data, approvalRole(adminRole)),
      timelineSection(
        loadCalendarWeek(data, {
          anchorDate: data.weekAnchor ?? today,
          role: adminRole,
          scope: { type: "all_teams" },
        }),
        {
          actingPersonId: data.personId,
          onlyPeopleWithEntries: true,
          rowLimit: ADMIN_TIMELINE_ROW_LIMIT,
          today,
        }
      ),
    ]);
    if (!baseResult.ok) {
      return baseResult;
    }
    return {
      ok: true,
      value: {
        ...baseResult.value,
        approvalQueue,
        header: {
          ...baseResult.value.header,
          organisationName: organisation?.name ?? "Organisation",
          roleLabel: adminRole === "owner" ? "Owner" : "Admin",
          totalActivePeopleCount: peopleCountResult.ok
            ? peopleCountResult.value.totalCount
            : 0,
        },
        timeline,
      },
    };
  } catch {
    return unknownError("Failed to build admin dashboard.");
  }
}
async function buildEmployeeView(
  input: ViewInput,
  cache: DashboardCache
): Promise<Result<EmployeeDashboardView, DashboardServiceError>> {
  try {
    const today = new Date();
    const [baseResult, timeline] = await Promise.all([
      loadBaseView(input, cache),
      timelineSection(
        loadCalendarWeek(input, {
          anchorDate: input.weekAnchor ?? today,
          role: "viewer",
          scope: { type: "my_self" },
        }),
        {
          actingPersonId: input.personId,
          onlyPeopleWithEntries: false,
          rowLimit: EMPLOYEE_TIMELINE_ROW_LIMIT,
          today,
        }
      ),
    ]);
    if (!baseResult.ok) {
      return baseResult;
    }
    const myRequests = await loadMyRequests(input, {
      timezone: baseResult.value.header.timezone ?? DEFAULT_TIMEZONE,
      today,
    });
    return {
      ok: true,
      value: {
        ...baseResult.value,
        myRequests,
        timeline,
      },
    };
  } catch {
    return unknownError("Failed to build employee dashboard.");
  }
}
type DashboardBaseData = Omit<DashboardBaseView, "timeline">;
async function loadBaseView(
  input: ViewInput,
  cache: DashboardCache
): Promise<Result<DashboardBaseData, DashboardServiceError>> {
  return await cache.getOrLoad(
    cacheKey("base", input),
    async () => await buildBaseView(input, cache)
  );
}
async function buildBaseView(
  input: ViewInput,
  cache: DashboardCache
): Promise<Result<DashboardBaseData, DashboardServiceError>> {
  try {
    const [profileResult, xeroStateResult] = await Promise.all([
      getPersonProfile({
        actingPersonId: input.personId,
        actingUserId: input.userId,
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
        personId: input.personId,
        role: peopleRole(input.actingRole),
      }),
      getXeroConnectionStateForScope({
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
      }),
    ]);
    const xeroConnectionState = xeroStateResult.ok
      ? xeroStateResult.value.state
      : "unavailable";
    if (!profileResult.ok) {
      if (profileResult.error.code === "person_not_found") {
        return personNotFound();
      }
      return unknownError(profileResult.error.message);
    }
    const profile = profileResult.value;
    const [actionItems, publicHolidays] = await Promise.all([
      cache.getOrLoad(
        cacheKey("action-items", input),
        async () => await loadActionItemsCard(input)
      ),
      cache.getOrLoad(
        cacheKey("public-holidays", input),
        async () =>
          await loadPublicHolidayCard({
            clerkOrgId: input.clerkOrgId,
            locationId: profile.header.location?.id ?? null,
            organisationId: input.organisationId,
          })
      ),
    ]);
    return {
      ok: true,
      value: {
        actionItems,
        balances: readySection({
          isXeroLinked: profile.balances.xeroLinked,
          lastFetchedAt: profile.balances.balancesLastFetchedAt,
          rows: profile.balances.rows,
          xeroConnectionState,
        }),
        header: {
          firstName: profile.header.firstName,
          lastName: profile.header.lastName,
          locationName: profile.header.location?.name ?? null,
          roleLabel: "Employee",
          timezone: profile.header.location?.timezone ?? null,
        },
        publicHolidays,
      },
    };
  } catch {
    return unknownError("Failed to build dashboard.");
  }
}
async function loadActionItemsCard(
  input: ViewInput
): Promise<DashboardBaseView["actionItems"]> {
  const notificationsResult = await listForUser({
    clerkOrgId: input.clerkOrgId,
    filters: {
      type: ["leave_info_requested"],
      unreadOnly: true,
    },
    organisationId: input.organisationId,
    pagination: { pageSize: LIST_ROW_LIMIT },
    userId: input.userId,
  });
  if (!notificationsResult.ok) {
    return errorSection(notificationsResult.error.message);
  }
  return readySection({
    infoRequestedNotifications: notificationsResult.value.notifications.map(
      (notification) => ({
        actionUrl: notification.actionUrl,
        body: notification.body,
        createdAt: notification.createdAt,
        notificationId: notification.id,
        title: notification.title,
        type: notification.type,
      })
    ),
  });
}
/**
 * The viewer's submitted, approved and declined records that end today or
 * later, soonest first. Records store wall-clock times in UTC, so "today" is
 * the person's local date at UTC midnight.
 */
async function loadMyRequests(
  input: ViewInput,
  options: { timezone: string; today: Date }
): Promise<EmployeeDashboardView["myRequests"]> {
  const todayStart = new Date(
    `${dateKeyInTimeZone(options.today, options.timezone)}T00:00:00.000Z`
  );
  const recordsResult = await listMyRecords({
    clerkOrgId: input.clerkOrgId,
    filters: {
      approvalStatus: MY_REQUEST_STATUSES,
      dateRange: { from: todayStart },
      includeArchived: false,
    },
    organisationId: input.organisationId,
    userId: input.userId,
  });
  if (!recordsResult.ok) {
    return errorSection(recordsResult.error.message);
  }
  const records = recordsResult.value
    .filter((record) => record.endsAt >= todayStart)
    .sort(
      (first, second) =>
        first.startsAt.getTime() - second.startsAt.getTime() ||
        first.id.localeCompare(second.id)
    )
    .slice(0, LIST_ROW_LIMIT);
  const durationInputs = records.map((record) => ({
    allDay: record.allDay,
    clerkOrgId: input.clerkOrgId,
    endsAt: record.endsAt,
    locationId: record.person.locationId,
    organisationId: input.organisationId,
    startsAt: record.startsAt,
  }));
  const referenceData = await loadWorkingDaysReferenceData(durationInputs);
  return readySection({
    records: records.map((record, index) => {
      const durationInput = durationInputs[index];
      const duration = durationInput
        ? computeWorkingDaysFromReferenceData(durationInput, referenceData)
        : null;
      return toMyRequest(record, duration?.ok ? duration.value : null);
    }),
  });
}
function toMyRequest(
  record: RecordListItem,
  dayCount: number | null
): DashboardMyRequest {
  return {
    approvalStatus: record.approvalStatus,
    canEdit:
      record.sourceType === "manual" &&
      record.approvalStatus === "approved" &&
      record.editableActions.includes("edit"),
    canWithdraw:
      record.approvalStatus === "submitted" &&
      record.editableActions.includes("withdraw"),
    dayCount,
    endsAt: record.endsAt,
    recordId: record.id,
    recordType: record.recordType,
    sourceType: record.sourceType,
    startsAt: record.startsAt,
  };
}
async function loadApprovalQueue(
  input: ViewInput,
  role: ApprovalRole
): Promise<DashboardSection<DashboardApprovalQueue>> {
  const result = await listForApprover({
    actingPersonId: input.personId,
    actingUserId: input.userId,
    clerkOrgId: input.clerkOrgId,
    filters: { status: ["submitted"] },
    organisationId: input.organisationId,
    pageSize: 200,
    role,
  });
  if (!result.ok) {
    return errorSection(result.error.message);
  }
  const submitted = unwrapApprovalItems(result.value).filter(
    (record) => record.approvalStatus === "submitted"
  );
  return readySection({
    count: submitted.length,
    rows: submitted
      .sort(
        (first, second) =>
          (first.submittedAt ?? first.createdAt).getTime() -
          (second.submittedAt ?? second.createdAt).getTime()
      )
      .slice(0, LIST_ROW_LIMIT)
      .map((record) => ({
        durationWorkingDays: record.durationWorkingDays,
        endsAt: record.endsAt,
        personFirstName: record.person.firstName,
        personLastName: record.person.lastName,
        recordId: record.id,
        recordType: record.recordType,
        sourceType: record.sourceType,
        startsAt: record.startsAt,
        submittedAt: record.submittedAt,
      })),
  });
}
type CalendarWeekResult = Result<CalendarRange, CalendarServiceError>;
/** Approved records for one calendar week in the given scope. */
function loadCalendarWeek(
  input: ViewInput,
  options: { anchorDate: Date; role: CalendarRole; scope: CalendarScope }
): Promise<CalendarWeekResult> {
  return getCalendarRange({
    actingPersonId: input.personId,
    actingUserId: input.userId,
    anchorDate: options.anchorDate,
    clerkOrgId: input.clerkOrgId,
    filters: {
      approvalStatus: ["approved"],
      includeDrafts: false,
      recordTypeCategory: "all",
    },
    organisationId: input.organisationId,
    role: options.role,
    scope: options.scope,
    view: "week",
  });
}
async function timelineSection(
  week: Promise<CalendarWeekResult>,
  options: {
    actingPersonId: string;
    onlyPeopleWithEntries: boolean;
    rowLimit: number;
    today: Date;
  }
): Promise<DashboardSection<TimelineWeek>> {
  const result = await week;
  if (!result.ok) {
    return errorSection(result.error.message);
  }
  return readySection(buildTimelineWeek({ ...options, range: result.value }));
}
async function loadCoverageSection(
  input: ViewInput,
  weeks: Promise<CalendarWeekResult>[],
  today: Date
): Promise<DashboardSection<CoverageMap>> {
  const results = await Promise.all(weeks);
  const ranges: CalendarRange[] = [];
  for (const result of results) {
    if (!result.ok) {
      return errorSection(result.error.message);
    }
    ranges.push(result.value);
  }
  const coverage = await loadManagerCoverage({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
    ranges,
    today,
  });
  return coverage.ok
    ? readySection(coverage.value)
    : errorSection(coverage.error.message);
}
async function loadPublicHolidayCard(input: {
  clerkOrgId: string;
  locationId: string | null;
  organisationId: string;
}): Promise<EmployeeDashboardView["publicHolidays"]> {
  const today = startOfDay(new Date());
  const holidayResult = await resolvePublicHolidays({
    clerkOrgId: input.clerkOrgId as ClerkOrgId,
    from: toDateOnly(today),
    organisationId: input.organisationId as OrganisationId,
    to: toDateOnly(addDays(today, 400)),
  });
  if (!holidayResult.ok) {
    return errorSection(holidayResult.error.message);
  }
  const match = holidayResult.value.find(
    (holiday) =>
      holiday.locationId === input.locationId &&
      (holiday.classification === "non_working" || holiday.kind === "part_day")
  );
  const next: DashboardHoliday | null = match
    ? {
        holidayDate: startOfUtcDay(match.date),
        name: match.name,
        startsAt: match.startsAt,
      }
    : null;
  return readySection({
    daysUntil: next ? dayDiff(next.holidayDate, today) : null,
    next,
  });
}
function approvalRole(role: DashboardRole): ApprovalRole {
  if (role === "owner") {
    return "owner";
  }
  if (role === "admin") {
    return "admin";
  }
  return "manager";
}
function peopleRole(
  role: DashboardRole
): "admin" | "manager" | "owner" | "viewer" {
  if (role === "owner") {
    return "owner";
  }
  if (role === "admin") {
    return "admin";
  }
  if (role === "manager") {
    return "manager";
  }
  return "viewer";
}
function startOfDay(value: Date) {
  const next = new Date(value);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}
function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function dayDiff(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}
function readySection<TData>(data: TData): DashboardSection<TData> {
  return { data, status: "ready" };
}
function errorSection(message: string): DashboardSection<never> {
  return { message, status: "error" };
}
function validationError(
  error: z.ZodError
): Result<never, DashboardServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid dashboard input.",
    },
    ok: false,
  };
}
function personNotFound(): Result<never, DashboardServiceError> {
  return {
    error: {
      code: "person_not_found",
      message: "Person not found for this dashboard view.",
    },
    ok: false,
  };
}
function unknownError(message: string): Result<never, DashboardServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}
function cacheKey(scope: string, input: ViewInput) {
  const week = input.weekAnchor ? toDateOnly(input.weekAnchor) : "current";
  return `${scope}:${input.clerkOrgId}:${input.organisationId}:${input.personId}:${input.userId}:${input.actingRole}:${week}`;
}
function unwrapApprovalItems(
  value:
    | ApprovalListItem[]
    | {
        items: ApprovalListItem[];
        nextCursor: string | null;
      }
): ApprovalListItem[] {
  return Array.isArray(value) ? value : value.items;
}
