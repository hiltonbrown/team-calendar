import { appError, dateKeyOfUtcDate, type Result } from "@repo/core";
import {
  assertTenantDb,
  resolveAccountCompanies,
  type TenantDb,
} from "@repo/database";
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
  companyIds?: string[];
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
  input: LoadManagerCoverageInput,
  db: TenantDb
): Promise<Result<CoverageMap>> {
  assertTenantDb(db, input.clerkOrgId);
  {
    assertTenantDb(db, input.clerkOrgId);
    const client = db;

    const timezone = input.ranges[0]?.range.timezone;
    if (!timezone) {
      return {
        error: appError("bad_request", "A calendar range is required"),
        ok: false,
      };
    }
    const days = nextWorkingDays(input.today, timezone);
    const { calendarDays, scopeTeamIds, noTeamPeople } = coverageRangeIndex(
      input.ranges
    );
    const companies = await resolveAccountCompanies(input.clerkOrgId, client);
    const companyIds = input.companyIds ?? [
      ...new Set(
        input.ranges.flatMap((range) =>
          range.people.map((person) => person.companyId)
        )
      ),
    ];
    if (
      companyIds.some((id) => !companies.some((company) => company.id === id))
    ) {
      return {
        error: appError("bad_request", "Company filter is invalid"),
        ok: false,
      };
    }
    const teamsResult = await coverageTeams(
      input.clerkOrgId,
      companyIds,
      companies,
      scopeTeamIds,
      client
    );
    if (!teamsResult.ok) {
      return teamsResult;
    }
    const teams = teamsResult.value;
    const from = days[0]?.dateKey;
    const to = days.at(-1)?.dateKey;
    if (!(from && to)) {
      return {
        error: appError("internal", "No working days found"),
        ok: false,
      };
    }
    const awayByTeamAndDay = new Map<string, ReadonlyMap<string, number>>();
    for (const companyId of companyIds) {
      const result = await countAwayPeopleByTeamAndDay(
        {
          awayRecordTypes: AWAY_RECORD_TYPES,
          clerkOrgId: input.clerkOrgId,
          from,
          organisationId: companyId,
          teamIds: teams.flatMap((team) => (team.id ? [team.id] : [])),
          timezone,
          to,
        },
        client
      );
      if (!result.ok) {
        return result;
      }
      for (const [teamId, counts] of result.value) {
        awayByTeamAndDay.set(teamId, counts);
      }
    }

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
                (event) =>
                  noTeamPeople.has(event.personId) && isAwayEvent(event)
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
}

function coverageRangeIndex(ranges: LoadManagerCoverageInput["ranges"]) {
  const calendarDays = new Map<string, CalendarDay>();
  const scopePeople = new Map<string, string | null>();
  for (const range of ranges) {
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

  return { calendarDays, noTeamPeople, scopeTeamIds };
}

async function coverageTeams(
  clerkOrgId: string,
  companyIds: string[],
  companies: Awaited<ReturnType<typeof resolveAccountCompanies>>,
  scopeTeamIds: Set<string>,
  client: TenantDb
): Promise<Result<CoverageMapTeam[]>> {
  const teams: CoverageMapTeam[] = [];
  for (const company of companies.filter((preparedCompany) =>
    companyIds.includes(preparedCompany.id)
  )) {
    const result = await listTeamsWithCoverageMinimum(
      { clerkOrgId, organisationId: company.id },
      client
    );
    if (!result.ok) {
      return result;
    }
    teams.push(
      ...result.value
        .filter((team) => scopeTeamIds.has(team.id))
        .map((team) => ({
          id: team.id,
          minimum: team.minimumAvailablePeople,
          name:
            companyIds.length > 1
              ? `${team.name} (${company.name})`
              : team.name,
          size: team.activePeopleCount,
        }))
    );
  }
  return { ok: true, value: teams };
}
