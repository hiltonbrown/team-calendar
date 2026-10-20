import { getAccountApprovalSettings } from "../settings/account-approval-settings-service";
import "server-only";
import {
  type ClerkOrgId,
  dateKeyInTimeZone,
  type OrganisationId,
  type Result,
  startOfUtcDay,
  toDateOnly,
} from "@repo/core";
import {
  assertTenantDb,
  resolveAccountCompanies,
  type TenantDb,
} from "@repo/database";
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
  selectCalendarCompanies,
} from "../calendar/calendar-service";
import {
  computeWorkingDaysFromReferenceData,
  loadWorkingDaysReferenceData,
} from "../duration/working-days";
import { resolvePublicHolidays } from "../holidays/resolve-public-holidays";
import { type BalanceRow, getPersonProfile } from "../people/people-service";
import { listMyRecords, type RecordListItem } from "../plans/plan-service";
import { managerScopePersonIds } from "../settings/manager-scope";
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
  allDay: boolean;
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
  allDay: boolean;
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
  companyIds: z.array(z.string().uuid()).optional(),
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
const EMPLOYEE_TIMELINE_ROW_LIMIT = 10;
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
  input: z.input<typeof ResolveRoleSchema>,
  db: TenantDb
): Promise<Result<DashboardRole, DashboardServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const parsed = ResolveRoleSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const person = await client.person.findFirst({
      select: { id: true },
      where: {
        archived_at: null,
        clerk_org_id: parsed.data.clerkOrgId,
        clerk_user_id: parsed.data.userId,
        organisation: {
          archived_at: null,
          clerk_org_id: parsed.data.clerkOrgId,
        },
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
    const directReportCount = await client.person.count({
      where: {
        archived_at: null,
        clerk_org_id: parsed.data.clerkOrgId,
        manager_person_id: person.id,
        organisation: {
          archived_at: null,
          clerk_org_id: parsed.data.clerkOrgId,
        },
      },
    });
    if (directReportCount > 0) {
      return { ok: true, value: "manager" };
    }
    return { ok: true, value: "employee" };
  }
}
export async function getEmployeeView(
  input: z.input<typeof ViewSchema>,
  _cache: DashboardCache | undefined,
  db: TenantDb
): Promise<Result<EmployeeDashboardView, DashboardServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const cache = dashboardCacheForClient(client);

    const parsed = ViewSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    return await cache.getOrLoad(
      cacheKey("employee", parsed.data),
      async () => await buildEmployeeView(parsed.data, cache, client)
    );
  }
}
export async function getManagerView(
  input: z.input<typeof ViewSchema>,
  _cache: DashboardCache | undefined,
  db: TenantDb
): Promise<Result<ManagerDashboardView, DashboardServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const cache = dashboardCacheForClient(client);

    const parsed = ViewSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const { data } = parsed;
    const today = new Date();
    const currentWeek = await loadCalendarWeek(
      data,
      {
        anchorDate: today,
        role: "manager",
        scope: { type: "all_teams" },
      },
      client
    );
    const nextWeek = await loadCalendarWeek(
      data,
      {
        anchorDate: addDays(today, COVERAGE_SECOND_WEEK_OFFSET_DAYS),
        role: "manager",
        scope: { type: "all_teams" },
      },
      client
    );
    const timelineWeek = data.weekAnchor
      ? await loadCalendarWeek(
          data,
          {
            anchorDate: data.weekAnchor,
            role: "manager",
            scope: { type: "all_teams" },
          },
          client
        )
      : currentWeek;
    const [
      baseResult,
      settingsResult,
      directReportCount,
      scopePersonIds,
      approvalQueue,
      timeline,
      coverage,
    ] = [
      await loadBaseView(data, cache, client),
      await getAccountApprovalSettings({ clerkOrgId: data.clerkOrgId }, client),
      await client.person.count({
        where: {
          archived_at: null,
          clerk_org_id: data.clerkOrgId,
          manager_person_id: data.personId,
          organisation: {
            archived_at: null,
            clerk_org_id: data.clerkOrgId,
          },
        },
      }),
      await managerScopePersonIds(
        {
          actingPersonId: data.personId,
          clerkOrgId: data.clerkOrgId,
        },
        client
      ),
      await loadApprovalQueue(data, approvalRole(data.actingRole), client),
      await timelineSection(timelineWeek, {
        actingPersonId: data.personId,
        onlyPeopleWithEntries: false,
        rowLimit: MANAGER_TIMELINE_ROW_LIMIT,
        today,
      }),
      await loadCoverageSection(data, [currentWeek, nextWeek], today, client),
    ];
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
  }
}
export async function getAdminView(
  input: z.input<typeof ViewSchema>,
  _cache: DashboardCache | undefined,
  db: TenantDb
): Promise<Result<AdminDashboardView, DashboardServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const cache = dashboardCacheForClient(client);

    const parsed = ViewSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const { data } = parsed;
    const adminRole = data.actingRole === "owner" ? "owner" : "admin";
    const today = new Date();
    const [
      baseResult,
      organisation,
      peopleCountResult,
      approvalQueue,
      timeline,
    ] = [
      await loadBaseView(data, cache, client),
      await client.organisation.findFirst({
        select: { name: true },
        where: {
          clerk_org_id: data.clerkOrgId,
          id:
            data.companyIds?.length === 1
              ? data.companyIds[0]
              : data.organisationId,
        },
      }),
      await client.person.count({
        where: {
          clerk_org_id: data.clerkOrgId,
          organisation: {
            archived_at: null,
            clerk_org_id: data.clerkOrgId,
          },
          ...(data.companyIds
            ? { organisation_id: { in: data.companyIds } }
            : {}),
          archived_at: null,
          is_active: true,
        },
      }),
      await loadApprovalQueue(data, approvalRole(adminRole), client),
      await timelineSection(
        await loadCalendarWeek(
          data,
          {
            anchorDate: data.weekAnchor ?? today,
            role: adminRole,
            scope: { type: "all_teams" },
          },
          client
        ),
        {
          actingPersonId: data.personId,
          onlyPeopleWithEntries: true,
          rowLimit: ADMIN_TIMELINE_ROW_LIMIT,
          today,
        }
      ),
    ];
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
          organisationName:
            data.companyIds?.length === 1
              ? (organisation?.name ?? "Company")
              : "All companies",
          roleLabel: adminRole === "owner" ? "Owner" : "Admin",
          totalActivePeopleCount: peopleCountResult,
        },
        timeline,
      },
    };
  }
}
async function buildEmployeeView(
  input: ViewInput,
  cache: DashboardCache,
  db: TenantDb
): Promise<Result<EmployeeDashboardView, DashboardServiceError>> {
  const today = new Date();
  const [baseResult, timeline] = [
    await loadBaseView(input, cache, db),
    await timelineSection(
      await loadCalendarWeek(
        input,
        {
          anchorDate: input.weekAnchor ?? today,
          role: "viewer",
          scope: { type: "all_teams" },
        },
        db
      ),
      {
        actingPersonId: input.personId,
        onlyPeopleWithEntries: false,
        rowLimit: EMPLOYEE_TIMELINE_ROW_LIMIT,
        today,
      }
    ),
  ];
  if (!baseResult.ok) {
    return baseResult;
  }
  const myRequests = await loadMyRequests(
    input,
    {
      timezone: baseResult.value.header.timezone ?? DEFAULT_TIMEZONE,
      today,
    },
    db
  );
  return {
    ok: true,
    value: {
      ...baseResult.value,
      myRequests,
      timeline,
    },
  };
}
type DashboardBaseData = Omit<DashboardBaseView, "timeline">;
async function loadBaseView(
  input: ViewInput,
  cache: DashboardCache,
  db: TenantDb
): Promise<Result<DashboardBaseData, DashboardServiceError>> {
  return await cache.getOrLoad(
    cacheKey("base", input),
    async () => await buildBaseView(input, cache, db)
  );
}
async function buildBaseView(
  input: ViewInput,
  cache: DashboardCache,
  db: TenantDb
): Promise<Result<DashboardBaseData, DashboardServiceError>> {
  const [profileResult, xeroStateResult] = [
    await getPersonProfile(
      {
        actingPersonId: input.personId,
        actingUserId: input.userId,
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
        personId: input.personId,
        role: peopleRole(input.actingRole),
      },
      db
    ),
    await getXeroConnectionStateForScope(
      {
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
      },
      db
    ),
  ];
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
  const [actionItems, publicHolidays] = [
    await cache.getOrLoad(
      cacheKey("action-items", input),
      async () => await loadActionItemsCard(input, db)
    ),
    await cache.getOrLoad(
      cacheKey("public-holidays", input),
      async () =>
        await loadPublicHolidayCard(
          {
            clerkOrgId: input.clerkOrgId,
            locationId: profile.header.location?.id ?? null,
            organisationId: input.organisationId,
          },
          db
        )
    ),
  ];
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
}
async function loadActionItemsCard(
  input: ViewInput,
  db: TenantDb
): Promise<DashboardBaseView["actionItems"]> {
  const notificationsResult = await listForUser(
    {
      clerkOrgId: input.clerkOrgId,
      filters: {
        type: ["leave_info_requested"],
        unreadOnly: true,
      },
      pagination: { pageSize: LIST_ROW_LIMIT },
      userId: input.userId,
    },
    db
  );
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
  options: { timezone: string; today: Date },
  db: TenantDb
): Promise<EmployeeDashboardView["myRequests"]> {
  const todayStart = new Date(
    `${dateKeyInTimeZone(options.today, options.timezone)}T00:00:00.000Z`
  );
  const recordsResult = await listMyRecords(
    {
      clerkOrgId: input.clerkOrgId,
      filters: {
        approvalStatus: MY_REQUEST_STATUSES,
        dateRange: { from: todayStart },
        includeArchived: false,
      },
      organisationId: input.organisationId,
      userId: input.userId,
    },
    db
  );
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
  const referenceData = await loadWorkingDaysReferenceData(durationInputs, db);
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
    allDay: record.allDay,
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
type ApprovalQueueInput = Pick<
  ViewInput,
  "clerkOrgId" | "userId" | "companyIds"
> & { personId: string | null };

export async function getDashboardApprovalQueue(
  input: ApprovalQueueInput & { actingRole: ApprovalRole },
  db: TenantDb
): Promise<DashboardSection<DashboardApprovalQueue>> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;
    return await loadApprovalQueue(input, input.actingRole, client);
  }
}

async function loadApprovalQueue(
  input: ApprovalQueueInput,
  role: ApprovalRole,
  db: TenantDb
): Promise<DashboardSection<DashboardApprovalQueue>> {
  const companies = await resolveAccountCompanies(input.clerkOrgId, db);
  const selection = selectCalendarCompanies(
    { companyIds: input.companyIds },
    companies
  );
  if (!selection.ok) {
    return errorSection(selection.error.message);
  }
  const submitted: ApprovalListItem[] = [];
  let cursor: string | null = null;
  do {
    const result = await listForApprover(
      {
        actingPersonId: input.personId,
        actingUserId: input.userId,
        clerkOrgId: input.clerkOrgId,
        cursor,
        filters: { status: ["submitted"] },
        pageSize: 200,
        role,
      },
      db
    );
    if (!result.ok) {
      return errorSection(result.error.message);
    }
    submitted.push(
      ...result.value.items.filter(
        (record) =>
          record.approvalStatus === "submitted" &&
          selection.value.some(
            (company) => company.id === record.organisationId
          )
      )
    );
    cursor = result.value.nextCursor;
  } while (cursor);
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
        allDay: record.allDay,
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
async function loadCalendarWeek(
  input: ViewInput,
  options: { anchorDate: Date; role: CalendarRole; scope: CalendarScope },
  db: TenantDb
): Promise<CalendarWeekResult> {
  return await getCalendarRange(
    {
      actingPersonId: input.personId,
      actingUserId: input.userId,
      anchorDate: options.anchorDate,
      clerkOrgId: input.clerkOrgId,
      companyIds: input.companyIds,
      filters: {
        approvalStatus: ["approved"],
        includeDrafts: false,
        recordTypeCategory: "all",
      },
      role: options.role,
      scope: options.scope,
      view: "week",
    },
    db
  );
}
async function timelineSection(
  week: CalendarWeekResult,
  options: {
    actingPersonId: string;
    onlyPeopleWithEntries: boolean;
    rowLimit: number;
    today: Date;
  }
): Promise<DashboardSection<TimelineWeek>> {
  const result = week;
  if (!result.ok) {
    return await errorSection(result.error.message);
  }
  return await readySection(
    buildTimelineWeek({ ...options, range: result.value })
  );
}
async function loadCoverageSection(
  input: ViewInput,
  weeks: CalendarWeekResult[],
  today: Date,
  db: TenantDb
): Promise<DashboardSection<CoverageMap>> {
  const results = weeks;
  const ranges: CalendarRange[] = [];
  for (const result of results) {
    if (!result.ok) {
      return errorSection(result.error.message);
    }
    ranges.push(result.value);
  }
  const coverage = await loadManagerCoverage(
    {
      clerkOrgId: input.clerkOrgId,
      companyIds: input.companyIds,
      organisationId: input.organisationId,
      ranges,
      today,
    },
    db
  );
  return coverage.ok
    ? readySection(coverage.value)
    : errorSection(coverage.error.message);
}
async function loadPublicHolidayCard(
  input: {
    clerkOrgId: string;
    locationId: string | null;
    organisationId: string;
  },
  db: TenantDb
): Promise<EmployeeDashboardView["publicHolidays"]> {
  const today = startOfDay(new Date());
  const holidayResult = await resolvePublicHolidays(
    {
      clerkOrgId: input.clerkOrgId as ClerkOrgId,
      from: toDateOnly(today),
      organisationId: input.organisationId as OrganisationId,
      to: toDateOnly(addDays(today, 400)),
    },
    undefined,
    db
  );
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
  return `${scope}:${input.clerkOrgId}:${input.organisationId}:${input.personId}:${input.userId}:${input.actingRole}:${input.companyIds?.slice().sort().join(",") ?? "all"}:${week}`;
}

const dashboardCaches = new WeakMap<TenantDb, DashboardCache>();
function dashboardCacheForClient(db: TenantDb): DashboardCache {
  const cached = dashboardCaches.get(db);
  if (cached) {
    return cached;
  }
  const cache = createDashboardCache();
  dashboardCaches.set(db, cache);
  return cache;
}
