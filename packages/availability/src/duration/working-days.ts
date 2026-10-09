import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import {
  nonWorkingHolidayDates,
  type ResolvedPublicHoliday,
  resolvePublicHolidays,
} from "../holidays/resolve-public-holidays";

export type DurationError =
  | { code: "invalid_range"; message: string }
  | { code: "location_not_found"; message: string }
  | { code: "unknown_error"; message: string };

export interface ComputeWorkingDaysInput {
  allDay: boolean;
  clerkOrgId: string;
  endsAt: Date;
  locationId: string | null;
  organisationId: string;
  startsAt: Date;
}

interface LocalDateParts {
  dateOnly: string;
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}

interface DurationLocation {
  country_code: string | null;
  region_code: string | null;
  timezone: string | null;
}

interface HolidayLoadError {
  message: string;
}

export interface WorkingDaysReferenceData {
  holidaysByYear: Map<
    number,
    Result<ResolvedPublicHoliday[], HolidayLoadError>
  >;
  locationById: Map<string, DurationLocation>;
  organisation: DurationLocation | null;
}
export async function loadWorkingDaysReferenceData(
  inputs: ComputeWorkingDaysInput[]
): Promise<WorkingDaysReferenceData> {
  const [first] = inputs;
  if (!first) {
    return {
      holidaysByYear: new Map(),
      locationById: new Map(),
      organisation: null,
    };
  }
  const scoped = scopedQuery(
    first.clerkOrgId as ClerkOrgId,
    first.organisationId as OrganisationId
  );
  const ids = [
    ...new Set(
      inputs
        .map(({ locationId }) => locationId)
        .filter((id): id is string => id !== null)
    ),
  ];
  const [locations, organisation] = await Promise.all([
    ids.length
      ? database.location.findMany({
          select: {
            country_code: true,
            id: true,
            region_code: true,
            timezone: true,
          },
          where: { ...scoped, id: { in: ids } },
        })
      : Promise.resolve([]),
    database.organisation.findFirst({
      select: { country_code: true, timezone: true },
      where: {
        archived_at: null,
        clerk_org_id: scoped.clerk_org_id,
        id: scoped.organisation_id,
      },
    }),
  ]);
  const locationById = new Map(
    locations.map(({ id, ...location }) => [id, location])
  );
  const organisationLocation = organisation
    ? {
        country_code: organisation.country_code,
        region_code: null,
        timezone: organisation.timezone,
      }
    : null;
  const years = new Set<number>();
  for (const item of inputs) {
    const result = workingDayYearsForInput(item, {
      locationById,
      organisation: organisationLocation,
    });
    if (result.ok) {
      for (const year of result.value) {
        years.add(year);
      }
    }
  }
  return {
    holidaysByYear: await loadHolidaysForYears(
      first.clerkOrgId as ClerkOrgId,
      first.organisationId as OrganisationId,
      years
    ),
    locationById,
    organisation: organisationLocation,
  };
}

/**
 * Resolves holidays for every requested year from one tenant load, keyed by
 * year. A failure applies to every year.
 */
export async function loadHolidaysForYears(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  years: Iterable<number>
): Promise<Map<number, Result<ResolvedPublicHoliday[], HolidayLoadError>>> {
  const sorted = [...new Set(years)].sort((left, right) => left - right);
  const [first] = sorted;
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) {
    return new Map();
  }
  const result = await resolvePublicHolidays({
    clerkOrgId,
    from: `${first}-01-01`,
    organisationId,
    to: `${last}-12-31`,
  });
  return new Map(
    sorted.map((year) => [
      year,
      result.ok
        ? {
            ok: true,
            value: result.value.filter((holiday) =>
              holiday.date.startsWith(`${year}-`)
            ),
          }
        : result,
    ])
  );
}

const WORKING_DAY_START_MINUTES = 9 * 60;
const WORKING_DAY_END_MINUTES = 17 * 60;
const WORKING_DAY_MINUTES = WORKING_DAY_END_MINUTES - WORKING_DAY_START_MINUTES;

export async function computeWorkingDays(
  input: ComputeWorkingDaysInput
): Promise<Result<number, DurationError>> {
  if (input.endsAt < input.startsAt) {
    return {
      error: {
        code: "invalid_range",
        message: "End date must be after start date",
      },
      ok: false,
    };
  }

  try {
    const location = await loadDurationLocation(input);
    if (!location) {
      return {
        error: {
          code: "location_not_found",
          message: "Location could not be found",
        },
        ok: false,
      };
    }

    const startParts = getStoredWallClockParts(input.startsAt);
    const endParts = getStoredWallClockParts(input.endsAt);
    const holidayDates = loadHolidayDatesFromResults({
      holidayResults: [
        ...(
          await loadHolidaysForYears(
            input.clerkOrgId as ClerkOrgId,
            input.organisationId as OrganisationId,
            yearsBetween(startParts.year, endParts.year)
          )
        ).values(),
      ],
      location,
      locationId: input.locationId,
    });

    if (!holidayDates.ok) {
      return holidayDates;
    }

    let duration = 0;
    for (const dateOnly of dateRange(startParts.dateOnly, endParts.dateOnly)) {
      if (!(isWeekday(dateOnly) && !holidayDates.value.has(dateOnly))) {
        continue;
      }

      if (input.allDay) {
        duration += 1;
        continue;
      }

      duration += fractionalWorkingDay(dateOnly, startParts, endParts);
    }

    return { ok: true, value: roundHalfUpToQuarter(duration) };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to compute working days",
      },
      ok: false,
    };
  }
}

export function workingDayYearsForInput(
  input: ComputeWorkingDaysInput,
  referenceData: Pick<WorkingDaysReferenceData, "locationById" | "organisation">
): Result<number[], DurationError> {
  if (input.endsAt < input.startsAt) {
    return {
      error: {
        code: "invalid_range",
        message: "End date must be after start date",
      },
      ok: false,
    };
  }

  const location = resolveDurationLocation(input, referenceData);
  if (!location) {
    return {
      error: {
        code: "location_not_found",
        message: "Location could not be found",
      },
      ok: false,
    };
  }

  const startParts = getStoredWallClockParts(input.startsAt);
  const endParts = getStoredWallClockParts(input.endsAt);
  return { ok: true, value: yearsBetween(startParts.year, endParts.year) };
}

export function computeWorkingDaysFromReferenceData(
  input: ComputeWorkingDaysInput,
  referenceData: WorkingDaysReferenceData
): Result<number, DurationError> {
  if (input.endsAt < input.startsAt) {
    return {
      error: {
        code: "invalid_range",
        message: "End date must be after start date",
      },
      ok: false,
    };
  }

  try {
    const location = resolveDurationLocation(input, referenceData);
    if (!location) {
      return {
        error: {
          code: "location_not_found",
          message: "Location could not be found",
        },
        ok: false,
      };
    }

    const startParts = getStoredWallClockParts(input.startsAt);
    const endParts = getStoredWallClockParts(input.endsAt);
    const holidayResults = yearsBetween(startParts.year, endParts.year).map(
      (year) =>
        referenceData.holidaysByYear.get(year) ?? {
          error: { message: "Failed to load holidays" },
          ok: false as const,
        }
    );
    const holidayDates = loadHolidayDatesFromResults({
      holidayResults,
      location,
      locationId: input.locationId,
    });

    if (!holidayDates.ok) {
      return holidayDates;
    }

    let duration = 0;
    for (const dateOnly of dateRange(startParts.dateOnly, endParts.dateOnly)) {
      if (!(isWeekday(dateOnly) && !holidayDates.value.has(dateOnly))) {
        continue;
      }

      if (input.allDay) {
        duration += 1;
        continue;
      }

      duration += fractionalWorkingDay(dateOnly, startParts, endParts);
    }

    return { ok: true, value: roundHalfUpToQuarter(duration) };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to compute working days",
      },
      ok: false,
    };
  }
}

async function loadDurationLocation(input: ComputeWorkingDaysInput) {
  if (input.locationId) {
    return await database.location.findFirst({
      select: {
        country_code: true,
        region_code: true,
        timezone: true,
      },
      where: {
        ...scopedQuery(
          input.clerkOrgId as ClerkOrgId,
          input.organisationId as OrganisationId
        ),
        id: input.locationId,
      },
    });
  }

  const organisation = await database.organisation.findFirst({
    select: {
      country_code: true,
      timezone: true,
    },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      id: input.organisationId,
    },
  });
  return organisation
    ? {
        country_code: organisation.country_code,
        region_code: null,
        timezone: organisation.timezone,
      }
    : null;
}

function resolveDurationLocation(
  input: ComputeWorkingDaysInput,
  referenceData: Pick<WorkingDaysReferenceData, "locationById" | "organisation">
): DurationLocation | null {
  if (input.locationId) {
    return referenceData.locationById.get(input.locationId) ?? null;
  }
  return referenceData.organisation;
}

function loadHolidayDatesFromResults({
  holidayResults,
  location,
  locationId,
}: {
  holidayResults: Result<ResolvedPublicHoliday[], HolidayLoadError>[];
  location: DurationLocation | null;
  locationId: string | null;
}): Result<Set<string>, DurationError> {
  const holidayDates = new Set<string>();
  for (const result of holidayResults) {
    if (!(result.ok && location)) {
      return {
        error: {
          code: "unknown_error",
          message: result.ok ? "Failed to load location" : result.error.message,
        },
        ok: false,
      };
    }
    for (const dateOnly of nonWorkingHolidayDates(result.value, locationId)) {
      holidayDates.add(dateOnly);
    }
  }

  return { ok: true, value: holidayDates };
}

function fractionalWorkingDay(
  dateOnly: string,
  startParts: LocalDateParts,
  endParts: LocalDateParts
): number {
  const coveredStart =
    dateOnly === startParts.dateOnly
      ? startParts.hour * 60 + startParts.minute
      : 0;
  const coveredEnd =
    dateOnly === endParts.dateOnly
      ? endParts.hour * 60 + endParts.minute
      : 24 * 60;
  const overlapStart = Math.max(coveredStart, WORKING_DAY_START_MINUTES);
  const overlapEnd = Math.min(coveredEnd, WORKING_DAY_END_MINUTES);
  const minutes = Math.max(0, overlapEnd - overlapStart);
  return minutes / WORKING_DAY_MINUTES;
}

function getStoredWallClockParts(date: Date): LocalDateParts {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();

  return {
    dateOnly: `${year}-${pad(month)}-${pad(day)}`,
    day,
    hour,
    minute,
    month,
    year,
  };
}

function yearsBetween(startYear: number, endYear: number): number[] {
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
}

function dateRange(startDateOnly: string, endDateOnly: string): string[] {
  const dates: string[] = [];
  let cursor = dateOnlyToUtcDate(startDateOnly);
  const end = dateOnlyToUtcDate(endDateOnly);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  return dates;
}

function dateOnlyToUtcDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function isWeekday(dateOnly: string): boolean {
  const day = dateOnlyToUtcDate(dateOnly).getUTCDay();
  return day >= 1 && day <= 5;
}

function roundHalfUpToQuarter(value: number): number {
  return Math.floor(value * 4 + 0.5) / 4;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
