import {
  appError,
  type ClerkOrgId,
  type ListReferenceHolidays,
  type LocalHolidayOption,
  listReferenceHolidays,
  localHolidayOptions,
  type OrganisationId,
  type ResolvedPublicHoliday,
  type Result,
  resolvePublicHolidaysFromData,
} from "@repo/core";
import { loadHolidayResolutionData } from "@repo/database";

export type {
  HolidayClassification,
  HolidayPreferenceSetting,
  LocalHolidayOption,
  ResolvedPublicHoliday,
  ResolveHolidayData,
} from "@repo/core";
export {
  CUSTOM_HOLIDAY_KEY_PREFIX,
  customHolidayKey,
  nonWorkingHolidayDates,
  resolvePublicHolidaysFromData,
} from "@repo/core";

export interface ResolvePublicHolidaysInput {
  clerkOrgId: ClerkOrgId;
  /** Inclusive YYYY-MM-DD. */
  from: string;
  includeHidden?: boolean;
  organisationId: OrganisationId;
  /** Inclusive YYYY-MM-DD. */
  to: string;
}

/** The public holidays that apply to each location and the organisation level. */
export async function resolvePublicHolidays(
  input: ResolvePublicHolidaysInput,
  listReference: ListReferenceHolidays = listReferenceHolidays
): Promise<Result<ResolvedPublicHoliday[]>> {
  try {
    const data = await loadHolidayResolutionData(input);
    if (!data) {
      return {
        error: appError("not_found", "Organisation not found"),
        ok: false,
      };
    }
    return {
      ok: true,
      value: resolvePublicHolidaysFromData(data, listReference, {
        includeHidden: input.includeHidden,
      }),
    };
  } catch {
    return {
      error: appError("internal", "Failed to resolve public holidays"),
      ok: false,
    };
  }
}

/**
 * Settings > Holidays data from one tenant load: the resolved holidays and each
 * location's optional local days with whether the location has switched them on.
 */
export async function loadHolidaySettings(
  input: Omit<ResolvePublicHolidaysInput, "includeHidden">,
  listReference: ListReferenceHolidays = listReferenceHolidays
): Promise<
  Result<{
    holidays: ResolvedPublicHoliday[];
    localOptions: Array<{ holidays: LocalHolidayOption[]; locationId: string }>;
  }>
> {
  try {
    const data = await loadHolidayResolutionData(input);
    if (!data) {
      return {
        error: appError("not_found", "Organisation not found"),
        ok: false,
      };
    }
    return {
      ok: true,
      value: {
        holidays: resolvePublicHolidaysFromData(data, listReference),
        localOptions: localHolidayOptions(data, listReference),
      },
    };
  } catch {
    return {
      error: appError("internal", "Failed to load holiday settings"),
      ok: false,
    };
  }
}
