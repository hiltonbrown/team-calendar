import type {
  EmployeeDashboardView,
  ManagerDashboardView,
} from "@repo/availability";
import { describe, expect, it } from "vitest";
import {
  AMBIENT_CALENDAR_DAY_COUNT,
  buildAmbientCalendarModel,
  buildManagerCalendarTimeline,
  buildPersonalCalendarTimeline,
} from "./ambient-calendar-data";

const NOW = new Date("2026-08-29T15:30:00.000Z");
const TIMEZONE = "Australia/Brisbane";

function makeEmployeeView(
  overrides: Partial<EmployeeDashboardView> = {}
): EmployeeDashboardView {
  return {
    actionItems: {
      data: {
        declinedRecords: [],
        infoRequestedNotifications: [],
        xeroSyncFailedRecords: [],
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
      firstName: "Ari",
      lastName: "Chen",
      locationName: "Brisbane",
      roleLabel: "Employee",
      timezone: TIMEZONE,
      xeroConnectionState: "connected",
    },
    publicHolidays: {
      data: { daysUntil: null, next: null },
      status: "ready",
    },
    quickActions: {
      canCreatePlan: true,
      canViewCalendar: true,
      canViewNotifications: true,
    },
    todayStatus: {
      data: {
        activePublicHoliday: null,
        activeRecord: null,
        currentStatus: {
          approvalStatus: null,
          contactabilityStatus: null,
          label: "Available",
          recordType: null,
          statusKey: "available",
        },
      },
      status: "ready",
    },
    upcoming: { data: { next14Days: [] }, status: "ready" },
    ...overrides,
  };
}

function makeManagerView(
  overrides: Partial<ManagerDashboardView> = {}
): ManagerDashboardView {
  return {
    ...makeEmployeeView(),
    approvalQueue: {
      data: {
        ctaUrl: "/leave-approvals",
        failedCount: 0,
        mostRecent: [],
        pendingCount: 0,
      },
      status: "ready",
    },
    header: {
      directReportCount: 5,
      firstName: "Ari",
      lastName: "Chen",
      locationName: "Brisbane",
      roleLabel: "Manager",
      scopeLabel: "5 direct reports",
      timezone: TIMEZONE,
      xeroConnectionState: "connected",
    },
    teamThisWeek: {
      data: {
        ctaUrl: "/calendar",
        peopleWithLeaveCount: 0,
        upcomingRecords: [],
      },
      status: "ready",
    },
    teamToday: {
      data: {
        ctaUrl: "/people",
        peopleAvailableCount: 5,
        peopleNeedingAttention: [],
        peopleOnLeaveCount: 0,
        peopleOtherOooCount: 0,
        peopleTravellingCount: 0,
        peopleWithXeroSyncFailedCount: 0,
        peopleWorkingFromHomeCount: 0,
      },
      status: "ready",
    },
    teamXeroSyncFailed: {
      data: { count: 0, ctaUrl: "/people", recentRecords: [] },
      status: "ready",
    },
    upcomingPeaks: {
      data: { ctaUrl: "/calendar", peaks: [], totalPeaksCount: 0 },
      status: "ready",
    },
    ...overrides,
  };
}

describe("buildAmbientCalendarModel", () => {
  it("builds fourteen deterministic date keys in the requested timezone", () => {
    const model = buildPersonalCalendarTimeline(makeEmployeeView(), {
      now: NOW,
      timezone: TIMEZONE,
    });

    expect(model.dayCount).toBe(AMBIENT_CALENDAR_DAY_COUNT);
    expect(model.days).toHaveLength(14);
    expect(model.startDateKey).toBe("2026-08-30");
    expect(model.days[13]?.dateKey).toBe("2026-09-12");
    expect(model.timezone).toBe(TIMEZONE);
    expect(model).toMatchObject({
      description: "Your leave and availability records for the next 14 days.",
      href: "/calendar?scopeType=my_self",
      title: "Your next 14 days",
    });
    expect(model.days[0]).toMatchObject({
      accessibleLabel: "Sun, 30 Aug: No personal records scheduled",
      detailLabel: "No personal records scheduled",
      label: "Sun, 30 Aug",
      tone: "neutral",
    });
  });

  it("projects personal records across their inclusive date range", () => {
    const view = makeEmployeeView({
      upcoming: {
        data: {
          next14Days: [
            {
              allDay: true,
              approvalStatus: "approved",
              endsAt: new Date("2026-09-02T13:59:59.999Z"),
              recordId: "record-1",
              recordType: "annual_leave",
              startsAt: new Date("2026-08-31T14:00:00.000Z"),
            },
          ],
        },
        status: "ready",
      },
    });

    const model = buildAmbientCalendarModel(
      { mode: "personal", view },
      { now: NOW, timezone: TIMEZONE }
    );

    expect(model.days[2]?.signals).toHaveLength(1);
    expect(model.days[3]?.signals).toHaveLength(1);
    expect(model.days[4]?.signals).toHaveLength(0);
    expect(model.days[3]?.confidence).toBe("personal");
  });

  it("adds provenance only when today status supplies source type", () => {
    const view = makeEmployeeView({
      todayStatus: {
        data: {
          activePublicHoliday: null,
          activeRecord: {
            approvalStatus: "approved",
            endsAt: new Date("2026-08-30T13:59:59.999Z"),
            id: "today-record",
            recordType: "wfh",
            sourceType: "manual",
            startsAt: new Date("2026-08-29T14:00:00.000Z"),
            title: "Home office",
          },
          currentStatus: {
            approvalStatus: "approved",
            contactabilityStatus: "fully_contactable",
            label: "Working from home",
            recordType: "wfh",
            statusKey: "wfh",
          },
        },
        status: "ready",
      },
      upcoming: {
        data: {
          next14Days: [
            {
              allDay: true,
              approvalStatus: "submitted",
              endsAt: new Date("2026-09-01T13:59:59.999Z"),
              recordId: "upcoming-record",
              recordType: "annual_leave",
              startsAt: new Date("2026-08-31T14:00:00.000Z"),
            },
          ],
        },
        status: "ready",
      },
    });

    const model = buildAmbientCalendarModel(
      { mode: "personal", view },
      { now: NOW, timezone: TIMEZONE }
    );
    const todaySignal = model.days[0]?.signals[0];
    const upcomingSignal = model.days[2]?.signals[0];

    expect(todaySignal).toMatchObject({
      kind: "personal-record",
      provenance: "manual",
    });
    expect(upcomingSignal).toMatchObject({ kind: "personal-record" });
    expect(upcomingSignal && "provenance" in upcomingSignal).toBe(false);
  });

  it("marks manager today exact and leaves non-peak future days unknown", () => {
    const view = makeManagerView({
      teamToday: {
        data: {
          ctaUrl: "/people",
          peopleAvailableCount: 6,
          peopleNeedingAttention: [],
          peopleOnLeaveCount: 2,
          peopleOtherOooCount: 0,
          peopleTravellingCount: 1,
          peopleWithXeroSyncFailedCount: 0,
          peopleWorkingFromHomeCount: 1,
        },
        status: "ready",
      },
    });

    const model = buildManagerCalendarTimeline(view, {
      now: NOW,
      timezone: TIMEZONE,
    });

    expect(model.days[0]).toMatchObject({
      confidence: "exact",
      coverage: { awayCount: 4, ratio: 0.4, totalCount: 10 },
    });
    expect(model.days[1]).toMatchObject({
      confidence: "unknown",
      coverage: null,
      detailLabel: "No coverage peak is flagged for this day",
    });
  });

  it("projects today's public holiday as a labelled warning signal", () => {
    const view = makeEmployeeView({
      todayStatus: {
        data: {
          activePublicHoliday: {
            date: new Date("2026-08-30T00:00:00.000Z"),
            id: "holiday-1",
            name: "Brisbane Show Day",
            source: "manual",
            type: "regional",
          },
          activeRecord: null,
          currentStatus: {
            approvalStatus: null,
            contactabilityStatus: null,
            label: "Public holiday",
            recordType: null,
            statusKey: "public_holiday",
          },
        },
        status: "ready",
      },
    });

    const model = buildPersonalCalendarTimeline(view, {
      now: NOW,
      timezone: TIMEZONE,
    });

    expect(model.days[0]).toMatchObject({
      detailLabel: "Public holiday: Brisbane Show Day",
      tone: "warning",
    });
  });

  it("does not present failed personal schedule data as clear", () => {
    const view = makeEmployeeView({
      upcoming: {
        message: "Could not load the schedule.",
        status: "error",
      },
    });

    const model = buildPersonalCalendarTimeline(view, {
      now: NOW,
      timezone: TIMEZONE,
    });

    expect(model.days[1]).toMatchObject({
      confidence: "unknown",
      detailLabel: "Schedule data is unavailable for this day",
    });
  });

  it("marks future peak coverage as threshold-only", () => {
    const view = makeManagerView({
      upcomingPeaks: {
        data: {
          ctaUrl: "/calendar",
          peaks: [
            {
              date: new Date("2026-09-01T00:00:00.000Z"),
              peopleAwayCount: 6,
              percentage: 60,
              recordTypes: ["annual_leave"],
              totalPeopleInScope: 10,
            },
          ],
          totalPeaksCount: 1,
        },
        status: "ready",
      },
    });

    const model = buildAmbientCalendarModel(
      { mode: "team", view },
      { now: NOW, timezone: TIMEZONE }
    );
    const peakDay = model.days.find((day) => day.dateKey === "2026-09-01");

    expect(peakDay).toMatchObject({
      confidence: "threshold-only",
      coverage: { awayCount: 6, ratio: 0.6, totalCount: 10 },
    });
  });

  it("marks named team records without claiming non-peak availability or provenance", () => {
    const view = makeManagerView({
      teamThisWeek: {
        data: {
          ctaUrl: "/calendar",
          peopleWithLeaveCount: 1,
          upcomingRecords: [
            {
              endsAt: new Date("2026-09-01T13:59:59.999Z"),
              personFirstName: "Sam",
              personLastName: "Rivera",
              recordId: "team-record-1",
              recordType: "annual_leave",
              startsAt: new Date("2026-08-31T14:00:00.000Z"),
            },
          ],
        },
        status: "ready",
      },
    });

    const model = buildAmbientCalendarModel(
      { mode: "team", view },
      { now: NOW, timezone: TIMEZONE }
    );
    const markedDay = model.days.find((day) => day.dateKey === "2026-09-01");
    const signal = markedDay?.signals[0];

    expect(markedDay?.confidence).toBe("unknown");
    expect(signal).toMatchObject({
      kind: "team-record",
      personName: "Sam Rivera",
    });
    expect(signal && "provenance" in signal).toBe(false);
  });

  it("returns a JSON-serialisable renderer model", () => {
    const model = buildAmbientCalendarModel(
      { mode: "team", view: makeManagerView() },
      { now: NOW, timezone: TIMEZONE }
    );

    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });
});
