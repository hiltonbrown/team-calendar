import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CalendarDay,
  CalendarEvent,
  CalendarPerson,
  CalendarRange,
  PublicHolidayCell,
} from "../calendar/calendar-service";
import { addDaysToDateKey } from "../dashboard/date-keys";

const mocks = vi.hoisted(() => ({
  countAwayPeopleByTeamAndDay: vi.fn(),
  listTeamsWithCoverageMinimum: vi.fn(),
}));

vi.mock("@repo/database/queries/teams", () => ({
  countAwayPeopleByTeamAndDay: mocks.countAwayPeopleByTeamAndDay,
  listTeamsWithCoverageMinimum: mocks.listTeamsWithCoverageMinimum,
}));

const { AWAY_RECORD_TYPES } = await import("./coverage-map");
const { loadManagerCoverage, NO_TEAM_NAME } = await import(
  "./load-manager-coverage"
);

const TIMEZONE = "Australia/Brisbane";
const TODAY = new Date("2026-10-09T02:00:00.000Z");
const scope = {
  clerkOrgId: "org_coverage",
  organisationId: "11111111-1111-4111-8111-111111111111",
};

function buildPerson(id: string, teamId: string | null): CalendarPerson {
  return {
    avatarUrl: null,
    displayName: id,
    firstName: id,
    id,
    jobTitle: null,
    lastName: "Person",
    locationName: "Brisbane",
    locationTimezone: TIMEZONE,
    personType: "employee",
    teamId,
    teamName: teamId,
    xeroSyncFailedCountInRange: 0,
  };
}

function buildEvent(
  id: string,
  personId: string,
  recordType: CalendarEvent["recordType"] = "annual_leave"
): CalendarEvent {
  return {
    allDay: true,
    approvalStatus: "approved",
    avatarUrl: null,
    contactabilityStatus: null,
    displayName: personId,
    endsAt: new Date("2026-10-13T14:00:00.000Z"),
    id,
    isEditableByActor: false,
    notesInternal: null,
    personId,
    privacyMode: "named",
    recordType,
    recordTypeCategory: "xero_leave",
    renderTreatment: "solid",
    sourceType: "xero",
    startsAt: new Date("2026-10-11T14:00:00.000Z"),
    xeroWriteError: null,
  };
}

function buildRange(input: {
  eventsByDate?: Record<string, CalendarEvent[]>;
  holidaysByDate?: Record<string, PublicHolidayCell[]>;
  people: CalendarPerson[];
  weekStart: string;
}): CalendarRange {
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDaysToDateKey(input.weekStart, index);
    return {
      date: new Date(`${dateKey}T00:00:00.000Z`),
      dayOfWeek: ((index + 1) % 7) as CalendarDay["dayOfWeek"],
      events: input.eventsByDate?.[dateKey] ?? [],
      isToday: false,
      publicHolidays: input.holidaysByDate?.[dateKey] ?? [],
    };
  });
  return {
    days,
    people: input.people,
    range: {
      end: new Date(`${addDaysToDateKey(input.weekStart, 7)}T00:00:00.000Z`),
      start: new Date(`${input.weekStart}T00:00:00.000Z`),
      timezone: TIMEZONE,
    },
    totalPeopleInScope: input.people.length,
    truncated: false,
    view: "week",
    xeroConnectionState: "connected",
    xeroSyncFailedCount: 0,
  };
}

function holiday(
  overrides: Partial<PublicHolidayCell> = {}
): PublicHolidayCell {
  return {
    appliesToAllLocationsInView: true,
    isSuppressed: false,
    locationNames: ["Brisbane"],
    name: "Holiday",
    startsAt: null,
    ...overrides,
  };
}

const people = [
  buildPerson("manager", "team-support"),
  buildPerson("report", "team-support"),
  buildPerson("loner", null),
  buildPerson("drifter", null),
];

function buildRanges(): CalendarRange[] {
  return [
    buildRange({
      holidaysByDate: {
        "2026-10-09": [holiday({ name: "Part day", startsAt: "12:00" })],
      },
      people,
      weekStart: "2026-10-05",
    }),
    buildRange({
      eventsByDate: {
        "2026-10-12": [
          buildEvent("leave", "loner"),
          buildEvent("second-leave", "loner", "training"),
          buildEvent("home", "drifter", "wfh"),
        ],
        "2026-10-13": [buildEvent("leave", "loner")],
      },
      holidaysByDate: {
        "2026-10-14": [holiday()],
        "2026-10-15": [holiday({ appliesToAllLocationsInView: false })],
      },
      people,
      weekStart: "2026-10-12",
    }),
  ];
}

describe("loadManagerCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTeamsWithCoverageMinimum.mockResolvedValue({
      ok: true,
      value: [
        {
          activePeopleCount: 7,
          id: "team-support",
          minimumAvailablePeople: 6,
          name: "Customer support",
        },
        {
          activePeopleCount: 4,
          id: "team-outside-scope",
          minimumAvailablePeople: 1,
          name: "Finance",
        },
      ],
    });
    mocks.countAwayPeopleByTeamAndDay.mockResolvedValue({
      ok: true,
      value: new Map([
        [
          "team-support",
          new Map([
            ["2026-10-09", 2],
            ["2026-10-12", 0],
            ["2026-10-13", 1],
            ["2026-10-14", 0],
            ["2026-10-15", 0],
          ]),
        ],
      ]),
    });
  });

  it("reads team counts with both tenancy keys and the shared away types", async () => {
    await loadManagerCoverage({
      ...scope,
      ranges: buildRanges(),
      today: TODAY,
    });
    expect(mocks.listTeamsWithCoverageMinimum).toHaveBeenCalledWith(scope);
    expect(mocks.countAwayPeopleByTeamAndDay).toHaveBeenCalledWith({
      ...scope,
      awayRecordTypes: AWAY_RECORD_TYPES,
      from: "2026-10-09",
      teamIds: ["team-support"],
      timezone: TIMEZONE,
      to: "2026-10-15",
    });
  });

  it("builds rows for teams in scope with full headcount, then No team", async () => {
    const result = await loadManagerCoverage({
      ...scope,
      ranges: buildRanges(),
      today: TODAY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const map = result.value;
    expect(map.days.map((day) => day.dateKey)).toEqual([
      "2026-10-09",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);
    expect(
      map.rows.map(({ minimum, teamId, teamName, teamSize }) => ({
        minimum,
        teamId,
        teamName,
        teamSize,
      }))
    ).toEqual([
      {
        minimum: 6,
        teamId: "team-support",
        teamName: "Customer support",
        teamSize: 7,
      },
      { minimum: null, teamId: null, teamName: NO_TEAM_NAME, teamSize: 2 },
    ]);
    expect(map.rows[0]?.cells.map((cell) => cell.state)).toEqual([
      "short",
      "covered",
      "at_minimum",
      "holiday",
      "covered",
    ]);
    // Two records for one person count once; working from home counts as in.
    expect(map.rows[1]?.cells.map((cell) => cell.awayCount)).toEqual([
      0, 1, 1, 0, 0,
    ]);
    expect(map.rows[1]?.cells.map((cell) => cell.state)).toEqual([
      "covered",
      "peak",
      "peak",
      "holiday",
      "covered",
    ]);
    expect(map.firstIssue).toMatchObject({
      dateKey: "2026-10-09",
      state: "short",
      teamName: "Customer support",
    });
  });

  it("omits the No team row when everyone in scope has a team", async () => {
    const teamPeople = people.slice(0, 2);
    const result = await loadManagerCoverage({
      ...scope,
      ranges: [buildRange({ people: teamPeople, weekStart: "2026-10-05" })],
      today: TODAY,
    });
    expect(result.ok && result.value.rows.map((row) => row.teamId)).toEqual([
      "team-support",
    ]);
  });

  it("returns database failures", async () => {
    mocks.countAwayPeopleByTeamAndDay.mockResolvedValue({
      error: { code: "internal", message: "Failed to count people away" },
      ok: false,
    });
    await expect(
      loadManagerCoverage({ ...scope, ranges: buildRanges(), today: TODAY })
    ).resolves.toEqual({
      error: { code: "internal", message: "Failed to count people away" },
      ok: false,
    });
    mocks.listTeamsWithCoverageMinimum.mockResolvedValue({
      error: { code: "internal", message: "Failed to list teams" },
      ok: false,
    });
    await expect(
      loadManagerCoverage({ ...scope, ranges: buildRanges(), today: TODAY })
    ).resolves.toMatchObject({ error: { code: "internal" }, ok: false });
  });

  it("requires a calendar range", async () => {
    await expect(
      loadManagerCoverage({ ...scope, ranges: [], today: TODAY })
    ).resolves.toMatchObject({ error: { code: "bad_request" }, ok: false });
    expect(mocks.listTeamsWithCoverageMinimum).not.toHaveBeenCalled();
  });
});
