import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { listForOrganisation } from "../holidays/holiday-service";

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

interface HolidayForDuration {
  archived_at: Date | null;
  assignments: Array<{
    archived_at: Date | null;
    day_classification: "non_working" | "working";
    scope_type: string;
    scope_value: string;
  }>;
  country_code: string;
  default_classification: "non_working" | "working";
  holiday_date: Date;
  region_code: string | null;
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
  holidaysByYear: Map<number, Result<HolidayForDuration[], HolidayLoadError>>;
  locationById: Map<string, DurationLocation>;
  organisation: DurationLocation | null;
}

const WORKING_DAY_START_MINUTES = 9 * 60;
const WORKING_DAY_END_MINUTES = 17 * 60;
const WORKING_DAY_MINUTES = WORKING_DAY_END_MINUTES - WORKING_DAY_START_MINUTES;

export async function computeWorkingDays(
  input: ComputeWorkingDaysInput
): Promise<Result<number, DurationError>> {
  if (input.endsAt < input.startsAt) {
    return {
      ok: false,
      error: {
        code: "invalid_range",
        message: "End date must be after start date",
      },
    };
  }

  try {
    const location = await loadDurationLocation(input);
    if (!location) {
      return {
        ok: false,
        error: {
          code: "location_not_found",
          message: "Location could not be found",
        },
      };
    }

    const timezone = location.timezone ?? "UTC";
    const startParts = getLocalDateParts(input.startsAt, timezone);
    const endParts = getLocalDateParts(input.endsAt, timezone);
    const holidayDates = loadHolidayDatesFromResults({
      location,
      locationId: input.locationId,
      timezone,
      holidayResults: await Promise.all(
        yearsBetween(startParts.year, endParts.year).map((year) =>
          listForOrganisation(
            input.clerkOrgId as ClerkOrgId,
            input.organisationId as OrganisationId,
            { year }
          )
        )
      ),
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
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to compute working days",
      },
    };
  }
}

export function workingDayYearsForInput(
  input: ComputeWorkingDaysInput,
  referenceData: Pick<WorkingDaysReferenceData, "locationById" | "organisation">
): Result<number[], DurationError> {
  if (input.endsAt < input.startsAt) {
    return {
      ok: false,
      error: {
        code: "invalid_range",
        message: "End date must be after start date",
      },
    };
  }

  const location = resolveDurationLocation(input, referenceData);
  if (!location) {
    return {
      ok: false,
      error: {
        code: "location_not_found",
        message: "Location could not be found",
      },
    };
  }

  const timezone = location.timezone ?? "UTC";
  const startParts = getLocalDateParts(input.startsAt, timezone);
  const endParts = getLocalDateParts(input.endsAt, timezone);
  return { ok: true, value: yearsBetween(startParts.year, endParts.year) };
}

export function computeWorkingDaysFromReferenceData(
  input: ComputeWorkingDaysInput,
  referenceData: WorkingDaysReferenceData
): Result<number, DurationError> {
  if (input.endsAt < input.startsAt) {
    return {
      ok: false,
      error: {
        code: "invalid_range",
        message: "End date must be after start date",
      },
    };
  }

  try {
    const location = resolveDurationLocation(input, referenceData);
    if (!location) {
      return {
        ok: false,
        error: {
          code: "location_not_found",
          message: "Location could not be found",
        },
      };
    }

    const timezone = location.timezone ?? "UTC";
    const startParts = getLocalDateParts(input.startsAt, timezone);
    const endParts = getLocalDateParts(input.endsAt, timezone);
    const holidayResults = yearsBetween(startParts.year, endParts.year).map(
      (year) =>
        referenceData.holidaysByYear.get(year) ?? {
          ok: false as const,
          error: { message: "Failed to load holidays" },
        }
    );
    const holidayDates = loadHolidayDatesFromResults({
      holidayResults,
      location,
      locationId: input.locationId,
      timezone,
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
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to compute working days",
      },
    };
  }
}

async function loadDurationLocation(input: ComputeWorkingDaysInput) {
  if (input.locationId) {
    return await database.location.findFirst({
      where: {
        ...scopedQuery(
          input.clerkOrgId as ClerkOrgId,
          input.organisationId as OrganisationId
        ),
        id: input.locationId,
      },
      select: {
        country_code: true,
        region_code: true,
        timezone: true,
      },
    });
  }

  const organisation = await database.organisation.findFirst({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      id: input.organisationId,
    },
    select: {
      country_code: true,
      timezone: true,
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
  timezone,
}: {
  holidayResults: Result<HolidayForDuration[], HolidayLoadError>[];
  location: DurationLocation | null;
  locationId: string | null;
  timezone: string;
}): Result<Set<string>, DurationError> {
  const holidayDates = new Set<string>();
  for (const result of holidayResults) {
    if (!(result.ok && location)) {
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: result.ok ? "Failed to load location" : result.error.message,
        },
      };
    }

    for (const holiday of result.value) {
      addExcludedHolidayDate({
        holiday,
        holidayDates,
        location,
        locationId,
        timezone,
      });
    }
  }

  return { ok: true, value: holidayDates };
}

function addExcludedHolidayDate({
  holiday,
  holidayDates,
  location,
  locationId,
  timezone,
}: {
  holiday: HolidayForDuration;
  holidayDates: Set<string>;
  location: DurationLocation;
  locationId: string | null;
  timezone: string;
}) {
  if (
    shouldExcludeHoliday({
      countryCode: location.country_code,
      holiday,
      locationId,
      regionCode: location.region_code,
      timezone,
    })
  ) {
    holidayDates.add(dateOnlyInTimezone(holiday.holiday_date, timezone));
  }
}

function shouldExcludeHoliday({
  countryCode,
  holiday,
  locationId,
  regionCode,
  timezone,
}: {
  countryCode: string | null;
  holiday: HolidayForDuration;
  locationId: string | null;
  regionCode: string | null;
  timezone: string;
}): boolean {
  if (holiday.archived_at) {
    return false;
  }

  const locationAssignment = holiday.assignments.find(
    (assignment) =>
      assignment.archived_at === null &&
      assignment.scope_type === "location" &&
      assignment.scope_value === locationId
  );

  if (locationAssignment) {
    return locationAssignment.day_classification === "non_working";
  }

  if (holiday.default_classification !== "non_working") {
    return false;
  }

  if (holiday.country_code === "CUSTOM") {
    return true;
  }

  if (countryCode && holiday.country_code !== countryCode) {
    return false;
  }

  if (holiday.region_code && regionCode && holiday.region_code !== regionCode) {
    return false;
  }

  if (holiday.region_code && !regionCode) {
    return false;
  }

  return Boolean(dateOnlyInTimezone(holiday.holiday_date, timezone));
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

function getLocalDateParts(date: Date, timezone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);

  const valueFor = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const year = valueFor("year");
  const month = valueFor("month");
  const day = valueFor("day");
  const hour = valueFor("hour") % 24;
  const minute = valueFor("minute");

  return {
    dateOnly: `${year}-${pad(month)}-${pad(day)}`,
    day,
    hour,
    minute,
    month,
    year,
  };
}

function dateOnlyInTimezone(date: Date, timezone: string): string {
  return getLocalDateParts(date, timezone).dateOnly;
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
