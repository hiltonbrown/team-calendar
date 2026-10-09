import { appError, dateKeyOfUtcDate, type Result } from "@repo/core";
import {
  countAwayPeopleByTeamAndDay,
  listTeamsWithCoverageMinimum,
} from "@repo/database/queries/teams";
import type { CalendarDay, CalendarRange } from "../calendar/calendar-service";
import {
  AWAY_RECORD_TYPES,
  buildCoverageMap,
  type CoverageMap,
  type CoverageMapTeam,
  dedupeEventsByPerson,
  isAwayEvent,
  NO_TEAM_KEY,
  nextWorkingDays,
} from "./coverage-map";

export const NO_TEAM_NAME = "No team";

export interface LoadManagerCoverageInput {
  clerkOrgId: string;
  organisationId: string;
  /**
   * The manager's `my_team` week ranges (approved records) covering the next
   * five working days, usually this week and next week.
   */
  ranges: readonly CalendarRange[];
  today: Date;
}

/**
 * Coverage for the teams of the people in the manager's scope. Team size and
 * away counts cover each team's full active headcount through counts-only
 * reads; the "No team" row uses only the people in scope.
 */
export async function loadManagerCoverage(
  input: LoadManagerCoverageInput
): Promise<Result<CoverageMap>> {
  const timezone = input.ranges[0]?.range.timezone;
  if (!timezone) {
    return {
      error: appError("bad_request", "A calendar range is required"),
      ok: false,
    };
  }
  const days = nextWorkingDays(input.today, timezone);
  const calendarDays = new Map<string, CalendarDay>();
  const scopePeople = new Map<string, string | null>();
  for (const range of input.ranges) {
    for (const day of range.days) {
      calendarDays.set(dateKeyOfUtcDate(day.date), day);
    }
    for (const person of range.people) {
      scopePeople.set(person.id, person.teamId);
    }
  }
  const scopeTeamIds = new Set(
    [...scopePeople.values()].filter((teamId) => teamId !== null)
  );
  const noTeamPeople = new Set(
    [...scopePeople.entries()]
      .filter(([, teamId]) => teamId === null)
      .map(([personId]) => personId)
  );

  const teamsResult = await listTeamsWithCoverageMinimum({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId,
  });
  if (!teamsResult.ok) {
    return teamsResult;
  }
  const teams: CoverageMapTeam[] = teamsResult.value
    .filter((team) => scopeTeamIds.has(team.id))
    .map((team) => ({
      id: team.id,
      minimum: team.minimumAvailablePeople,
      name: team.name,
      size: team.activePeopleCount,
    }));

  const from = days[0]?.dateKey;
  const to = days.at(-1)?.dateKey;
  if (!(from && to)) {
    return { error: appError("internal", "No working days found"), ok: false };
  }
  const awayResult = await countAwayPeopleByTeamAndDay({
    awayRecordTypes: AWAY_RECORD_TYPES,
    clerkOrgId: input.clerkOrgId,
    from,
    organisationId: input.organisationId,
    teamIds: teams.flatMap((team) => (team.id ? [team.id] : [])),
    timezone,
    to,
  });
  if (!awayResult.ok) {
    return awayResult;
  }
  const awayByTeamAndDay = new Map<string, ReadonlyMap<string, number>>(
    awayResult.value
  );

  if (noTeamPeople.size > 0) {
    teams.push({
      id: null,
      minimum: null,
      name: NO_TEAM_NAME,
      size: noTeamPeople.size,
    });
    awayByTeamAndDay.set(
      NO_TEAM_KEY,
      new Map(
        days.map((day) => [
          day.dateKey,
          dedupeEventsByPerson(
            (calendarDays.get(day.dateKey)?.events ?? []).filter(
              (event) => noTeamPeople.has(event.personId) && isAwayEvent(event)
            )
          ).length,
        ])
      )
    );
  }

  return {
    ok: true,
    value: buildCoverageMap({
      awayByTeamAndDay,
      days: days.map((day) => ({
        ...day,
        fullDayHolidayForAllLocations: (
          calendarDays.get(day.dateKey)?.publicHolidays ?? []
        ).some(
          (holiday) =>
            holiday.startsAt === null && holiday.appliesToAllLocationsInView
        ),
      })),
      teams,
    }),
  };
}
