import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database } from "@repo/database";
import type {
  availability_approval_status,
  availability_contactability,
  availability_failed_action,
  availability_record_type,
  availability_source_type,
  notification_type,
} from "@repo/database/generated/enums";
import {
  type DashboardFeedSummary,
  getFeedSummaryForDashboard,
} from "@repo/feeds";
import { listForUser } from "@repo/notifications";
import { z } from "zod";
import {
  type ApprovalListItem,
  type ApprovalRole,
  listForApprover,
} from "../approvals/approval-service";
import {
  type CalendarEvent,
  getCalendarRange,
} from "../calendar/calendar-service";
import { listForOrganisation } from "../holidays/holiday-service";
import {
  type BalanceRow,
  getPersonProfile,
  listPeople,
  listUpcomingRecords,
  type PersonListItem,
} from "../people/people-service";
import { listMyRecords } from "../plans/plan-service";
import { isXeroLeaveType } from "../records/record-type-categories";
import { listEvents as listAuditLogEvents } from "../settings/audit-log-service";
import {
  type DashboardBillingSummary,
  getBillingSummaryForDashboard,
} from "../settings/billing-service";
import { managerScopePersonIds } from "../settings/manager-scope";
import { getSettings } from "../settings/organisation-settings-service";
import { listRuns, listTenantSummaries } from "../sync/sync-monitor-service";
import { hasActiveXeroConnection } from "../xero-connection-state";
import { createDashboardCache, type DashboardCache } from "./dashboard-cache";

export type DashboardRole =
  | "owner"
  | "admin"
  | "manager"
  | "employee"
  | "viewer";

export type DashboardServiceError =
  | { code: "cross_org_leak"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "person_not_found"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

export type DashboardSection<TData> =
  | { status: "error"; message: string }
  | { data: TData; status: "ready" };

export interface EmployeeDashboardView {
  actionItems: DashboardSection<{
    declinedRecords: Array<{
      approvalNote: string | null;
      declinedAt: Date | null;
      endsAt: Date;
      recordId: string;
      recordType: availability_record_type;
      startsAt: Date;
    }>;
    infoRequestedNotifications: Array<{
      actionUrl: string | null;
      body: string;
      createdAt: Date;
      notificationId: string;
      title: string;
      type: notification_type;
    }>;
    xeroSyncFailedRecords: Array<{
      endsAt: Date;
      failedAction: availability_failed_action | null;
      recordId: string;
      recordType: availability_record_type;
      startsAt: Date;
      xeroWriteError: string | null;
    }>;
  }>;
  balances: DashboardSection<{
    hasActiveXeroConnection: boolean;
    isXeroLinked: boolean;
    lastFetchedAt: Date | null;
    rows: BalanceRow[];
  }>;
  header: {
    firstName: string;
    hasActiveXeroConnection: boolean;
    lastName: string;
    locationName: string | null;
    roleLabel: "Admin" | "Employee" | "Manager" | "Owner";
    timezone: string | null;
  };
  publicHolidays: DashboardSection<{
    daysUntil: number | null;
    next: HolidayRow | null;
  }>;
  quickActions: {
    canCreatePlan: true;
    canViewCalendar: true;
    canViewNotifications: true;
  };
  todayStatus: DashboardSection<{
    activePublicHoliday: {
      date: Date;
      id: string;
      name: string;
      source: string;
      type: string;
    } | null;
    activeRecord: {
      approvalStatus: availability_approval_status;
      endsAt: Date;
      id: string;
      recordType: availability_record_type;
      sourceType: availability_source_type;
      startsAt: Date;
      title: string | null;
    } | null;
    currentStatus: {
      approvalStatus: availability_approval_status | null;
      contactabilityStatus: string | null;
      label: string;
      recordType: availability_record_type | null;
      statusKey: string;
    };
  }>;
  upcoming: DashboardSection<{
    next14Days: Array<{
      allDay: boolean;
      approvalStatus: availability_approval_status;
      endsAt: Date;
      recordId: string;
      recordType: availability_record_type;
      startsAt: Date;
    }>;
  }>;
}

export interface ManagerDashboardView extends EmployeeDashboardView {
  approvalQueue: DashboardSection<{
    ctaUrl: string;
    failedCount: number;
    mostRecent: Array<{
      endsAt: Date;
      personFirstName: string;
      personLastName: string;
      recordId: string;
      recordType: availability_record_type;
      startsAt: Date;
      submittedAt: Date | null;
    }>;
    pendingCount: number;
  }>;
  header: EmployeeDashboardView["header"] & {
    directReportCount: number;
    roleLabel: "Manager";
    scopeLabel: string;
  };
  teamThisWeek: DashboardSection<{
    ctaUrl: string;
    peopleWithLeaveCount: number;
    upcomingRecords: Array<{
      endsAt: Date;
      personFirstName: string;
      personLastName: string;
      recordId: string;
      recordType: availability_record_type;
      startsAt: Date;
    }>;
  }>;
  teamToday: DashboardSection<{
    ctaUrl: string;
    peopleAvailableCount: number;
    peopleNeedingAttention: Array<{
      approvalStatus: availability_approval_status | null;
      contactabilityStatus: availability_contactability | null;
      endsAt: Date | null;
      personFirstName: string;
      personId: string;
      personLastName: string;
      recordType: availability_record_type | null;
      startsAt: Date | null;
      statusKey: PersonListItem["currentStatus"]["statusKey"];
      statusLabel: string;
      xeroSyncFailedCount: number;
    }>;
    peopleOnLeaveCount: number;
    peopleOtherOooCount: number;
    peopleTravellingCount: number;
    peopleWithXeroSyncFailedCount: number;
    peopleWorkingFromHomeCount: number;
  }>;
  teamXeroSyncFailed: DashboardSection<{
    count: number;
    ctaUrl: string;
    recentRecords: Array<{
      failedAction: availability_failed_action | null;
      personFirstName: string;
      personLastName: string;
      recordId: string;
      recordType: availability_record_type;
      xeroWriteError: string | null;
    }>;
  }>;
  upcomingPeaks: DashboardSection<{
    ctaUrl: string;
    peaks: Array<{
      date: Date;
      peopleAwayCount: number;
      percentage: number;
      recordTypes: availability_record_type[];
      totalPeopleInScope: number;
    }>;
    totalPeaksCount: number;
  }>;
}

export interface AdminDashboardView extends EmployeeDashboardView {
  activeFeeds: DashboardSection<DashboardFeedSummary & { ctaUrl: string }>;
  header: EmployeeDashboardView["header"] & {
    organisationName: string;
    roleLabel: "Admin" | "Owner";
    totalActivePeopleCount: number;
  };
  orgWidePendingApprovals: DashboardSection<{
    count: number;
    ctaUrl: string;
    oldestAgeDays: number | null;
  }>;
  orgWideXeroSyncFailed: DashboardSection<{
    byFailedAction: {
      approve: number;
      decline: number;
      submit: number;
      withdraw: number;
    };
    count: number;
    ctaUrl: string;
  }>;
  recentAuditEvents: DashboardSection<{
    ctaUrl: string;
    events: Array<{
      action: string;
      actorDisplay: string;
      createdAt: Date;
      entityType: string | null;
      id: string;
    }>;
  }>;
  syncHealth: DashboardSection<{
    activeTenantCount: number;
    ctaUrl: string;
    failedRunsLast24h: number;
    hasActiveXeroConnection: boolean;
    lastSuccessfulSync: Date | null;
    pendingFailedRecords: number;
    runsLast24h: number;
    tenantCount: number;
  }>;
  usageVsLimits: DashboardSection<{
    ctaUrl: string;
    isOverLimit: boolean;
    metrics: Array<{
      currentValue: number;
      label: string;
      limit: number | null;
      metricKey: string;
      percentage: number | null;
      unit: string;
    }>;
    plan: DashboardBillingSummary["plan"];
    visibleToAdmin: boolean;
  }>;
}

const ResolveRoleSchema = z.object({
  clerkOrgId: z.string().min(1),
  orgRole: z.string().nullable().optional(),
  organisationId: z.string().uuid(),
  userId: z.string().min(1),
});

const ViewSchema = z.object({
  actingRole: z.enum(["admin", "employee", "manager", "owner", "viewer"]),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  userId: z.string().min(1),
});

type HolidayListResult = Awaited<ReturnType<typeof listForOrganisation>>;
type HolidayRow = Extract<HolidayListResult, { ok: true }>["value"][number];
type CalendarRangeData =
  Awaited<ReturnType<typeof getCalendarRange>> extends Result<
    infer TValue,
    infer _
  >
    ? TValue
    : never;

type SyncHealthCardData =
  AdminDashboardView["syncHealth"] extends DashboardSection<infer TData>
    ? TData
    : never;

const AUDIT_EVENT_ALLOWLIST = [
  "availability_records.submitted",
  "availability_records.approved",
  "availability_records.declined",
  "availability_records.reconciled_to_approved",
  "availability_records.reconciled_to_declined",
  "availability_records.reconciled_to_submitted",
  "feeds.created",
  "feeds.updated",
  "feeds.archived",
  "feeds.restored",
  "feeds.paused",
  "feeds.resumed",
  "organisation.updated",
  "organisation_settings.updated",
  "xero.connection_refreshed",
  "xero.connection_disconnected_soft",
  "xero.connection_disconnected_destructive",
  "xero.tenant_sync_paused",
  "xero.tenant_sync_resumed",
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
      where: {
        archived_at: null,
        clerk_org_id: parsed.data.clerkOrgId,
        clerk_user_id: parsed.data.userId,
        organisation_id: parsed.data.organisationId,
      },
      select: { id: true },
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
    const [employeeResult, settingsResult, directReportCount, scopePersonIds] =
      await Promise.all([
        getEmployeeView(parsed.data, cache),
        getSettings({
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
        }),
        database.person.count({
          where: {
            archived_at: null,
            clerk_org_id: parsed.data.clerkOrgId,
            manager_person_id: parsed.data.personId,
            organisation_id: parsed.data.organisationId,
          },
        }),
        managerScopePersonIds({
          actingPersonId: parsed.data.personId,
          clerkOrgId: parsed.data.clerkOrgId,
          organisationId: parsed.data.organisationId,
        }),
      ]);

    if (!employeeResult.ok) {
      return employeeResult;
    }

    const managerRole = approvalRole(parsed.data.actingRole);
    const [
      peopleResult,
      approvalItemsResult,
      weekCalendarResult,
      monthCalendarResult,
    ] = await Promise.all([
      listAllPeople({
        actingPersonId: parsed.data.personId,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        role: "manager",
      }),
      listForApprover({
        actingPersonId: parsed.data.personId,
        actingUserId: parsed.data.userId,
        clerkOrgId: parsed.data.clerkOrgId,
        filters: { status: ["submitted", "xero_sync_failed"] },
        organisationId: parsed.data.organisationId,
        role: managerRole,
      }),
      getCalendarRange({
        actingPersonId: parsed.data.personId,
        actingUserId: parsed.data.userId,
        anchorDate: new Date(),
        clerkOrgId: parsed.data.clerkOrgId,
        filters: {
          approvalStatus: ["approved"],
          includeDrafts: false,
          recordTypeCategory: "all",
        },
        organisationId: parsed.data.organisationId,
        role: "manager",
        scope: { type: "my_team" },
        view: "week",
      }),
      getCalendarRange({
        actingPersonId: parsed.data.personId,
        actingUserId: parsed.data.userId,
        anchorDate: new Date(),
        clerkOrgId: parsed.data.clerkOrgId,
        filters: {
          approvalStatus: ["approved"],
          includeDrafts: false,
          recordTypeCategory: "all",
        },
        organisationId: parsed.data.organisationId,
        role: "manager",
        scope: { type: "my_team" },
        view: "month",
      }),
    ]);

    const includeIndirectReports =
      settingsResult.ok &&
      settingsResult.value.managerVisibilityScope === "all_team_leave";
    const scopeCount = Math.max(scopePersonIds.length - 1, 0);
    const header: ManagerDashboardView["header"] = {
      ...employeeResult.value.header,
      directReportCount,
      roleLabel: "Manager",
      scopeLabel: includeIndirectReports
        ? `${scopeCount} team members (direct + indirect)`
        : `${directReportCount} direct reports`,
    };

    return {
      ok: true,
      value: {
        ...employeeResult.value,
        approvalQueue: approvalItemsResult.ok
          ? readySection(buildApprovalQueueCard(approvalItemsResult.value))
          : errorSection(approvalItemsResult.error.message),
        header,
        teamThisWeek:
          weekCalendarResult.ok && peopleResult.ok
            ? readySection(buildTeamThisWeekCard(weekCalendarResult.value))
            : errorSection(firstErrorMessage(weekCalendarResult, peopleResult)),
        teamToday: peopleResult.ok
          ? readySection(buildTeamTodayCard(peopleResult.value.people))
          : errorSection(peopleResult.error.message),
        teamXeroSyncFailed: approvalItemsResult.ok
          ? readySection(buildTeamXeroSyncFailedCard(approvalItemsResult.value))
          : errorSection(approvalItemsResult.error.message),
        upcomingPeaks: monthCalendarResult.ok
          ? readySection(buildUpcomingPeaksCard(monthCalendarResult.value))
          : errorSection(monthCalendarResult.error.message),
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
    const adminRole = parsed.data.actingRole === "owner" ? "owner" : "admin";
    const [
      employeeResult,
      organisation,
      peopleCountResult,
      syncHealthResult,
      approvalsResult,
      feedsResult,
      billingResult,
      auditResult,
    ] = await Promise.all([
      getEmployeeView(parsed.data, cache),
      database.organisation.findFirst({
        where: {
          clerk_org_id: parsed.data.clerkOrgId,
          id: parsed.data.organisationId,
        },
        select: { name: true },
      }),
      listPeople({
        actingPersonId: parsed.data.personId,
        clerkOrgId: parsed.data.clerkOrgId,
        filters: {
          includeArchived: false,
          personType: "all",
          xeroLinked: "all",
          xeroSyncFailedOnly: false,
        },
        organisationId: parsed.data.organisationId,
        pagination: { pageSize: 1 },
        role: adminRole,
      }),
      loadSyncHealthCard({
        actingRole: adminRole,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
        userId: parsed.data.userId,
      }),
      listForApprover({
        actingPersonId: parsed.data.personId,
        actingUserId: parsed.data.userId,
        clerkOrgId: parsed.data.clerkOrgId,
        filters: { status: ["submitted", "xero_sync_failed"] },
        organisationId: parsed.data.organisationId,
        role: approvalRole(adminRole),
      }),
      getFeedSummaryForDashboard({
        actingRole: adminRole,
        actingUserId: parsed.data.userId,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      }),
      getBillingSummaryForDashboard({
        actingRole: adminRole,
        actingUserId: parsed.data.userId,
        clerkOrgId: parsed.data.clerkOrgId,
        organisationId: parsed.data.organisationId,
      }),
      listAuditLogEvents({
        actingRole: adminRole,
        actingUserId: parsed.data.userId,
        clerkOrgId: parsed.data.clerkOrgId,
        filters: { action: AUDIT_EVENT_ALLOWLIST },
        organisationId: parsed.data.organisationId,
        pagination: { pageSize: 10 },
      }),
    ]);

    if (!employeeResult.ok) {
      return employeeResult;
    }

    const header: AdminDashboardView["header"] = {
      ...employeeResult.value.header,
      organisationName: organisation?.name ?? "Organisation",
      roleLabel: adminRole === "owner" ? "Owner" : "Admin",
      totalActivePeopleCount: peopleCountResult.ok
        ? peopleCountResult.value.totalCount
        : 0,
    };

    return {
      ok: true,
      value: {
        ...employeeResult.value,
        activeFeeds: feedsResult.ok
          ? readySection({ ...feedsResult.value, ctaUrl: "/feed" })
          : errorSection(feedsResult.error.message),
        header,
        orgWidePendingApprovals: approvalsResult.ok
          ? readySection(buildOrgPendingApprovalsCard(approvalsResult.value))
          : errorSection(approvalsResult.error.message),
        orgWideXeroSyncFailed: approvalsResult.ok
          ? readySection(buildOrgWideXeroSyncFailedCard(approvalsResult.value))
          : errorSection(approvalsResult.error.message),
        recentAuditEvents: auditResult.ok
          ? readySection({
              ctaUrl: "/settings/audit-log",
              events: auditResult.value.events.map((event) => ({
                action: event.action,
                actorDisplay: event.actorDisplay,
                createdAt: event.createdAt,
                entityType: event.entityType,
                id: event.id,
              })),
            })
          : errorSection(auditResult.error.message),
        syncHealth: syncHealthResult.ok
          ? readySection(syncHealthResult.value)
          : errorSection(syncHealthResult.error.message),
        usageVsLimits: billingResult.ok
          ? readySection({
              ctaUrl: "/settings/billing",
              isOverLimit: billingResult.value.isOverLimit,
              metrics: billingResult.value.usage.map((item) => ({
                currentValue: item.currentValue,
                label: item.label,
                limit: item.limit,
                metricKey: item.metricKey,
                percentage:
                  item.limit === null || item.limit === 0
                    ? null
                    : Math.min((item.currentValue / item.limit) * 100, 100),
                unit: item.unit,
              })),
              plan: billingResult.value.plan,
              visibleToAdmin: billingResult.value.visibleToAdmin,
            })
          : errorSection(billingResult.error.message),
      },
    };
  } catch {
    return unknownError("Failed to build admin dashboard.");
  }
}

async function buildEmployeeView(
  input: z.infer<typeof ViewSchema>,
  cache: DashboardCache
): Promise<Result<EmployeeDashboardView, DashboardServiceError>> {
  try {
    const [profileResult, hasXero] = await Promise.all([
      getPersonProfile({
        actingPersonId: input.personId,
        actingUserId: input.userId,
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
        personId: input.personId,
        role: peopleRole(input.actingRole),
      }),
      hasActiveXeroConnection({
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
      }),
    ]);

    if (!profileResult.ok) {
      if (profileResult.error.code === "person_not_found") {
        return personNotFound();
      }
      return unknownError(profileResult.error.message);
    }

    const profile = profileResult.value;
    const [actionItems, upcoming, publicHolidays] = await Promise.all([
      cache.getOrLoad(
        cacheKey("action-items", input),
        async () => await loadActionItemsCard(input)
      ),
      cache.getOrLoad(
        cacheKey("upcoming", input),
        async () => await loadUpcomingCard(input)
      ),
      cache.getOrLoad(
        cacheKey("public-holidays", input),
        async () =>
          await loadPublicHolidayCard({
            clerkOrgId: input.clerkOrgId,
            locationId: profile.header.location?.id ?? null,
            organisationId: input.organisationId,
            personId: input.personId,
            teamId: profile.header.team?.id ?? null,
          })
      ),
    ]);

    const lastFetchedAt = profile.balances.balancesLastFetchedAt;

    return {
      ok: true,
      value: {
        actionItems,
        balances: readySection({
          hasActiveXeroConnection: hasXero,
          isXeroLinked: profile.balances.xeroLinked,
          lastFetchedAt,
          rows: profile.balances.rows,
        }),
        header: {
          firstName: profile.header.firstName,
          hasActiveXeroConnection: hasXero,
          lastName: profile.header.lastName,
          locationName: profile.header.location?.name ?? null,
          roleLabel: "Employee",
          timezone: profile.header.location?.timezone ?? null,
        },
        publicHolidays,
        quickActions: {
          canCreatePlan: true,
          canViewCalendar: true,
          canViewNotifications: true,
        },
        todayStatus: readySection({
          activePublicHoliday: profile.currentStatus.activePublicHoliday,
          activeRecord: profile.currentStatus.activeRecord,
          currentStatus: {
            approvalStatus: profile.currentStatus.approvalStatus,
            contactabilityStatus: profile.currentStatus.contactabilityStatus,
            label: profile.currentStatus.label,
            recordType: profile.currentStatus.recordType,
            statusKey: profile.currentStatus.statusKey,
          },
        }),
        upcoming,
      },
    };
  } catch {
    return unknownError("Failed to build employee dashboard.");
  }
}

async function loadActionItemsCard(
  input: z.infer<typeof ViewSchema>
): Promise<EmployeeDashboardView["actionItems"]> {
  const [failedRecordsResult, declinedRecordsResult, notificationsResult] =
    await Promise.all([
      listMyRecords({
        clerkOrgId: input.clerkOrgId,
        filters: {
          approvalStatus: ["xero_sync_failed"],
          includeArchived: false,
        },
        organisationId: input.organisationId,
        userId: input.userId,
      }),
      listMyRecords({
        clerkOrgId: input.clerkOrgId,
        filters: {
          approvalStatus: ["declined"],
          dateRange: { from: addDays(new Date(), -14) },
          includeArchived: false,
        },
        organisationId: input.organisationId,
        userId: input.userId,
      }),
      listForUser({
        clerkOrgId: input.clerkOrgId,
        filters: {
          type: ["leave_info_requested"],
          unreadOnly: true,
        },
        organisationId: input.organisationId,
        pagination: { pageSize: 5 },
        userId: input.userId,
      }),
    ]);

  if (
    !(
      failedRecordsResult.ok &&
      declinedRecordsResult.ok &&
      notificationsResult.ok
    )
  ) {
    return errorSection(
      firstErrorMessage(
        failedRecordsResult,
        declinedRecordsResult,
        notificationsResult
      )
    );
  }

  return readySection({
    declinedRecords: declinedRecordsResult.value
      .filter(
        (record) =>
          record.approvedAt === null ||
          record.approvedAt >= addDays(new Date(), -14)
      )
      .map((record) => ({
        approvalNote: record.approvalNote,
        declinedAt: record.approvedAt,
        endsAt: record.endsAt,
        recordId: record.id,
        recordType: record.recordType,
        startsAt: record.startsAt,
      })),
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
    xeroSyncFailedRecords: failedRecordsResult.value.map((record) => ({
      endsAt: record.endsAt,
      failedAction: record.failedAction,
      recordId: record.id,
      recordType: record.recordType,
      startsAt: record.startsAt,
      xeroWriteError: record.xeroWriteError,
    })),
  });
}

async function loadUpcomingCard(
  input: z.infer<typeof ViewSchema>
): Promise<EmployeeDashboardView["upcoming"]> {
  const today = startOfDay(new Date());
  const horizon = addDays(today, 14);
  const [localRecordsResult, profileUpcomingResult] = await Promise.all([
    listMyRecords({
      clerkOrgId: input.clerkOrgId,
      filters: {
        approvalStatus: ["approved", "draft", "submitted", "xero_sync_failed"],
        dateRange: { from: today, to: horizon },
        includeArchived: false,
      },
      organisationId: input.organisationId,
      userId: input.userId,
    }),
    listUpcomingRecords({
      clerkOrgId: input.clerkOrgId,
      horizonDays: 14,
      organisationId: input.organisationId,
      personId: input.personId,
    }),
  ]);

  if (!(localRecordsResult.ok && profileUpcomingResult.ok)) {
    return errorSection(
      firstErrorMessage(localRecordsResult, profileUpcomingResult)
    );
  }

  const upcoming = new Map<
    string,
    {
      allDay: boolean;
      approvalStatus: availability_approval_status;
      endsAt: Date;
      recordId: string;
      recordType: availability_record_type;
      startsAt: Date;
    }
  >();

  for (const record of localRecordsResult.value) {
    upcoming.set(record.id, {
      allDay: record.allDay,
      approvalStatus: record.approvalStatus,
      endsAt: record.endsAt,
      recordId: record.id,
      recordType: record.recordType,
      startsAt: record.startsAt,
    });
  }

  for (const record of profileUpcomingResult.value.records) {
    if (
      !(
        record.sourceType === "xero_leave" &&
        record.approvalStatus === "approved"
      )
    ) {
      continue;
    }
    upcoming.set(record.id, {
      allDay: record.allDay,
      approvalStatus: record.approvalStatus,
      endsAt: record.endsAt,
      recordId: record.id,
      recordType: record.recordType,
      startsAt: record.startsAt,
    });
  }

  return readySection({
    next14Days: [...upcoming.values()].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime()
    ),
  });
}

async function loadPublicHolidayCard(input: {
  clerkOrgId: string;
  locationId: string | null;
  organisationId: string;
  personId: string;
  teamId: string | null;
}): Promise<EmployeeDashboardView["publicHolidays"]> {
  const holidayResult = await listForOrganisation(
    input.clerkOrgId as ClerkOrgId,
    input.organisationId as OrganisationId
  );
  if (!holidayResult.ok) {
    return errorSection(holidayResult.error.message);
  }

  const today = startOfDay(new Date());
  const next =
    holidayResult.value.find((holiday) => {
      if (holiday.archived_at) {
        return false;
      }
      if (startOfDay(holiday.holiday_date) < today) {
        return false;
      }
      return holidayAppliesToActor(holiday, input);
    }) ?? null;

  return readySection({
    daysUntil: next ? dayDiff(startOfDay(next.holiday_date), today) : null,
    next,
  });
}

async function loadSyncHealthCard(input: {
  actingRole: "admin" | "owner";
  clerkOrgId: string;
  organisationId: string;
  userId: string;
}): Promise<Result<SyncHealthCardData, DashboardServiceError>> {
  const since = addDays(new Date(), -1);
  const [summaryResult, runsResult, hasXero] = await Promise.all([
    listTenantSummaries({
      actingRole: input.actingRole,
      actingUserId: input.userId,
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    }),
    listRuns({
      actingRole: input.actingRole,
      actingUserId: input.userId,
      clerkOrgId: input.clerkOrgId,
      filters: {
        dateFrom: since,
        dateTo: new Date(),
      },
      organisationId: input.organisationId,
      pagination: { pageSize: 200 },
    }),
    hasActiveXeroConnection({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    }),
  ]);

  if (!(summaryResult.ok && runsResult.ok)) {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: firstErrorMessage(summaryResult, runsResult),
      },
    };
  }

  const lastSuccessfulSync =
    summaryResult.value
      .flatMap((summary) => [
        summary.lastApprovalReconciliation,
        summary.lastLeaveBalancesSync,
        summary.lastLeaveRecordsSync,
        summary.lastPeopleSync,
      ])
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  return {
    ok: true,
    value: {
      activeTenantCount: summaryResult.value.filter(
        (summary) => summary.connectionStatus === "active"
      ).length,
      ctaUrl: "/sync",
      failedRunsLast24h: runsResult.value.runs.filter(
        (run) => run.status === "failed" || run.status === "partial_success"
      ).length,
      hasActiveXeroConnection: hasXero,
      lastSuccessfulSync,
      pendingFailedRecords: summaryResult.value.reduce(
        (total, summary) => total + summary.pendingFailedRecords,
        0
      ),
      runsLast24h: runsResult.value.runs.length,
      tenantCount: summaryResult.value.length,
    },
  };
}

async function listAllPeople(input: {
  actingPersonId: string;
  clerkOrgId: string;
  organisationId: string;
  role: "admin" | "manager";
}) {
  const collected: PersonListItem[] = [];
  let cursor: string | null = null;
  let totalCount = 0;

  while (true) {
    const result = await listPeople({
      actingPersonId: input.actingPersonId,
      clerkOrgId: input.clerkOrgId,
      filters: {
        includeArchived: false,
        personType: "all",
        xeroLinked: "all",
        xeroSyncFailedOnly: false,
      },
      organisationId: input.organisationId,
      pagination: {
        cursor,
        pageSize: 200,
      },
      role: input.role,
    });
    if (!result.ok) {
      return result;
    }

    totalCount = result.value.totalCount;
    collected.push(...result.value.people);
    if (!result.value.nextCursor) {
      break;
    }
    cursor = result.value.nextCursor;
  }

  return {
    ok: true as const,
    value: {
      nextCursor: null,
      people: collected,
      totalCount,
    },
  };
}

function buildApprovalQueueCard(records: ApprovalListItem[]) {
  return {
    ctaUrl: "/leave-approvals?status=submitted",
    failedCount: records.filter(
      (record) =>
        record.approvalStatus === "xero_sync_failed" &&
        (record.failedAction === "approve" || record.failedAction === "decline")
    ).length,
    mostRecent: records
      .filter((record) => record.approvalStatus === "submitted")
      .sort(byDateDescending((record) => record.submittedAt))
      .slice(0, 3)
      .map((record) => ({
        endsAt: record.endsAt,
        personFirstName: record.person.firstName,
        personLastName: record.person.lastName,
        recordId: record.id,
        recordType: record.recordType,
        startsAt: record.startsAt,
        submittedAt: record.submittedAt,
      })),
    pendingCount: records.filter(
      (record) => record.approvalStatus === "submitted"
    ).length,
  };
}

function buildTeamTodayCard(people: PersonListItem[]) {
  let peopleOnLeaveCount = 0;
  let peopleWorkingFromHomeCount = 0;
  let peopleTravellingCount = 0;
  let peopleOtherOooCount = 0;
  let peopleAvailableCount = 0;
  let peopleWithXeroSyncFailedCount = 0;
  const peopleNeedingAttention: Array<{
    approvalStatus: availability_approval_status | null;
    contactabilityStatus: availability_contactability | null;
    endsAt: Date | null;
    personFirstName: string;
    personId: string;
    personLastName: string;
    recordType: availability_record_type | null;
    startsAt: Date | null;
    statusKey: PersonListItem["currentStatus"]["statusKey"];
    statusLabel: string;
    xeroSyncFailedCount: number;
  }> = [];

  for (const person of people) {
    if (person.xeroSyncFailedCount > 0) {
      peopleWithXeroSyncFailedCount += 1;
    }
    switch (person.currentStatus.statusKey) {
      case "available":
        peopleAvailableCount += 1;
        break;
      case "on_leave":
        peopleOnLeaveCount += 1;
        break;
      case "travelling":
        peopleTravellingCount += 1;
        break;
      case "wfh":
        peopleWorkingFromHomeCount += 1;
        break;
      default:
        peopleOtherOooCount += 1;
        break;
    }

    if (
      person.currentStatus.statusKey !== "available" ||
      person.xeroSyncFailedCount > 0
    ) {
      peopleNeedingAttention.push({
        approvalStatus: person.currentStatus.approvalStatus,
        contactabilityStatus: person.currentStatus.contactabilityStatus,
        endsAt:
          person.currentStatus.activeRecord?.endsAt ??
          person.currentStatus.activePublicHoliday?.date ??
          null,
        personFirstName: person.firstName,
        personId: person.id,
        personLastName: person.lastName,
        recordType: person.currentStatus.recordType,
        startsAt:
          person.currentStatus.activeRecord?.startsAt ??
          person.currentStatus.activePublicHoliday?.date ??
          null,
        statusKey: person.currentStatus.statusKey,
        statusLabel:
          person.xeroSyncFailedCount > 0
            ? "Xero sync failed"
            : person.currentStatus.label,
        xeroSyncFailedCount: person.xeroSyncFailedCount,
      });
    }
  }

  return {
    ctaUrl: "/people",
    peopleAvailableCount,
    peopleNeedingAttention: peopleNeedingAttention
      .sort(
        (first, second) =>
          teamTodaySortWeight(first) - teamTodaySortWeight(second)
      )
      .slice(0, 8),
    peopleOnLeaveCount,
    peopleOtherOooCount,
    peopleTravellingCount,
    peopleWithXeroSyncFailedCount,
    peopleWorkingFromHomeCount,
  };
}

function teamTodaySortWeight(person: {
  statusKey: PersonListItem["currentStatus"]["statusKey"];
  xeroSyncFailedCount: number;
}) {
  if (person.xeroSyncFailedCount > 0) {
    return 0;
  }
  if (person.statusKey === "on_leave" || person.statusKey === "pending_leave") {
    return 1;
  }
  if (person.statusKey === "wfh" || person.statusKey === "travelling") {
    return 2;
  }
  return 3;
}

function buildTeamThisWeekCard(input: CalendarRangeData) {
  const peopleWithLeave = new Set<string>();
  const upcomingRecords = new Map<
    string,
    {
      endsAt: Date;
      personFirstName: string;
      personLastName: string;
      recordId: string;
      recordType: availability_record_type;
      startsAt: Date;
    }
  >();
  const peopleById = new Map(
    input.people.map((person) => [
      person.id,
      { firstName: person.firstName, lastName: person.lastName },
    ])
  );
  const rangeStart = input.range.start;
  const rangeEnd = input.range.end;

  for (const day of input.days) {
    for (const event of day.events) {
      if (
        !(
          event.approvalStatus === "approved" &&
          event.recordType !== "private" &&
          isXeroLeaveType(event.recordType)
        )
      ) {
        continue;
      }
      peopleWithLeave.add(event.personId);
      if (event.startsAt >= rangeStart && event.startsAt <= rangeEnd) {
        const person = peopleById.get(event.personId);
        if (!person) {
          continue;
        }
        upcomingRecords.set(event.id, {
          endsAt: event.endsAt,
          personFirstName: person.firstName,
          personLastName: person.lastName,
          recordId: event.id,
          recordType: event.recordType,
          startsAt: event.startsAt,
        });
      }
    }
  }

  return {
    ctaUrl: "/calendar?scopeType=my_team&view=week",
    peopleWithLeaveCount: peopleWithLeave.size,
    upcomingRecords: [...upcomingRecords.values()]
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
      .slice(0, 10),
  };
}

function buildUpcomingPeaksCard(input: CalendarRangeData) {
  const peaks: Array<{
    date: Date;
    peopleAwayCount: number;
    percentage: number;
    recordTypes: availability_record_type[];
    totalPeopleInScope: number;
  }> = [];

  for (const day of input.days) {
    const awayEvents = dedupeEventsByPerson(
      day.events.filter((event) => isAwayEvent(event))
    );
    if (input.totalPeopleInScope === 0) {
      continue;
    }
    const percentage = (awayEvents.length / input.totalPeopleInScope) * 100;
    if (percentage <= 20) {
      continue;
    }
    peaks.push({
      date: day.date,
      peopleAwayCount: awayEvents.length,
      percentage,
      recordTypes: uniqueRecordTypes(awayEvents),
      totalPeopleInScope: input.totalPeopleInScope,
    });
  }

  return {
    ctaUrl: "/calendar?scopeType=my_team&view=month",
    peaks,
    totalPeaksCount: peaks.length,
  };
}

function buildTeamXeroSyncFailedCard(records: ApprovalListItem[]) {
  const failed = records.filter(
    (record) => record.approvalStatus === "xero_sync_failed"
  );

  return {
    count: failed.length,
    ctaUrl: "/people?xeroSyncFailedOnly=true",
    recentRecords: failed
      .sort(byDateDescending((record) => record.createdAt))
      .slice(0, 5)
      .map((record) => ({
        failedAction: record.failedAction,
        personFirstName: record.person.firstName,
        personLastName: record.person.lastName,
        recordId: record.id,
        recordType: record.recordType,
        xeroWriteError: record.xeroWriteError,
      })),
  };
}

function buildOrgPendingApprovalsCard(records: ApprovalListItem[]) {
  const submitted = records.filter(
    (record) => record.approvalStatus === "submitted"
  );
  const oldestSubmittedAt =
    submitted
      .map((record) => record.submittedAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;

  return {
    count: submitted.length,
    ctaUrl: "/leave-approvals?status=submitted",
    oldestAgeDays: oldestSubmittedAt
      ? dayDiff(startOfDay(new Date()), startOfDay(oldestSubmittedAt))
      : null,
  };
}

function buildOrgWideXeroSyncFailedCard(records: ApprovalListItem[]) {
  const failed = records.filter(
    (record) => record.approvalStatus === "xero_sync_failed"
  );
  return {
    byFailedAction: {
      approve: failed.filter((record) => record.failedAction === "approve")
        .length,
      decline: failed.filter((record) => record.failedAction === "decline")
        .length,
      submit: failed.filter((record) => record.failedAction === "submit")
        .length,
      withdraw: failed.filter((record) => record.failedAction === "withdraw")
        .length,
    },
    count: failed.length,
    ctaUrl: "/people?xeroSyncFailedOnly=true",
  };
}

function holidayAppliesToActor(
  holiday: HolidayRow,
  input: {
    locationId: string | null;
    personId: string;
    teamId: string | null;
  }
) {
  const activeAssignments = holiday.assignments.filter(
    (assignment) => assignment.archived_at === null
  );
  if (activeAssignments.length === 0) {
    return true;
  }

  const matchingAssignments = activeAssignments.filter(
    (assignment) =>
      assignment.scope_type === "organisation" ||
      (assignment.scope_type === "location" &&
        input.locationId !== null &&
        assignment.scope_value === input.locationId) ||
      (assignment.scope_type === "person" &&
        assignment.scope_value === input.personId) ||
      (assignment.scope_type === "team" &&
        input.teamId !== null &&
        assignment.scope_value === input.teamId)
  );

  if (matchingAssignments.length === 0) {
    return false;
  }

  return matchingAssignments.some(
    (assignment) => assignment.day_classification === "non_working"
  );
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
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid dashboard input.",
    },
  };
}

function personNotFound(): Result<never, DashboardServiceError> {
  return {
    ok: false,
    error: {
      code: "person_not_found",
      message: "Person not found for this dashboard view.",
    },
  };
}

function unknownError(message: string): Result<never, DashboardServiceError> {
  return { ok: false, error: { code: "unknown_error", message } };
}

function cacheKey(scope: string, input: z.infer<typeof ViewSchema>) {
  return `${scope}:${input.clerkOrgId}:${input.organisationId}:${input.personId}:${input.userId}:${input.actingRole}`;
}

function firstErrorMessage(
  ...results: Array<{ error: { message: string }; ok: false } | { ok: true }>
) {
  return (
    results.find((result) => !result.ok)?.error.message ??
    "Unable to load this dashboard section."
  );
}

function byDateDescending<TValue>(selector: (value: TValue) => Date | null) {
  return (left: TValue, right: TValue) =>
    (selector(right)?.getTime() ?? 0) - (selector(left)?.getTime() ?? 0);
}

function dedupeEventsByPerson(events: CalendarEvent[]) {
  const byPerson = new Map<string, CalendarEvent>();
  for (const event of events) {
    if (!byPerson.has(event.personId)) {
      byPerson.set(event.personId, event);
    }
  }
  return [...byPerson.values()];
}

function uniqueRecordTypes(events: CalendarEvent[]) {
  return [...new Set(events.map((event) => event.recordType))].filter(
    (recordType): recordType is availability_record_type =>
      recordType !== "private"
  );
}

function isAwayEvent(event: CalendarEvent) {
  return (
    event.approvalStatus === "approved" &&
    event.recordType !== "private" &&
    event.recordType !== "wfh" &&
    event.recordType !== "alternative_contact" &&
    event.recordType !== "limited_availability"
  );
}
