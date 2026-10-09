import { availability_record_type } from "@repo/database/generated/enums";
import { describe, expect, it } from "vitest";
import {
  AWAY_RECORD_TYPES,
  buildCoverageMap,
  type CoverageMapDay,
  type CoverageMapTeam,
  dedupeEventsByPerson,
  isAwayEvent,
  NO_TEAM_KEY,
  nextWorkingDays,
  PEAK_AWAY_THRESHOLD_PERCENT,
} from "./coverage-map";

const TIMEZONE = "Australia/Brisbane";
const DATE_KEYS = [
  "2026-10-09",
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
];

function buildDays(holidayKeys: readonly string[] = []): CoverageMapDay[] {
  return DATE_KEYS.map((dateKey, index) => ({
    date: new Date(`${dateKey}T00:00:00.000Z`),
    dateKey,
    fullDayHolidayForAllLocations: holidayKeys.includes(dateKey),
    isToday: index === 0,
  }));
}

function buildTeam(overrides: Partial<CoverageMapTeam> = {}): CoverageMapTeam {
  return {
    id: "team-support",
    minimum: 2,
    name: "Customer support",
    size: 3,
    ...overrides,
  };
}

function awayCounts(
  entries: Record<string, Record<string, number>>
): Map<string, Map<string, number>> {
  return new Map(
    Object.entries(entries).map(([teamId, days]) => [
      teamId,
      new Map(Object.entries(days)),
    ])
  );
}

describe("away rule", () => {
  it("counts every record type except the in types as away", () => {
    expect(AWAY_RECORD_TYPES).not.toContain("wfh");
    expect(AWAY_RECORD_TYPES).not.toContain("alternative_contact");
    expect(AWAY_RECORD_TYPES).not.toContain("limited_availability");
    for (const recordType of [
      "annual_leave",
      "public_holiday",
      "other",
      "offsite_meeting",
      "another_office",
      "contractor_unavailable",
    ] as const) {
      expect(AWAY_RECORD_TYPES).toContain(recordType);
    }
  });

  it("matches isAwayEvent for every record type", () => {
    for (const recordType of Object.values(availability_record_type)) {
      expect(isAwayEvent({ approvalStatus: "approved", recordType })).toBe(
        AWAY_RECORD_TYPES.includes(recordType)
      );
    }
  });

  it("treats private and unapproved records as in", () => {
    expect(
      isAwayEvent({ approvalStatus: "approved", recordType: "private" })
    ).toBe(false);
    expect(
      isAwayEvent({ approvalStatus: "submitted", recordType: "annual_leave" })
    ).toBe(false);
  });

  it("keeps one event per person", () => {
    expect(
      dedupeEventsByPerson([
        { id: "a", personId: "p1" },
        { id: "b", personId: "p1" },
        { id: "c", personId: "p2" },
      ]).map((event) => event.id)
    ).toEqual(["a", "c"]);
  });
});

describe("nextWorkingDays", () => {
  it("skips the weekend and can span two weeks", () => {
    const days = nextWorkingDays(
      new Date("2026-10-09T02:00:00.000Z"),
      TIMEZONE
    );
    expect(days.map((day) => day.dateKey)).toEqual(DATE_KEYS);
    expect(days.map((day) => day.isToday)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(days[0]?.date.toISOString()).toBe("2026-10-08T14:00:00.000Z");
  });

  it("starts on Monday when today is a weekend day in the timezone", () => {
    // Friday 23:00 UTC is Saturday 09:00 in Brisbane.
    const days = nextWorkingDays(
      new Date("2026-10-09T23:00:00.000Z"),
      TIMEZONE
    );
    expect(days.map((day) => day.dateKey)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(days.some((day) => day.isToday)).toBe(false);
  });
});

describe("buildCoverageMap", () => {
  it("sorts teams by name with No team last", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: new Map(),
      days: buildDays(),
      teams: [
        buildTeam({ id: null, minimum: null, name: "No team", size: 2 }),
        buildTeam({ id: "team-ops", name: "Operations" }),
        buildTeam(),
      ],
    });
    expect(map.rows.map((row) => row.teamName)).toEqual([
      "Customer support",
      "Operations",
      "No team",
    ]);
    expect(map.days.map((day) => day.dateKey)).toEqual(DATE_KEYS);
    expect(map.days[0]).not.toHaveProperty("fullDayHolidayForAllLocations");
  });

  it("marks short, at minimum and covered days against the minimum", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: awayCounts({
        "team-support": { "2026-10-09": 2, "2026-10-12": 1 },
      }),
      days: buildDays(),
      teams: [buildTeam()],
    });
    expect(map.rows[0]?.cells.slice(0, 3)).toEqual([
      {
        awayCount: 2,
        dateKey: "2026-10-09",
        inCount: 1,
        shortBy: 1,
        state: "short",
      },
      {
        awayCount: 1,
        dateKey: "2026-10-12",
        inCount: 2,
        shortBy: 0,
        state: "at_minimum",
      },
      {
        awayCount: 0,
        dateKey: "2026-10-13",
        inCount: 3,
        shortBy: 0,
        state: "covered",
      },
    ]);
  });

  it("uses the peak rule when a team has no minimum", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: awayCounts({
        [NO_TEAM_KEY]: { "2026-10-09": 2, "2026-10-12": 1 },
      }),
      days: buildDays(),
      teams: [buildTeam({ id: null, minimum: null, name: "No team", size: 5 })],
    });
    expect(PEAK_AWAY_THRESHOLD_PERCENT).toBe(20);
    // 2 of 5 away is 40%; 1 of 5 is exactly 20% and not a peak.
    expect(map.rows[0]?.cells.map((cell) => cell.state)).toEqual([
      "peak",
      "covered",
      "covered",
      "covered",
      "covered",
    ]);
  });

  it("marks full-day holidays for all locations ahead of shortfalls", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: awayCounts({ "team-support": { "2026-10-12": 3 } }),
      days: buildDays(["2026-10-12"]),
      teams: [buildTeam()],
    });
    expect(map.rows[0]?.cells[1]).toMatchObject({
      inCount: 0,
      shortBy: 0,
      state: "holiday",
    });
  });

  it("reads a minimum above team size as short every day", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: new Map(),
      days: buildDays(),
      teams: [buildTeam({ minimum: 5, size: 3 })],
    });
    expect(
      map.rows[0]?.cells.map(({ shortBy, state }) => [state, shortBy])
    ).toEqual(Array.from({ length: 5 }, () => ["short", 2]));
  });

  it("never reports fewer than zero people in", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: awayCounts({ "team-support": { "2026-10-09": 9 } }),
      days: buildDays(),
      teams: [buildTeam()],
    });
    expect(map.rows[0]?.cells[0]).toMatchObject({ inCount: 0, shortBy: 2 });
  });

  it("reports the earliest issue, ties broken by team name", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: awayCounts({
        "team-ops": { "2026-10-12": 2, "2026-10-13": 2 },
        "team-support": { "2026-10-13": 2 },
        [NO_TEAM_KEY]: { "2026-10-12": 2 },
      }),
      days: buildDays(),
      teams: [
        buildTeam(),
        buildTeam({ id: "team-ops", name: "Operations" }),
        buildTeam({ id: null, minimum: null, name: "No team", size: 4 }),
      ],
    });
    expect(map.firstIssue).toEqual({
      dateKey: "2026-10-12",
      inCount: 2,
      minimum: null,
      state: "peak",
      teamName: "No team",
      teamSize: 4,
    });
  });

  it("reports no issue when every team is covered", () => {
    const map = buildCoverageMap({
      awayByTeamAndDay: new Map(),
      days: buildDays(),
      teams: [buildTeam()],
    });
    expect(map.firstIssue).toBeNull();
  });
});
