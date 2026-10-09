import {
  appError,
  type ClerkOrgId,
  isCountryCode,
  isRegionCode,
  type OrganisationId,
  type Result,
  startOfUtcDay,
  toDateOnly,
} from "@repo/core";
import { database, scopedQuery } from "@repo/database";

/**
 * Custom holidays an organisation adds itself. Official holidays come from the
 * bundled reference files and are never stored per organisation.
 */
export interface AddCustomHolidayInput {
  /** true applies the holiday in every country and region. */
  appliesToAllJurisdictions: boolean;
  clerkOrgId: ClerkOrgId;
  /** Required when appliesToAllJurisdictions is false. */
  countryCode: string | null;
  date: Date;
  name: string;
  organisationId: OrganisationId;
  /** Optional region within countryCode; null applies country-wide. */
  regionCode: string | null;
  userId: string;
}

export async function addCustomHoliday(
  input: AddCustomHolidayInput
): Promise<Result<{ id: string }>> {
  try {
    const name = input.name.trim();
    if (name === "") {
      return {
        error: appError("bad_request", "Enter a holiday name"),
        ok: false,
      };
    }
    const { countryCode: requestedCountry, regionCode: requestedRegion } =
      input;
    let countryCode = "CUSTOM";
    let regionCode: string | null = null;
    if (!input.appliesToAllJurisdictions) {
      if (!isCountryCode(requestedCountry)) {
        return {
          error: appError("bad_request", "Choose a country"),
          ok: false,
        };
      }
      if (requestedRegion && !isRegionCode(requestedCountry, requestedRegion)) {
        return {
          error: appError("bad_request", "Choose a region in that country"),
          ok: false,
        };
      }
      countryCode = requestedCountry;
      regionCode = requestedRegion || null;
    }

    const dateOnly = toDateOnly(input.date);
    const sourceRemoteId = `custom:${dateOnly}:${name.toLowerCase()}`;
    const existing = await database.publicHoliday.findFirst({
      select: { id: true },
      where: {
        ...scopedQuery(input.clerkOrgId, input.organisationId),
        source: "manual",
        source_remote_id: sourceRemoteId,
      },
    });
    if (existing) {
      return {
        error: appError(
          "conflict",
          "A custom holiday with this name and date already exists"
        ),
        ok: false,
      };
    }

    const holiday = await database.publicHoliday.create({
      data: {
        clerk_org_id: input.clerkOrgId,
        country_code: countryCode,
        created_by_user_id: input.userId,
        default_classification: "non_working",
        holiday_date: startOfUtcDay(dateOnly),
        holiday_type: "custom",
        name,
        organisation_id: input.organisationId,
        region_code: regionCode,
        source: "manual",
        source_remote_id: sourceRemoteId,
        updated_by_user_id: input.userId,
      },
      select: { id: true },
    });

    return { ok: true, value: { id: holiday.id } };
  } catch {
    return {
      error: appError("internal", "Failed to add custom holiday"),
      ok: false,
    };
  }
}

export async function deleteCustomHoliday(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  holidayId: string
): Promise<Result<{ id: string }>> {
  try {
    const holiday = await database.publicHoliday.findFirst({
      select: { id: true },
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        id: holidayId,
        source: "manual",
      },
    });
    if (!holiday) {
      return { error: appError("not_found", "Holiday not found"), ok: false };
    }
    await database.$transaction([
      database.publicHolidayPreference.deleteMany({
        where: {
          ...scopedQuery(clerkOrgId, organisationId),
          holiday_key: `custom:${holidayId}`,
        },
      }),
      database.publicHoliday.delete({ where: { id: holidayId } }),
    ]);
    return { ok: true, value: { id: holidayId } };
  } catch {
    return {
      error: appError("internal", "Failed to delete custom holiday"),
      ok: false,
    };
  }
}
