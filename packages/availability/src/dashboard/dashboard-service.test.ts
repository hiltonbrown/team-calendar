import { addDaysToDateKey, zonedStartOfDay } from "@repo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CalendarDay,
  CalendarEvent,
  CalendarPerson,
  CalendarRange,
} from "../calendar/calendar-service";
import type { CoverageMap } from "../team-coverage/coverage-map";

const mocks = vi.hoisted(() => ({
  computeWorkingDaysFromReferenceData: vi.fn(),
  getCalendarRange: vi.fn(),
  getPersonProfile: vi.fn(),
  getSettings: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  listForApprover: vi.fn(),
  listForUser: vi.fn(),
  listMyRecords: vi.fn(),
  listPeople: vi.fn(),
  loadManagerCoverage: vi.fn(),
  loadWorkingDaysReferenceData: vi.fn(),
  managerScopePersonIds: vi.fn(),
  organisationFindFirst: vi.fn(),
  personCount: vi.fn(),
  personFindFirst: vi.fn(),
  resolvePublicHolidays: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    organisation: { findFirst: mocks.organisationFindFirst },
    person: {
      count: mocks.personCount,
      findFirst: mocks.personFindFirst,
    },
  },
}));
vi.mock("@repo/notifications", () => ({
  listForUser: mocks.listForUser,
}));
vi.mock("../approvals/approval-service", () => ({
  listForApprover: mocks.listForApprover,
}));
vi.mock("../calendar/calendar-service", () => ({
  getCalendarRange: mocks.getCalendarRange,
}));
vi.mock("../duration/working-days", () => ({
  computeWorkingDaysFromReferenceData:
    mocks.computeWorkingDaysFromReferenceData,
  loadWorkingDaysReferenceData: mocks.loadWorkingDaysReferenceData,
}));
vi.mock("../holidays/resolve-public-holidays", () => ({
  resolvePublicHolidays: mocks.resolvePublicHolidays,
}));
vi.mock("../people/people-service", () => ({
  getPersonProfile: mocks.getPersonProfile,
  listPeople: mocks.listPeople,
}));
vi.mock("../plans/plan-service", () => ({
  listMyRecords: mocks.listMyRecords,
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: mocks.managerScopePersonIds,
}));
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: mocks.getSettings,
}));
vi.mock("../team-coverage/load-manager-coverage", () => ({
  loadManagerCoverage: mocks.loadManagerCoverage,
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
const { createDashboardCache } = await import("./dashboard-cache");
const { getAdminView, getEmployeeView, getManagerView, resolveDashboardRole } =
  await import("./dashboard-service");

const TIMEZONE = "Australia/Brisbane";
const WEEK_START = "2026-10-05";
const NOW = new Date("2026-10-09T02:00:00.000Z");
const ids = {
  peer: "00000000-0000-4000-8000-000000000012",
  quiet: "00000000-0000-4000-8000-000000000013",
  self: "00000000-0000-4000-8000-000000000011",
};
const baseInput = {
  actingRole: "employee" as const,
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: ids.self,
  userId: "user_1",
};

function buildPerson(overrides: Partial<CalendarPerson> = {}): CalendarPerson {
  return {
    avatarUrl: null,
    displayName: "Ava Nguyen",
    firstName: "Ava",
    id: ids.self,
    jobTitle: "Support officer",
    lastName: "Nguyen",
    locationName: "Brisbane",
    locationTimezone: TIMEZONE,
    personType: "employee",
    teamId: "team_1",
    teamName: "Operations",
    xeroSyncFailedCountInRange: 0,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    allDay: true,
    approvalStatus: "approved",
    avatarUrl: null,
    contactabilityStatus: null,
    displayName: "Ava Nguyen",
    endsAt: zonedStartOfDay("2026-10-07", TIMEZONE),
    id: "event_1",
    isEditableByActor: false,
    notesInternal: null,
    personId: ids.self,
    privacyMode: "named",
    recordType: "annual_leave",
    recordTypeCategory: "xero_leave",
    renderTreatment: "solid",
    sourceType: "xero_leave",
    startsAt: zonedStartOfDay("2026-10-06", TIMEZONE),
    xeroWriteError: null,
    ...overrides,
  };
}

function buildWeekRange(
  input: { events?: CalendarEvent[]; people?: CalendarPerson[] } = {}
): CalendarRange {
  const events = input.events ?? [buildEvent()];
  const people = input.people ?? [buildPerson()];
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDaysToDateKey(WEEK_START, index);
    const start = zonedStartOfDay(dateKey, TIMEZONE);
    const end = zonedStartOfDay(addDaysToDateKey(dateKey, 1), TIMEZONE);
    return {
      date: new Date(`${dateKey}T00:00:00.000Z`),
      dayOfWeek: index === 6 ? 0 : 1,
      events: events.filter(
        (event) => event.startsAt < end && event.endsAt > start
      ),
      isToday: index === 4,
      publicHolidays: [],
    };
  });
  return {
    days,
    people,
    range: {
      end: zonedStartOfDay(addDaysToDateKey(WEEK_START, 7), TIMEZONE),
      start: zonedStartOfDay(WEEK_START, TIMEZONE),
      timezone: TIMEZONE,
    },
    totalPeopleInScope: people.length,
    truncated: false,
    view: "week",
    xeroConnectionState: "connected",
    xeroSyncFailedCount: 0,
  };
}

function buildMyRecord(
  overrides: Partial<{
    approvalStatus: string;
    editableActions: string[];
    endsAt: Date;
    id: string;
    recordType: string;
    sourceType: string;
    startsAt: Date;
  }> = {}
) {
  return {
    allDay: true,
    approvalStatus: "submitted",
    editableActions: ["view", "withdraw"],
    endsAt: new Date("2026-10-13T23:59:59.999Z"),
    id: "record_1",
    person: { locationId: "location_1" },
    recordType: "annual_leave",
    sourceType: "team_calendar_leave",
    startsAt: new Date("2026-10-12T00:00:00.000Z"),
    ...overrides,
  };
}

function buildApprovalItem(
  overrides: Partial<{
    createdAt: Date;
    id: string;
    submittedAt: Date | null;
  }> = {}
) {
  return {
    approvalStatus: "submitted",
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    durationWorkingDays: 2,
    endsAt: new Date("2026-10-20T23:59:59.999Z"),
    failedAction: null,
    id: "approval_1",
    person: { firstName: "Luca", lastName: "Brown" },
    recordType: "annual_leave",
    sourceType: "team_calendar_leave",
    startsAt: new Date("2026-10-19T00:00:00.000Z"),
    submittedAt: new Date("2026-10-01T08:00:00.000Z"),
    xeroWriteError: null,
    ...overrides,
  };
}

const coverageMap: CoverageMap = {
  days: [],
  firstIssue: null,
  rows: [],
};

function calendarCalls() {
  return mocks.getCalendarRange.mock.calls.map(([call]) => call);
}

describe("dashboard-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.personFindFirst.mockResolvedValue({ id: baseInput.personId });
    mocks.personCount.mockResolvedValue(0);
    mocks.organisationFindFirst.mockResolvedValue({ name: "Acme Org" });
    mocks.getPersonProfile.mockResolvedValue({
      ok: true,
      value: {
        balances: {
          balancesLastFetchedAt: new Date("2026-10-08T09:00:00.000Z"),
          rows: [
            {
              balanceUnits: 12,
              id: "balance_1",
              leaveTypeName: "Annual Leave",
              recordType: "annual_leave",
              unitType: "days",
            },
          ],
          xeroLinked: true,
        },
        header: {
          firstName: "Ava",
          lastName: "Nguyen",
          location: {
            countryCode: "AU",
            id: "location_1",
            name: "Brisbane",
            regionCode: "QLD",
            timezone: TIMEZONE,
          },
        },
      },
    });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.listMyRecords.mockResolvedValue({
      ok: true,
      value: [buildMyRecord()],
    });
    mocks.loadWorkingDaysReferenceData.mockResolvedValue({
      holidaysByYear: new Map(),
      locationById: new Map(),
      organisation: null,
    });
    mocks.computeWorkingDaysFromReferenceData.mockReturnValue({
      ok: true,
      value: 2,
    });
    mocks.listForUser.mockResolvedValue({
      ok: true,
      value: {
        notifications: [
          {
            actionUrl: "/notifications/1",
            body: "Please add more detail",
            createdAt: new Date("2026-10-08T09:00:00.000Z"),
            id: "notification_1",
            title: "More information requested",
            type: "leave_info_requested",
          },
        ],
      },
    });
    mocks.resolvePublicHolidays.mockResolvedValue({ ok: true, value: [] });
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: { managerVisibilityScope: "direct_reports_only" },
    });
    mocks.managerScopePersonIds.mockResolvedValue([
      baseInput.personId,
      ids.peer,
    ]);
    mocks.listPeople.mockResolvedValue({
      ok: true,
      value: { nextCursor: null, people: [], totalCount: 48 },
    });
    mocks.listForApprover.mockResolvedValue({
      ok: true,
      value: [buildApprovalItem()],
    });
    mocks.getCalendarRange.mockResolvedValue({
      ok: true,
      value: buildWeekRange(),
    });
    mocks.loadManagerCoverage.mockResolvedValue({
      ok: true,
      value: coverageMap,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["org:owner", 3, "owner"],
    ["org:admin", 3, "admin"],
    ["org:viewer", 2, "manager"],
    ["org:viewer", 0, "employee"],
    ["org:viewer", 0, "viewer", null],
  ] as const)(
    "resolves %s role to %s",
    async (orgRole, directReportCount, expectedRole, person = {
      id: baseInput.personId,
    }) => {
      mocks.personFindFirst.mockResolvedValue(person);
      mocks.personCount.mockResolvedValue(directReportCount);
      const result = await resolveDashboardRole({
        clerkOrgId: baseInput.clerkOrgId,
        organisationId: baseInput.organisationId,
        orgRole,
        userId: baseInput.userId,
      });
      expect(result).toEqual({ ok: true, value: expectedRole });
    }
  );

  describe("employee view", () => {
    it("loads a self-only timeline for the requested week", async () => {
      const weekAnchor = new Date("2026-10-12T00:00:00.000Z");
      const result = await getEmployeeView({ ...baseInput, weekAnchor });
      expect(calendarCalls()).toEqual([
        {
          actingPersonId: ids.self,
          actingUserId: baseInput.userId,
          anchorDate: weekAnchor,
          clerkOrgId: baseInput.clerkOrgId,
          filters: {
            approvalStatus: ["approved"],
            includeDrafts: false,
            recordTypeCategory: "all",
          },
          organisationId: baseInput.organisationId,
          role: "viewer",
          scope: { type: "my_self" },
          view: "week",
        },
      ]);
      expect(result.ok).toBe(true);
      if (!(result.ok && result.value.timeline.status === "ready")) {
        throw new Error("Expected a ready timeline");
      }
      expect(result.value.timeline.data.rows).toEqual([
        expect.objectContaining({
          entries: [
            expect.objectContaining({ id: "event_1", provenance: "xero" }),
          ],
          isSelf: true,
          personId: ids.self,
        }),
      ]);
    });

    it("defaults the timeline week to today", async () => {
      await getEmployeeView(baseInput);
      expect(calendarCalls()).toEqual([
        expect.objectContaining({ anchorDate: NOW }),
      ]);
    });

    it("keeps only the sections the employee dashboard renders", async () => {
      const result = await getEmployeeView(baseInput);
      if (!result.ok) {
        throw new Error("Expected an employee view");
      }
      expect(Object.keys(result.value).sort()).toEqual([
        "actionItems",
        "balances",
        "header",
        "myRequests",
        "publicHolidays",
        "timeline",
      ]);
      expect(result.value.header).toEqual({
        firstName: "Ava",
        lastName: "Nguyen",
        locationName: "Brisbane",
        roleLabel: "Employee",
        timezone: TIMEZONE,
      });
      expect(result.value.actionItems).toEqual({
        data: {
          infoRequestedNotifications: [
            {
              actionUrl: "/notifications/1",
              body: "Please add more detail",
              createdAt: new Date("2026-10-08T09:00:00.000Z"),
              notificationId: "notification_1",
              title: "More information requested",
              type: "leave_info_requested",
            },
          ],
        },
        status: "ready",
      });
    });

    it("preserves an unavailable Xero state on balances", async () => {
      mocks.getXeroConnectionStateForScope.mockResolvedValue({
        error: { code: "state_unavailable" },
        ok: false,
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok && result.value.balances).toMatchObject({
        data: { xeroConnectionState: "unavailable" },
        status: "ready",
      });
    });

    it("lists my requests ending today or later, soonest first, five at most", async () => {
      mocks.listMyRecords.mockResolvedValue({
        ok: true,
        value: [
          buildMyRecord({
            approvalStatus: "approved",
            editableActions: ["edit", "archive"],
            id: "record_manual",
            recordType: "wfh",
            sourceType: "manual",
            startsAt: new Date("2026-10-14T00:00:00.000Z"),
          }),
          buildMyRecord({
            endsAt: new Date("2026-10-08T23:59:59.999Z"),
            id: "record_ended",
            startsAt: new Date("2026-10-08T00:00:00.000Z"),
          }),
          buildMyRecord({ id: "record_submitted" }),
          buildMyRecord({
            approvalStatus: "declined",
            editableActions: ["view", "archive"],
            id: "record_declined",
            startsAt: new Date("2026-10-15T00:00:00.000Z"),
          }),
          buildMyRecord({
            approvalStatus: "approved",
            editableActions: ["view"],
            id: "record_xero",
            sourceType: "xero_leave",
            startsAt: new Date("2026-10-16T00:00:00.000Z"),
          }),
          buildMyRecord({
            id: "record_later_1",
            startsAt: new Date("2026-10-20T00:00:00.000Z"),
          }),
          buildMyRecord({
            id: "record_later_2",
            startsAt: new Date("2026-10-21T00:00:00.000Z"),
          }),
        ],
      });
      mocks.computeWorkingDaysFromReferenceData.mockReturnValueOnce({
        error: { code: "location_not_found", message: "Missing" },
        ok: false,
      });
      const result = await getEmployeeView(baseInput);
      expect(mocks.listMyRecords).toHaveBeenCalledWith({
        clerkOrgId: baseInput.clerkOrgId,
        filters: {
          approvalStatus: ["submitted", "approved", "declined"],
          dateRange: { from: new Date("2026-10-09T00:00:00.000Z") },
          includeArchived: false,
        },
        organisationId: baseInput.organisationId,
        userId: baseInput.userId,
      });
      if (!(result.ok && result.value.myRequests.status === "ready")) {
        throw new Error("Expected ready requests");
      }
      expect(result.value.myRequests.data.records).toEqual([
        expect.objectContaining({
          canEdit: false,
          canWithdraw: true,
          dayCount: null,
          recordId: "record_submitted",
        }),
        expect.objectContaining({
          approvalStatus: "approved",
          canEdit: true,
          canWithdraw: false,
          dayCount: 2,
          recordId: "record_manual",
          recordType: "wfh",
          sourceType: "manual",
        }),
        expect.objectContaining({
          canEdit: false,
          canWithdraw: false,
          recordId: "record_declined",
        }),
        expect.objectContaining({
          canEdit: false,
          canWithdraw: false,
          recordId: "record_xero",
        }),
        expect.objectContaining({ recordId: "record_later_1" }),
      ]);
    });

    it("fails each section independently", async () => {
      mocks.listMyRecords.mockResolvedValue({
        error: { code: "unknown_error", message: "Records unavailable" },
        ok: false,
      });
      mocks.getCalendarRange.mockResolvedValue({
        error: { code: "unknown_error", message: "Calendar unavailable" },
        ok: false,
      });
      mocks.listForUser.mockResolvedValue({
        error: { code: "unknown_error", message: "Notifications unavailable" },
        ok: false,
      });
      const result = await getEmployeeView(baseInput);
      expect(result).toMatchObject({
        ok: true,
        value: {
          actionItems: {
            message: "Notifications unavailable",
            status: "error",
          },
          balances: { status: "ready" },
          myRequests: { message: "Records unavailable", status: "error" },
          publicHolidays: { status: "ready" },
          timeline: { message: "Calendar unavailable", status: "error" },
        },
      });
    });

    it("caches views per week anchor", async () => {
      const cache = createDashboardCache();
      const first = new Date("2026-10-12T00:00:00.000Z");
      const second = new Date("2026-10-19T00:00:00.000Z");
      await getEmployeeView({ ...baseInput, weekAnchor: first }, cache);
      await getEmployeeView({ ...baseInput, weekAnchor: first }, cache);
      await getEmployeeView({ ...baseInput, weekAnchor: second }, cache);
      expect(calendarCalls().map((call) => call.anchorDate)).toEqual([
        first,
        second,
      ]);
    });
  });

  describe("manager view", () => {
    const managerInput = { ...baseInput, actingRole: "manager" as const };

    it("loads the team timeline, coverage weeks and approval rows", async () => {
      const weekAnchor = new Date("2026-10-19T00:00:00.000Z");
      const currentWeek = buildWeekRange();
      mocks.getCalendarRange.mockImplementation(({ anchorDate }) =>
        Promise.resolve({
          ok: true,
          value:
            anchorDate.getTime() === NOW.getTime()
              ? currentWeek
              : buildWeekRange(),
        })
      );
      mocks.listForApprover.mockResolvedValue({
        ok: true,
        value: [
          buildApprovalItem({
            id: "approval_new",
            submittedAt: new Date("2026-10-08T08:00:00.000Z"),
          }),
          ...Array.from({ length: 5 }, (_, index) =>
            buildApprovalItem({
              id: `approval_old_${index}`,
              submittedAt: new Date(`2026-10-0${index + 1}T08:00:00.000Z`),
            })
          ),
        ],
      });
      const result = await getManagerView({ ...managerInput, weekAnchor });
      expect(calendarCalls()).toHaveLength(3);
      for (const call of calendarCalls()) {
        expect(call).toMatchObject({
          actingPersonId: ids.self,
          filters: { approvalStatus: ["approved"] },
          role: "manager",
          scope: { type: "my_team" },
          view: "week",
        });
      }
      expect(calendarCalls().map((call) => call.anchorDate)).toEqual(
        expect.arrayContaining([
          NOW,
          new Date("2026-10-16T02:00:00.000Z"),
          weekAnchor,
        ])
      );
      expect(mocks.loadManagerCoverage).toHaveBeenCalledWith({
        clerkOrgId: baseInput.clerkOrgId,
        organisationId: baseInput.organisationId,
        ranges: [currentWeek, expect.objectContaining({ view: "week" })],
        today: NOW,
      });
      expect(mocks.listForApprover).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkOrgId: baseInput.clerkOrgId,
          filters: { status: ["submitted"] },
          organisationId: baseInput.organisationId,
          role: "manager",
        })
      );
      if (!result.ok) {
        throw new Error("Expected a manager view");
      }
      expect(Object.keys(result.value).sort()).toEqual([
        "actionItems",
        "approvalQueue",
        "balances",
        "coverage",
        "header",
        "publicHolidays",
        "timeline",
      ]);
      expect(result.value.coverage).toEqual({
        data: coverageMap,
        status: "ready",
      });
      expect(result.value.approvalQueue).toMatchObject({
        data: {
          count: 6,
          rows: [
            { recordId: "approval_old_0" },
            { recordId: "approval_old_1" },
            { recordId: "approval_old_2" },
            { recordId: "approval_old_3" },
            {
              durationWorkingDays: 2,
              personFirstName: "Luca",
              personLastName: "Brown",
              recordId: "approval_old_4",
              recordType: "annual_leave",
              sourceType: "team_calendar_leave",
            },
          ],
        },
        status: "ready",
      });
      expect(result.value.header).toMatchObject({
        directReportCount: 0,
        roleLabel: "Manager",
        scopeLabel: "0 direct reports",
      });
    });

    it("reuses the current week for the timeline when no week is requested", async () => {
      await getManagerView(managerInput);
      expect(calendarCalls()).toHaveLength(2);
    });

    it("caps the timeline at twelve rows with self first", async () => {
      const people = [
        buildPerson(),
        ...Array.from({ length: 14 }, (_, index) =>
          buildPerson({
            firstName: `Person${String(index).padStart(2, "0")}`,
            id: `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`,
          })
        ),
      ];
      mocks.getCalendarRange.mockResolvedValue({
        ok: true,
        value: buildWeekRange({ events: [], people: people.reverse() }),
      });
      const result = await getManagerView(managerInput);
      if (!(result.ok && result.value.timeline.status === "ready")) {
        throw new Error("Expected a ready timeline");
      }
      expect(result.value.timeline.data.rows).toHaveLength(12);
      expect(result.value.timeline.data.rows[0]?.isSelf).toBe(true);
      expect(result.value.timeline.data.totalPeopleInScope).toBe(15);
    });

    it("labels an all-team scope with direct and indirect reports", async () => {
      mocks.getSettings.mockResolvedValue({
        ok: true,
        value: { managerVisibilityScope: "all_team_leave" },
      });
      const result = await getManagerView(managerInput);
      expect(result.ok && result.value.header.scopeLabel).toBe(
        "1 team members (direct + indirect)"
      );
    });

    it("degrades coverage and approvals without failing the dashboard", async () => {
      mocks.loadManagerCoverage.mockResolvedValue({
        error: { code: "internal", message: "Coverage unavailable" },
        ok: false,
      });
      mocks.listForApprover.mockResolvedValue({
        error: { code: "unknown_error", message: "Approvals unavailable" },
        ok: false,
      });
      const result = await getManagerView(managerInput);
      expect(result).toMatchObject({
        ok: true,
        value: {
          approvalQueue: { message: "Approvals unavailable", status: "error" },
          coverage: { message: "Coverage unavailable", status: "error" },
          timeline: { status: "ready" },
        },
      });
    });

    it("reports coverage as an error when a coverage week fails", async () => {
      mocks.getCalendarRange.mockResolvedValue({
        error: { code: "unknown_error", message: "Calendar unavailable" },
        ok: false,
      });
      const result = await getManagerView(managerInput);
      expect(mocks.loadManagerCoverage).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        ok: true,
        value: {
          coverage: { message: "Calendar unavailable", status: "error" },
          timeline: { message: "Calendar unavailable", status: "error" },
        },
      });
    });
  });

  describe("admin view", () => {
    it.each([
      ["admin", "Admin"],
      ["owner", "Owner"],
    ] as const)(
      "shows %s an organisation-wide timeline of people away",
      async (actingRole, roleLabel) => {
        mocks.getCalendarRange.mockResolvedValue({
          ok: true,
          value: buildWeekRange({
            events: [buildEvent({ id: "event_peer", personId: ids.peer })],
            people: [
              buildPerson(),
              buildPerson({ firstName: "Bo", id: ids.peer }),
              buildPerson({ firstName: "Cy", id: ids.quiet }),
            ],
          }),
        });
        const result = await getAdminView({ ...baseInput, actingRole });
        expect(calendarCalls()).toEqual([
          expect.objectContaining({
            anchorDate: NOW,
            role: actingRole,
            scope: { type: "all_teams" },
            view: "week",
          }),
        ]);
        expect(mocks.listForApprover).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: { status: ["submitted"] },
            role: actingRole,
          })
        );
        if (!result.ok) {
          throw new Error("Expected an admin view");
        }
        expect(Object.keys(result.value).sort()).toEqual([
          "actionItems",
          "approvalQueue",
          "balances",
          "header",
          "publicHolidays",
          "timeline",
        ]);
        expect(result.value.header).toMatchObject({
          organisationName: "Acme Org",
          roleLabel,
          totalActivePeopleCount: 48,
        });
        if (result.value.timeline.status !== "ready") {
          throw new Error("Expected a ready timeline");
        }
        expect(
          result.value.timeline.data.rows.map((row) => row.personId)
        ).toEqual([ids.peer]);
        expect(result.value.timeline.data.totalPeopleInScope).toBe(1);
        expect(result.value.approvalQueue).toMatchObject({
          data: { count: 1, rows: [{ recordId: "approval_1" }] },
          status: "ready",
        });
      }
    );
  });

  describe("next public holiday card", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2026-04-20T00:00:00.000Z"));
    });

    it("shows the next non-working or part-day holiday for the person's location", async () => {
      mocks.resolvePublicHolidays.mockResolvedValue({
        ok: true,
        value: [
          resolvedHoliday({
            date: "2026-04-22",
            locationId: "location_other",
            name: "Other Office Day",
          }),
          resolvedHoliday({
            classification: "working",
            date: "2026-04-23",
            name: "Working Day",
          }),
          resolvedHoliday({
            classification: "working",
            date: "2026-04-24",
            kind: "part_day",
            name: "Part Day",
            startsAt: "18:00",
          }),
          resolvedHoliday({ date: "2026-04-25", name: "ANZAC Day" }),
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toEqual({
        data: {
          daysUntil: 4,
          next: {
            holidayDate: new Date("2026-04-24T00:00:00.000Z"),
            name: "Part Day",
            startsAt: "18:00",
          },
        },
        status: "ready",
      });
      expect(mocks.resolvePublicHolidays).toHaveBeenCalledWith({
        clerkOrgId: baseInput.clerkOrgId,
        from: "2026-04-20",
        organisationId: baseInput.organisationId,
        to: "2027-05-25",
      });
    });

    it("returns no holiday when none applies", async () => {
      const result = await getEmployeeView(baseInput);
      expect(result.ok && result.value.publicHolidays).toEqual({
        data: { daysUntil: null, next: null },
        status: "ready",
      });
    });

    it("reports an error section when holidays cannot be resolved", async () => {
      mocks.resolvePublicHolidays.mockResolvedValue({
        error: {
          code: "internal",
          message: "Failed to resolve public holidays",
        },
        ok: false,
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok && result.value.publicHolidays).toEqual({
        message: "Failed to resolve public holidays",
        status: "error",
      });
    });
  });
});

function resolvedHoliday(
  overrides: Partial<{
    classification: "non_working" | "working";
    date: string;
    kind: "custom" | "local" | "part_day" | "public";
    locationId: string | null;
    name: string;
    startsAt: string | null;
  }>
) {
  return {
    area: null,
    classification: "non_working",
    date: "2026-04-25",
    hidden: false,
    key: "au-national-2026-04-25-holiday",
    kind: "public",
    locationId: "location_1",
    name: "Holiday",
    origin: "official",
    startsAt: null,
    ...overrides,
  };
}
