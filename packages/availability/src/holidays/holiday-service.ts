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
import { assertTenantDb, scopedQuery, type TenantDb } from "@repo/database";

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
  input: AddCustomHolidayInput,
  db: TenantDb
): Promise<Result<{ id: string }>> {
  assertTenantDb(db, input.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof addCustomHoliday> => {
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
    const existing = await client.publicHoliday.findFirst({
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

    const holiday = await client.publicHoliday.create({
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
  };
  return await (async () => {
    assertTenantDb(db, input.clerkOrgId);
    return await run(db);
  })();
}

export async function deleteCustomHoliday(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  holidayId: string,
  db: TenantDb
): Promise<Result<{ id: string }>> {
  assertTenantDb(db, clerkOrgId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof deleteCustomHoliday> => {
    const holiday = await client.publicHoliday.findFirst({
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
    await (async (tx: TenantDb) => {
      await tx.publicHolidayPreference.deleteMany({
        where: {
          ...scopedQuery(clerkOrgId, organisationId),
          holiday_key: `custom:${holidayId}`,
        },
      });
      await tx.publicHoliday.delete({
        where: { ...scopedQuery(clerkOrgId, organisationId), id: holidayId },
      });
    })(client);
    return { ok: true, value: { id: holidayId } };
  };
  return await (async () => {
    assertTenantDb(db, clerkOrgId);
    return await run(db);
  })();
}
