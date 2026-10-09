import {
  appError,
  type ClerkOrgId,
  isCountryCode,
  type OrganisationId,
  type Result,
  startOfUtcDay,
  toDateOnly,
} from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import {
  type ListReferenceHolidays,
  listReferenceHolidays,
  type ReferenceHolidayKind,
} from "./reference/reference-holidays";

export type HolidayClassification = "non_working" | "working";
export type HolidayPreferenceSetting = "hidden" | HolidayClassification;

export interface ResolvedPublicHoliday {
  area: string | null;
  classification: HolidayClassification;
  /** YYYY-MM-DD. */
  date: string;
  /** Only true when includeHidden was requested. */
  hidden: boolean;
  /** Bundled reference id, or "custom:<public_holidays.id>". */
  key: string;
  kind: ReferenceHolidayKind | "custom";
  /** null is the organisation level, used for people without a location. */
  locationId: string | null;
  name: string;
  origin: "custom" | "official";
  startsAt: string | null;
}

interface Jurisdiction {
  countryCode: string | null;
  regionCode: string | null;
}

export interface ResolveHolidayData {
  customHolidays: ReadonlyArray<{
    countryCode: string;
    date: string;
    defaultClassification: HolidayClassification;
    id: string;
    name: string;
    regionCode: string | null;
  }>;
  from: string;
  locations: ReadonlyArray<Jurisdiction & { id: string }>;
  organisation: Jurisdiction;
  preferences: ReadonlyArray<{
    holidayKey: string;
    locationId: string | null;
    setting: HolidayPreferenceSetting;
  }>;
  to: string;
}

interface ResolveOptions {
  includeHidden?: boolean;
}

export const CUSTOM_HOLIDAY_KEY_PREFIX = "custom:";

export function customHolidayKey(publicHolidayId: string): string {
  return `${CUSTOM_HOLIDAY_KEY_PREFIX}${publicHolidayId}`;
}

/**
 * A location uses its own country and region. Without a region it borrows the
 * organisation's, unless the location is in a different country, in which
 * case only national holidays apply.
 */
function jurisdictionFor(
  location: Jurisdiction | null,
  organisation: Jurisdiction
): Jurisdiction {
  if (!location) {
    return organisation;
  }
  const countryCode = location.countryCode ?? organisation.countryCode;
  if (location.regionCode) {
    return { countryCode, regionCode: location.regionCode };
  }
  return {
    countryCode,
    regionCode:
      countryCode === organisation.countryCode ? organisation.regionCode : null,
  };
}

function customApplies(
  holiday: ResolveHolidayData["customHolidays"][number],
  jurisdiction: Jurisdiction
): boolean {
  if (holiday.countryCode === "CUSTOM") {
    return (
      holiday.regionCode === null ||
      holiday.regionCode === jurisdiction.regionCode
    );
  }
  return (
    holiday.countryCode === jurisdiction.countryCode &&
    (holiday.regionCode === null ||
      holiday.regionCode === jurisdiction.regionCode)
  );
}

type Preferences = ResolveHolidayData["preferences"];
interface Subject {
  jurisdiction: Jurisdiction;
  locationId: string | null;
}
type Candidate = Omit<ResolvedPublicHoliday, "classification" | "hidden">;

function locationSetting(
  preferences: Preferences,
  key: string,
  locationId: string | null
): HolidayPreferenceSetting | undefined {
  if (locationId === null) {
    return;
  }
  return preferences.find(
    (preference) =>
      preference.holidayKey === key && preference.locationId === locationId
  )?.setting;
}

/** A location row wins over an organisation-wide row. */
function effectiveSetting(
  preferences: Preferences,
  key: string,
  locationId: string | null
): HolidayPreferenceSetting | undefined {
  return (
    locationSetting(preferences, key, locationId) ??
    preferences.find(
      (preference) =>
        preference.holidayKey === key && preference.locationId === null
    )?.setting
  );
}

function applySetting(
  candidate: Candidate,
  defaultClassification: HolidayClassification,
  setting: HolidayPreferenceSetting | undefined,
  options: ResolveOptions
): ResolvedPublicHoliday | null {
  if (setting === "hidden") {
    return options.includeHidden
      ? { ...candidate, classification: defaultClassification, hidden: true }
      : null;
  }
  return {
    ...candidate,
    classification: setting ?? defaultClassification,
    hidden: false,
  };
}

function officialHolidaysFor(
  subject: Subject,
  data: ResolveHolidayData,
  listReference: ListReferenceHolidays,
  options: ResolveOptions
): ResolvedPublicHoliday[] {
  const { countryCode, regionCode } = subject.jurisdiction;
  if (!isCountryCode(countryCode)) {
    return [];
  }
  const results: ResolvedPublicHoliday[] = [];
  for (const holiday of listReference({
    country: countryCode,
    from: data.from,
    region: regionCode,
    to: data.to,
  })) {
    const candidate: Candidate = {
      area: holiday.area,
      date: holiday.date,
      key: holiday.id,
      kind: holiday.kind,
      locationId: subject.locationId,
      name: holiday.name,
      origin: "official",
      startsAt: holiday.startsAt,
    };
    if (holiday.kind === "local") {
      // Local days need an explicit location opt-in; the organisation level
      // and organisation-wide rows never switch them on.
      const optIn = locationSetting(
        data.preferences,
        holiday.id,
        subject.locationId
      );
      if (optIn === "working" || optIn === "non_working") {
        results.push({ ...candidate, classification: optIn, hidden: false });
      }
      continue;
    }
    const resolved = applySetting(
      candidate,
      holiday.kind === "part_day" ? "working" : "non_working",
      effectiveSetting(data.preferences, holiday.id, subject.locationId),
      options
    );
    if (resolved) {
      results.push(resolved);
    }
  }
  return results;
}

function customHolidaysFor(
  subject: Subject,
  data: ResolveHolidayData,
  options: ResolveOptions
): ResolvedPublicHoliday[] {
  const results: ResolvedPublicHoliday[] = [];
  for (const holiday of data.customHolidays) {
    if (
      holiday.date < data.from ||
      holiday.date > data.to ||
      !customApplies(holiday, subject.jurisdiction)
    ) {
      continue;
    }
    const key = customHolidayKey(holiday.id);
    const resolved = applySetting(
      {
        area: null,
        date: holiday.date,
        key,
        kind: "custom",
        locationId: subject.locationId,
        name: holiday.name,
        origin: "custom",
        startsAt: null,
      },
      holiday.defaultClassification,
      effectiveSetting(data.preferences, key, subject.locationId),
      options
    );
    if (resolved) {
      results.push(resolved);
    }
  }
  return results;
}

export function resolvePublicHolidaysFromData(
  data: ResolveHolidayData,
  listReference: ListReferenceHolidays = listReferenceHolidays,
  options: ResolveOptions = {}
): ResolvedPublicHoliday[] {
  const subjects: Subject[] = [
    { jurisdiction: data.organisation, locationId: null },
    ...data.locations.map((location) => ({
      jurisdiction: jurisdictionFor(location, data.organisation),
      locationId: location.id,
    })),
  ];
  return subjects
    .flatMap((subject) => [
      ...officialHolidaysFor(subject, data, listReference, options),
      ...customHolidaysFor(subject, data, options),
    ])
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.name.localeCompare(right.name)
    );
}

export interface ResolvePublicHolidaysInput {
  clerkOrgId: ClerkOrgId;
  /** Inclusive YYYY-MM-DD. */
  from: string;
  includeHidden?: boolean;
  organisationId: OrganisationId;
  /** Inclusive YYYY-MM-DD. */
  to: string;
}

export async function resolvePublicHolidays(
  input: ResolvePublicHolidaysInput,
  listReference: ListReferenceHolidays = listReferenceHolidays
): Promise<Result<ResolvedPublicHoliday[]>> {
  try {
    const scope = scopedQuery(input.clerkOrgId, input.organisationId);
    const organisation = await database.organisation.findFirst({
      select: { country_code: true, region_code: true },
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        id: input.organisationId,
      },
    });
    if (!organisation) {
      return {
        error: appError("not_found", "Organisation not found"),
        ok: false,
      };
    }
    const [locations, customHolidays, preferences] = await Promise.all([
      database.location.findMany({
        select: { country_code: true, id: true, region_code: true },
        where: scope,
      }),
      database.publicHoliday.findMany({
        select: {
          country_code: true,
          default_classification: true,
          holiday_date: true,
          id: true,
          name: true,
          region_code: true,
        },
        where: {
          ...scope,
          holiday_date: {
            gte: startOfUtcDay(input.from),
            lte: startOfUtcDay(input.to),
          },
          source: "manual",
        },
      }),
      database.publicHolidayPreference.findMany({
        select: { holiday_key: true, location_id: true, setting: true },
        where: scope,
      }),
    ]);

    return {
      ok: true,
      value: resolvePublicHolidaysFromData(
        {
          customHolidays: customHolidays.map((holiday) => ({
            countryCode: holiday.country_code,
            date: toDateOnly(holiday.holiday_date),
            defaultClassification: holiday.default_classification,
            id: holiday.id,
            name: holiday.name,
            regionCode: holiday.region_code,
          })),
          from: input.from,
          locations: locations.map((location) => ({
            countryCode: location.country_code,
            id: location.id,
            regionCode: location.region_code,
          })),
          organisation: {
            countryCode: organisation.country_code,
            regionCode: organisation.region_code,
          },
          preferences: preferences.map((preference) => ({
            holidayKey: preference.holiday_key,
            locationId: preference.location_id,
            setting: preference.setting,
          })),
          to: input.to,
        },
        listReference,
        { includeHidden: input.includeHidden }
      ),
    };
  } catch {
    return {
      error: appError("internal", "Failed to resolve public holidays"),
      ok: false,
    };
  }
}

/** Non-working holiday dates for one subject (a location, or null for the organisation level). */
export function nonWorkingHolidayDates(
  holidays: readonly ResolvedPublicHoliday[],
  locationId: string | null
): Set<string> {
  return new Set(
    holidays
      .filter(
        (holiday) =>
          holiday.locationId === locationId &&
          !holiday.hidden &&
          holiday.classification === "non_working"
      )
      .map((holiday) => holiday.date)
  );
}
