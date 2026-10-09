import type { Result } from "@repo/core";
import {
  addDaysToDateKey,
  appError,
  dateKeysBetween,
  recordFallsOnDay,
  recordQueryWindow,
  zonedStartOfDay,
} from "@repo/core";
import { z } from "zod";
import type { availability_record_type } from "../../generated/enums";
import { type Database, database } from "../client";
import { scopedTo } from "../tenant-query";

interface TenantScope {
  clerkOrgId: string;
  organisationId: string;
}

export interface TeamCoverageMinimumRow {
  activePeopleCount: number;
  id: string;
  minimumAvailablePeople: number | null;
  name: string;
}

export interface TeamCoverageMinimumChange {
  after: number | null;
  before: number | null;
  teamId: string;
  teamName: string;
}

/** Either the shared client or a transaction client; only `team` is used. */
export type TeamCoverageMinimumClient = Pick<Database, "team">;

const activePersonFilter = { archived_at: null, is_active: true } as const;

/**
 * Lists the organisation's teams with their coverage minimum and active
 * headcount (people not archived and marked active).
 */
export async function listTeamsWithCoverageMinimum(
  input: TenantScope
): Promise<Result<TeamCoverageMinimumRow[]>> {
  try {
    const scope = scopedTo(input);
    const teams = await database.team.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        _count: {
          select: { people: { where: { ...scope, ...activePersonFilter } } },
        },
        id: true,
        minimum_available_people: true,
        name: true,
      },
      where: scope,
    });
    return {
      ok: true,
      value: teams.map((team) => ({
        activePeopleCount: team._count.people,
        id: team.id,
        minimumAvailablePeople: team.minimum_available_people,
        name: team.name,
      })),
    };
  } catch {
    return {
      error: appError("internal", "Failed to list teams"),
      ok: false,
    };
  }
}

/**
 * Sets or clears (null) one team's coverage minimum. Pass a transaction client
 * to update inside a caller's transaction. A team outside both tenancy keys is
 * reported as not found and left unchanged.
 */
export async function setTeamCoverageMinimum(
  input: TenantScope & { minimum: number | null; teamId: string },
  client: TeamCoverageMinimumClient = database
): Promise<Result<TeamCoverageMinimumChange>> {
  try {
    const where = { ...scopedTo(input), id: input.teamId };
    const team = await client.team.findFirst({
      select: { id: true, minimum_available_people: true, name: true },
      where,
    });
    if (!team) {
      return { error: appError("not_found", "Team not found"), ok: false };
    }
    const updated = await client.team.updateMany({
      data: { minimum_available_people: input.minimum },
      where,
    });
    if (updated.count !== 1) {
      return { error: appError("not_found", "Team not found"), ok: false };
    }
    return {
      ok: true,
      value: {
        after: input.minimum,
        before: team.minimum_available_people,
        teamId: team.id,
        teamName: team.name,
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to update team coverage minimum"),
      ok: false,
    };
  }
}

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const AwayCountInputSchema = z
  .object({
    from: dateKeySchema,
    to: dateKeySchema,
  })
  .refine((value) => value.from <= value.to);

/** Away people per team, keyed teamId then dateKey ("2026-10-12"). */
export type AwayPeopleByTeamAndDay = Map<string, Map<string, number>>;

/**
 * Counts, for each team and each day from `from` to `to` inclusive (days in
 * `timezone`), the active people in that team with an approved, non-archived
 * record of one of `awayRecordTypes` overlapping the day. Each person counts
 * at most once per day. Returns numbers only, never names or record details.
 */
export async function countAwayPeopleByTeamAndDay(
  input: TenantScope & {
    awayRecordTypes: readonly availability_record_type[];
    from: string;
    teamIds: readonly string[];
    timezone: string;
    to: string;
  }
): Promise<Result<AwayPeopleByTeamAndDay>> {
  if (!AwayCountInputSchema.safeParse(input).success) {
    return {
      error: appError("bad_request", "Invalid date range"),
      ok: false,
    };
  }
  try {
    const days = dateKeysBetween(input.from, input.to).map((dateKey) => ({
      dateKey,
      end: zonedStartOfDay(addDaysToDateKey(dateKey, 1), input.timezone),
      start: zonedStartOfDay(dateKey, input.timezone),
    }));
    const counts: AwayPeopleByTeamAndDay = new Map(
      input.teamIds.map((teamId) => [
        teamId,
        new Map(days.map((day) => [day.dateKey, 0])),
      ])
    );
    if (
      days.length === 0 ||
      input.teamIds.length === 0 ||
      input.awayRecordTypes.length === 0
    ) {
      return { ok: true, value: counts };
    }
    const window = recordQueryWindow(input.from, input.to, input.timezone);
    const scope = scopedTo(input);
    const records = await database.availabilityRecord.findMany({
      select: {
        all_day: true,
        ends_at: true,
        person: { select: { team_id: true } },
        person_id: true,
        starts_at: true,
      },
      where: {
        ...scope,
        approval_status: "approved",
        archived_at: null,
        ends_at: { gte: window.start },
        person: {
          ...scope,
          ...activePersonFilter,
          team_id: { in: [...input.teamIds] },
        },
        record_type: { in: [...input.awayRecordTypes] },
        starts_at: { lt: window.end },
      },
    });
    const awayPeople = new Map<string, Set<string>>();
    for (const record of records) {
      const teamId = record.person.team_id;
      if (!teamId) {
        continue;
      }
      for (const day of days) {
        if (
          recordFallsOnDay(
            {
              allDay: record.all_day,
              endsAt: record.ends_at,
              startsAt: record.starts_at,
            },
            day
          )
        ) {
          const key = `${teamId}|${day.dateKey}`;
          const people = awayPeople.get(key) ?? new Set<string>();
          people.add(record.person_id);
          awayPeople.set(key, people);
          counts.get(teamId)?.set(day.dateKey, people.size);
        }
      }
    }
    return { ok: true, value: counts };
  } catch {
    return {
      error: appError("internal", "Failed to count people away"),
      ok: false,
    };
  }
}
