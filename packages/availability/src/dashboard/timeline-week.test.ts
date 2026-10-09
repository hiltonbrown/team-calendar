import { describe, expect, it } from "vitest";
import type {
  CalendarDay,
  CalendarEvent,
  CalendarPerson,
  CalendarRange,
  PublicHolidayCell,
} from "../calendar/calendar-service";
import { addDaysToDateKey, zonedStartOfDay } from "./date-keys";
import { buildTimelineWeek, timelineProvenance } from "./timeline-week";

const TIMEZONE = "Australia/Brisbane";
const WEEK_START = "2026-10-05";
const TODAY = new Date("2026-10-09T02:00:00.000Z");
const ids = {
  ari: "00000000-0000-4000-8000-000000000011",
  bo: "00000000-0000-4000-8000-000000000012",
  cy: "00000000-0000-4000-8000-000000000013",
  self: "00000000-0000-4000-8000-000000000010",
};

function buildPerson(overrides: Partial<CalendarPerson> = {}): CalendarPerson {
  return {
    avatarUrl: null,
    displayName: "Ari Report",
    firstName: "Ari",
    id: ids.ari,
    jobTitle: "Support officer",
    lastName: "Report",
    locationName: "Brisbane",
    locationTimezone: TIMEZONE,
    personType: "employee",
    teamId: "team-1",
    teamName: "Operations",
    xeroSyncFailedCountInRange: 0,
    ...overrides,
  };
}

/** Local midnight `offset` days after the week start, in Brisbane. */
function localDay(offset: number): Date {
  return zonedStartOfDay(addDaysToDateKey(WEEK_START, offset), TIMEZONE);
}

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    allDay: true,
    approvalStatus: "approved",
    avatarUrl: null,
    contactabilityStatus: null,
    displayName: "Ari Report",
    endsAt: localDay(1),
    id: "event-1",
    isEditableByActor: false,
    notesInternal: "Dentist",
    personId: ids.ari,
    privacyMode: "named",
    recordType: "annual_leave",
    recordTypeCategory: "xero_leave",
    renderTreatment: "solid",
    sourceType: "xero",
    startsAt: localDay(0),
    xeroWriteError: null,
    ...overrides,
  };
}

/**
 * A week range shaped like `getCalendarRange` output: each event appears on
 * every day it overlaps, and days are UTC midnight of their date.
 */
function buildCalendarRangeFixture(
  input: {
    events?: CalendarEvent[];
    holidays?: Record<number, PublicHolidayCell[]>;
    people?: CalendarPerson[];
    todayIndex?: number | null;
    totalPeopleInScope?: number;
    weekStart?: string;
  } = {}
): CalendarRange {
  const weekStart = input.weekStart ?? WEEK_START;
  const events = input.events ?? [];
  const people = input.people ?? [buildPerson()];
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDaysToDateKey(weekStart, index);
    const start = zonedStartOfDay(dateKey, TIMEZONE);
    const end = zonedStartOfDay(addDaysToDateKey(dateKey, 1), TIMEZONE);
    return {
      date: new Date(`${dateKey}T00:00:00.000Z`),
      dayOfWeek: ((index + 1) % 7) as CalendarDay["dayOfWeek"],
      events: events.filter(
        (event) => event.startsAt < end && event.endsAt > start
      ),
      isToday:
        index === (input.todayIndex === undefined ? 4 : input.todayIndex),
      publicHolidays: input.holidays?.[index] ?? [],
    };
  });
  return {
    days,
    people,
    range: {
      end: zonedStartOfDay(addDaysToDateKey(weekStart, 7), TIMEZONE),
      start: zonedStartOfDay(weekStart, TIMEZONE),
      timezone: TIMEZONE,
    },
    totalPeopleInScope: input.totalPeopleInScope ?? people.length,
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
    name: "King's Birthday",
    startsAt: null,
    ...overrides,
  };
}

function build(
  range: CalendarRange,
  overrides: Partial<Parameters<typeof buildTimelineWeek>[0]> = {}
) {
  return buildTimelineWeek({
    actingPersonId: ids.self,
    onlyPeopleWithEntries: false,
    range,
    rowLimit: 12,
    today: TODAY,
    ...overrides,
  });
}

describe("buildTimelineWeek", () => {
  it("returns seven Monday-first days with today from the calendar", () => {
    const week = build(buildCalendarRangeFixture());
    expect(week.days.map((day) => day.dateKey)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(week.days.map((day) => day.isToday)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(week.days[0]?.date.toISOString()).toBe("2026-10-04T14:00:00.000Z");
    expect(week.timezone).toBe(TIMEZONE);
  });

  it("names only full-day holidays that apply to every location in view", () => {
    const week = build(
      buildCalendarRangeFixture({
        holidays: {
          0: [holiday()],
          1: [holiday({ name: "Show day", startsAt: "12:00" })],
          2: [holiday({ appliesToAllLocationsInView: false, name: "Local" })],
        },
      })
    );
    expect(week.days.map((day) => day.holidayName)).toEqual([
      "King's Birthday",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("clamps records that cross the week edges", () => {
    const week = build(
      buildCalendarRangeFixture({
        events: [
          buildEvent({
            endsAt: localDay(2),
            id: "from-thursday",
            startsAt: localDay(-4),
          }),
          buildEvent({
            endsAt: localDay(10),
            id: "past-sunday",
            startsAt: localDay(5),
          }),
        ],
      })
    );
    const entries = week.rows[0]?.entries ?? [];
    expect(
      entries.map(({ dayCount, endIndex, id, startIndex }) => ({
        dayCount,
        endIndex,
        id,
        startIndex,
      }))
    ).toEqual([
      { dayCount: 2, endIndex: 1, id: "from-thursday", startIndex: 0 },
      { dayCount: 2, endIndex: 6, id: "past-sunday", startIndex: 5 },
    ]);
  });

  it("deduplicates multi-day events that appear on several days", () => {
    const week = build(
      buildCalendarRangeFixture({
        events: [buildEvent({ endsAt: localDay(3), startsAt: localDay(0) })],
      })
    );
    expect(week.rows[0]?.entries).toHaveLength(1);
    expect(week.rows[0]?.entries[0]).toMatchObject({
      dayCount: 3,
      endIndex: 2,
      note: "Dentist",
      startIndex: 0,
    });
  });

  it.each([
    ["xero", "xero"],
    ["xero_leave", "xero"],
    ["team_calendar_leave", "leave_request"],
    ["manual", "manual"],
  ] as const)("derives %s provenance as %s", (sourceType, provenance) => {
    expect(timelineProvenance(sourceType)).toBe(provenance);
    const week = build(
      buildCalendarRangeFixture({ events: [buildEvent({ sourceType })] })
    );
    expect(week.rows[0]?.entries[0]?.provenance).toBe(provenance);
  });

  it("treats private and masked peer records as private with no note", () => {
    const week = build(
      buildCalendarRangeFixture({
        events: [
          buildEvent({
            displayName: "Unavailable",
            id: "private",
            notesInternal: null,
            privacyMode: "private",
            recordType: "private",
          }),
          buildEvent({
            displayName: "Team member",
            id: "masked",
            privacyMode: "masked",
            recordType: "sick_leave",
            startsAt: localDay(0),
          }),
          buildEvent({
            id: "masked-own",
            privacyMode: "masked",
            recordType: "training",
          }),
        ],
      })
    );
    const entries = new Map(
      (week.rows[0]?.entries ?? []).map((entry) => [entry.id, entry])
    );
    expect(entries.get("private")).toMatchObject({
      isPrivate: true,
      note: null,
      recordType: "private",
    });
    expect(entries.get("masked")).toMatchObject({
      isPrivate: true,
      note: null,
      recordType: "private",
    });
    expect(entries.get("masked-own")).toMatchObject({
      isPrivate: false,
      note: "Dentist",
      recordType: "training",
    });
  });

  it("orders self first, then by first entry, then by name", () => {
    const people = [
      buildPerson({ firstName: "Cy", id: ids.cy, lastName: "Zed" }),
      buildPerson({ firstName: "Bo", id: ids.bo, lastName: "Young" }),
      buildPerson({ firstName: "Ari", id: ids.ari, lastName: "Report" }),
      buildPerson({ firstName: "Sam", id: ids.self, lastName: "Self" }),
    ];
    const week = build(
      buildCalendarRangeFixture({
        events: [
          buildEvent({
            endsAt: localDay(4),
            id: "cy",
            personId: ids.cy,
            startsAt: localDay(3),
          }),
          buildEvent({
            endsAt: localDay(2),
            id: "bo",
            personId: ids.bo,
            startsAt: localDay(1),
          }),
        ],
        people,
      })
    );
    expect(week.rows.map((row) => [row.firstName, row.isSelf])).toEqual([
      ["Sam", true],
      ["Bo", false],
      ["Cy", false],
      ["Ari", false],
    ]);
    expect(week.rows[0]).toMatchObject({
      jobTitle: "Support officer",
      locationName: "Brisbane",
      teamName: "Operations",
    });
  });

  it("caps rows while keeping the full count in scope", () => {
    const people = [ids.ari, ids.bo, ids.cy].map((id, index) =>
      buildPerson({ firstName: `P${index}`, id })
    );
    const week = build(
      buildCalendarRangeFixture({ people, totalPeopleInScope: 31 }),
      { rowLimit: 2 }
    );
    expect(week.rows).toHaveLength(2);
    expect(week.totalPeopleInScope).toBe(31);
  });

  it("drops people without entries and counts only people away", () => {
    const people = [ids.ari, ids.bo, ids.cy].map((id, index) =>
      buildPerson({ firstName: `P${index}`, id })
    );
    const week = build(
      buildCalendarRangeFixture({
        events: [
          buildEvent({ id: "a", personId: ids.ari }),
          buildEvent({ id: "b", personId: ids.bo }),
        ],
        people,
        totalPeopleInScope: 48,
      }),
      { onlyPeopleWithEntries: true, rowLimit: 1 }
    );
    expect(week.rows.map((row) => row.personId)).toEqual([ids.ari]);
    expect(week.totalPeopleInScope).toBe(2);
  });

  it("links to the neighbouring weeks and flags the current week", () => {
    const current = build(buildCalendarRangeFixture());
    expect(current).toMatchObject({
      isCurrentWeek: true,
      nextWeekStart: "2026-10-12",
      previousWeekStart: "2026-09-28",
      weekStart: "2026-10-05",
    });
    const next = build(
      buildCalendarRangeFixture({ todayIndex: null, weekStart: "2026-10-12" })
    );
    expect(next.isCurrentWeek).toBe(false);
    expect(next.days.every((day) => !day.isToday)).toBe(true);
  });
});
