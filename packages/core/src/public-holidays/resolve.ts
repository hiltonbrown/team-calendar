import { isCountryCode } from "../regions";
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
    /** Last change, used as the feed publication time for custom holidays. */
    updatedAt?: Date;
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

export interface LocalHolidayOption {
  area: string | null;
  /** YYYY-MM-DD. */
  date: string;
  enabled: boolean;
  key: string;
  name: string;
}

/** The optional local days each location can switch on, with their current state. */
export function localHolidayOptions(
  data: ResolveHolidayData,
  listReference: ListReferenceHolidays = listReferenceHolidays
): Array<{ holidays: LocalHolidayOption[]; locationId: string }> {
  return data.locations.map((location) => {
    const { countryCode, regionCode } = jurisdictionFor(
      location,
      data.organisation
    );
    if (!isCountryCode(countryCode)) {
      return { holidays: [], locationId: location.id };
    }
    const holidays = listReference({
      country: countryCode,
      from: data.from,
      region: regionCode,
      to: data.to,
    })
      .filter((holiday) => holiday.kind === "local")
      .map((holiday) => {
        const setting = locationSetting(
          data.preferences,
          holiday.id,
          location.id
        );
        return {
          area: holiday.area,
          date: holiday.date,
          enabled: setting === "working" || setting === "non_working",
          key: holiday.id,
          name: holiday.name,
        };
      });
    return { holidays, locationId: location.id };
  });
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
