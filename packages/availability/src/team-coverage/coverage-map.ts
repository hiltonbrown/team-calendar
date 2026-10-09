import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  dayOfWeekOfDateKey,
  zonedStartOfDay,
} from "@repo/core";
import { availability_record_type } from "@repo/database/generated/enums";
import type { CalendarEvent } from "../calendar/calendar-service";

/** A team without a minimum is at peak when more than this share is away. */
export const PEAK_AWAY_THRESHOLD_PERCENT = 20;

/** Key used in away counts for people in scope without a team. */
export const NO_TEAM_KEY = "none";

export const COVERAGE_WORKING_DAY_COUNT = 5;

/** Record types that leave the person available ("in"). */
const IN_RECORD_TYPES: ReadonlySet<string> = new Set<availability_record_type>([
  "alternative_contact",
  "limited_availability",
  "wfh",
]);

/** Every record type that counts as away; the complement of the "in" types. */
export const AWAY_RECORD_TYPES: readonly availability_record_type[] =
  Object.values(availability_record_type).filter(
    (recordType) => !IN_RECORD_TYPES.has(recordType)
  );

/**
 * Approved records that take a person away. Working from home, limited
 * availability, alternative contacts and private records count as in.
 */
export function isAwayEvent(
  event: Pick<CalendarEvent, "approvalStatus" | "recordType">
): boolean {
  return (
    event.approvalStatus === "approved" &&
    event.recordType !== "private" &&
    !IN_RECORD_TYPES.has(event.recordType)
  );
}

/** Keeps the first event for each person. */
export function dedupeEventsByPerson<
  TEvent extends Pick<CalendarEvent, "personId">,
>(events: readonly TEvent[]): TEvent[] {
  const byPerson = new Map<string, TEvent>();
  for (const event of events) {
    if (!byPerson.has(event.personId)) {
      byPerson.set(event.personId, event);
    }
  }
  return [...byPerson.values()];
}

export type CoverageCellState =
  | "at_minimum"
  | "covered"
  | "holiday"
  | "peak"
  | "short";

export interface CoverageCell {
  awayCount: number;
  dateKey: string;
  inCount: number;
  /** 0 unless the state is "short". */
  shortBy: number;
  state: CoverageCellState;
}

export interface CoverageRow {
  cells: CoverageCell[];
  minimum: number | null;
  /** null for the "No team" row. */
  teamId: string | null;
  teamName: string;
  teamSize: number;
}

export interface CoverageDay {
  date: Date;
  dateKey: string;
  isToday: boolean;
}

export interface CoverageIssue {
  dateKey: string;
  inCount: number;
  minimum: number | null;
  state: "peak" | "short";
  teamName: string;
  teamSize: number;
}

export interface CoverageMap {
  days: CoverageDay[];
  firstIssue: CoverageIssue | null;
  rows: CoverageRow[];
}

export interface CoverageMapDay extends CoverageDay {
  /** A full-day, non-working public holiday applies to every location. */
  fullDayHolidayForAllLocations: boolean;
}

export interface CoverageMapTeam {
  /** null for the "No team" row. */
  id: string | null;
  minimum: number | null;
  name: string;
  size: number;
}

export interface BuildCoverageMapInput {
  /** teamId (NO_TEAM_KEY for no team) to dateKey to people away. */
  awayByTeamAndDay: ReadonlyMap<string, ReadonlyMap<string, number>>;
  days: readonly CoverageMapDay[];
  teams: readonly CoverageMapTeam[];
}

/** The next working days (Monday to Friday) from `today`, in `timezone`. */
export function nextWorkingDays(
  today: Date,
  timezone: string,
  count: number = COVERAGE_WORKING_DAY_COUNT
): CoverageDay[] {
  const todayKey = dateKeyInTimeZone(today, timezone);
  const days: CoverageDay[] = [];
  for (let dateKey = todayKey; days.length < count; ) {
    const dayOfWeek = dayOfWeekOfDateKey(dateKey);
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push({
        date: zonedStartOfDay(dateKey, timezone),
        dateKey,
        isToday: dateKey === todayKey,
      });
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }
  return days;
}

/** Rows sorted by team name with "No team" last, and the first shortfall. */
export function buildCoverageMap(input: BuildCoverageMapInput): CoverageMap {
  const rows = [...input.teams].sort(compareTeams).map((team) => ({
    cells: input.days.map((day) =>
      toCell(
        team,
        day,
        input.awayByTeamAndDay.get(team.id ?? NO_TEAM_KEY)?.get(day.dateKey) ??
          0
      )
    ),
    minimum: team.minimum,
    teamId: team.id,
    teamName: team.name,
    teamSize: team.size,
  }));
  return {
    days: input.days.map(({ date, dateKey, isToday }) => ({
      date,
      dateKey,
      isToday,
    })),
    firstIssue: findFirstIssue(rows, input.days),
    rows,
  };
}

function toCell(
  team: CoverageMapTeam,
  day: CoverageMapDay,
  awayCount: number
): CoverageCell {
  const inCount = Math.max(0, team.size - awayCount);
  const cell = { awayCount, dateKey: day.dateKey, inCount, shortBy: 0 };
  if (day.fullDayHolidayForAllLocations) {
    return { ...cell, state: "holiday" };
  }
  if (team.minimum !== null) {
    if (inCount < team.minimum) {
      return { ...cell, shortBy: team.minimum - inCount, state: "short" };
    }
    return {
      ...cell,
      state: inCount === team.minimum ? "at_minimum" : "covered",
    };
  }
  const isPeak =
    team.size > 0 && awayCount * 100 > team.size * PEAK_AWAY_THRESHOLD_PERCENT;
  return { ...cell, state: isPeak ? "peak" : "covered" };
}

/** The earliest short or peak cell, ties broken by team name. */
function findFirstIssue(
  rows: readonly CoverageRow[],
  days: readonly CoverageMapDay[]
): CoverageIssue | null {
  for (const [dayIndex, day] of days.entries()) {
    let issue: CoverageIssue | null = null;
    for (const row of rows) {
      const cell = row.cells[dayIndex];
      if (!(cell && (cell.state === "short" || cell.state === "peak"))) {
        continue;
      }
      if (issue && issue.teamName.localeCompare(row.teamName) <= 0) {
        continue;
      }
      issue = {
        dateKey: day.dateKey,
        inCount: cell.inCount,
        minimum: row.minimum,
        state: cell.state,
        teamName: row.teamName,
        teamSize: row.teamSize,
      };
    }
    if (issue) {
      return issue;
    }
  }
  return null;
}

function compareTeams(first: CoverageMapTeam, second: CoverageMapTeam): number {
  if ((first.id === null) !== (second.id === null)) {
    return first.id === null ? 1 : -1;
  }
  return (
    first.name.localeCompare(second.name) ||
    (first.id ?? "").localeCompare(second.id ?? "")
  );
}
