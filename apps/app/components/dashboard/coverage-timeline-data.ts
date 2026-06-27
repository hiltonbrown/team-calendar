import type { ManagerDashboardView } from "@repo/availability";

export interface CoverageDay {
  /** Number of people away that we can name (subset of awayCount). */
  awayCount: number;
  date: Date;
  /** People away beyond the named list (counts without names). */
  extraCount: number;
  names: string[];
}

export interface CoverageData {
  days: CoverageDay[];
  total: number;
}

type TeamTodayData = Extract<
  ManagerDashboardView["teamToday"],
  { status: "ready" }
>["data"];

type PeakList = Extract<
  ManagerDashboardView["upcomingPeaks"],
  { status: "ready" }
>["data"]["peaks"];

const TIMELINE_DAYS = 14;
const MAX_NAMED = 5;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Builds a 14-day coverage series from data the manager view already has. Day 0
 * is today's real away count (with the names we hold from "needs attention");
 * future days are populated from real forecast peaks (upcomingPeaks). Days with
 * no data render as a neutral baseline: no peak is forecast, not a claim that
 * everyone is in. Full per-day enrichment for the fortnight is a follow-up.
 */
export function buildCoverageDays(
  teamToday: TeamTodayData,
  peaks: PeakList | null
): CoverageData {
  const total =
    teamToday.peopleAvailableCount +
    teamToday.peopleOnLeaveCount +
    teamToday.peopleWorkingFromHomeCount +
    teamToday.peopleTravellingCount +
    teamToday.peopleOtherOooCount;

  const todayAway =
    teamToday.peopleOnLeaveCount +
    teamToday.peopleWorkingFromHomeCount +
    teamToday.peopleTravellingCount +
    teamToday.peopleOtherOooCount;

  const todayNames = teamToday.peopleNeedingAttention
    .map((person) => `${person.personFirstName} ${person.personLastName}`)
    .slice(0, MAX_NAMED);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const days: CoverageDay[] = [];
  for (let offset = 0; offset < TIMELINE_DAYS; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);

    if (offset === 0) {
      days.push({
        awayCount: todayAway,
        date,
        extraCount: Math.max(0, todayAway - todayNames.length),
        names: todayNames,
      });
      continue;
    }

    const peak = peaks?.find((entry) => isSameDay(entry.date, date)) ?? null;
    days.push({
      awayCount: peak?.peopleAwayCount ?? 0,
      date,
      extraCount: peak?.peopleAwayCount ?? 0,
      names: [],
    });
  }

  return { days, total };
}
