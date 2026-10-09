import type {
  AdminDashboardView,
  EmployeeDashboardView,
  ManagerDashboardView,
  TimelineWeek,
} from "@repo/availability";
import { addDaysToDateKey } from "@repo/core";
import { screen } from "@testing-library/react";

/** Test builders for role dashboard views. */
export const FIXTURE_NOW = new Date("2026-10-09T02:00:00.000Z");

export function buildTimelineWeek(): TimelineWeek {
  return {
    days: Array.from({ length: 7 }, (_, index) => {
      const dateKey = addDaysToDateKey("2026-10-05", index);
      return {
        date: new Date(`${dateKey}T00:00:00.000Z`),
        dateKey,
        holidayName: null,
        isToday: dateKey === "2026-10-09",
      };
    }),
    isCurrentWeek: true,
    nextWeekStart: "2026-10-12",
    previousWeekStart: "2026-09-28",
    rows: [
      {
        entries: [],
        firstName: "Ava",
        isSelf: true,
        jobTitle: "Support lead",
        lastName: "Nguyen",
        locationName: "Brisbane",
        personId: "person_1",
        teamName: "Operations",
      },
    ],
    timezone: "Australia/Brisbane",
    totalPeopleInScope: 1,
    weekStart: "2026-10-05",
  };
}

export function buildEmployeeView(
  overrides: Partial<EmployeeDashboardView> = {}
): EmployeeDashboardView {
  return {
    actionItems: {
      data: {
        infoRequestedNotifications: [
          {
            actionUrl: null,
            body: "Please add more detail",
            createdAt: new Date("2026-10-08T09:00:00.000Z"),
            notificationId: "notification_1",
            title: "More information requested",
            type: "leave_info_requested",
          },
        ],
      },
      status: "ready",
    },
    balances: {
      data: {
        isXeroLinked: true,
        lastFetchedAt: null,
        rows: [],
        xeroConnectionState: "connected",
      },
      status: "ready",
    },
    header: {
      firstName: "Ava",
      lastName: "Nguyen",
      locationName: "Brisbane",
      roleLabel: "Employee",
      timezone: "Australia/Brisbane",
    },
    myRequests: {
      data: {
        records: [
          {
            allDay: true,
            approvalStatus: "submitted",
            canEdit: false,
            canWithdraw: true,
            dayCount: 2,
            endsAt: new Date("2026-10-13T23:59:59.999Z"),
            recordId: "record_1",
            recordType: "annual_leave",
            sourceType: "team_calendar_leave",
            startsAt: new Date("2026-10-12T00:00:00.000Z"),
          },
        ],
      },
      status: "ready",
    },
    publicHolidays: { data: { daysUntil: null, next: null }, status: "ready" },
    timeline: { data: buildTimelineWeek(), status: "ready" },
    ...overrides,
  };
}

function approvalQueue(count: number): ManagerDashboardView["approvalQueue"] {
  return {
    data: {
      count,
      rows: Array.from({ length: Math.min(count, 5) }, (_, index) => ({
        allDay: true,
        durationWorkingDays: 2,
        endsAt: new Date("2026-10-20T23:59:59.999Z"),
        personFirstName: "Luca",
        personLastName: `Brown${index}`,
        recordId: `approval_${index}`,
        recordType: "annual_leave",
        sourceType: "team_calendar_leave",
        startsAt: new Date("2026-10-19T00:00:00.000Z"),
        submittedAt: new Date("2026-10-06T00:00:00.000Z"),
      })),
    },
    status: "ready",
  };
}

export function buildManagerView(
  input: { pendingCount?: number } = {}
): ManagerDashboardView {
  const { myRequests: _myRequests, ...base } = buildEmployeeView();
  return {
    ...base,
    approvalQueue: approvalQueue(input.pendingCount ?? 4),
    coverage: {
      data: { days: [], firstIssue: null, rows: [] },
      status: "ready",
    },
    header: {
      ...base.header,
      directReportCount: 6,
      roleLabel: "Manager",
      scopeLabel: "6 direct reports",
    },
  };
}

export function buildAdminView(
  input: { pendingCount?: number } = {}
): AdminDashboardView {
  const { myRequests: _myRequests, ...base } = buildEmployeeView();
  return {
    ...base,
    approvalQueue: approvalQueue(input.pendingCount ?? 4),
    header: {
      ...base.header,
      organisationName: "Acme Org",
      roleLabel: "Admin",
      totalActivePeopleCount: 48,
    },
  };
}

/** Section and card titles in document order. */
export function sectionHeadings(): Array<string | null> {
  return screen
    .getAllByText(
      (_, element) =>
        element?.getAttribute("data-slot") === "card-title" ||
        element?.tagName === "H2"
    )
    .map((element) => element.textContent);
}
