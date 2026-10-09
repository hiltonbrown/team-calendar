import {
  appError,
  type ClerkOrgId,
  type ListReferenceHolidays,
  listReferenceHolidays,
  type OrganisationId,
  type ResolvedPublicHoliday,
  type Result,
  resolvePublicHolidaysFromData,
} from "@repo/core";
import { loadHolidayResolutionData } from "@repo/database";

export type {
  HolidayClassification,
  HolidayPreferenceSetting,
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
