import type {
  ClerkOrgId,
  OrganisationId,
  ResolveHolidayData,
} from "@repo/core";
import { startOfUtcDay, toDateOnly } from "@repo/core";
import type { Prisma } from "../../generated/client";
import { tenantDatabase } from "../tenant-client";
import { scopedQuery } from "../tenant-query";

/**
 * Loads one tenant's inputs for public holiday resolution: the organisation's
 * jurisdiction, its locations, custom holidays in range and preferences.
 * Returns null when the organisation is not in the tenant. Pass a transaction
 * client to read inside an existing transaction.
 */
export async function loadHolidayResolutionData(
  input: {
    clerkOrgId: ClerkOrgId;
    /** Inclusive YYYY-MM-DD. */
    from: string;
    organisationId: OrganisationId;
    /** Inclusive YYYY-MM-DD. */
    to: string;
  },
  client: Pick<
    Prisma.TransactionClient,
    "organisation" | "location" | "publicHoliday" | "publicHolidayPreference"
  > = tenantDatabase(input.clerkOrgId)
): Promise<ResolveHolidayData | null> {
  const scope = scopedQuery(input.clerkOrgId, input.organisationId);
  const organisation = await client.organisation.findFirst({
    select: { country_code: true, region_code: true },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      id: input.organisationId,
    },
  });
  if (!organisation) {
    return null;
  }
  const [locations, customHolidays, preferences] = await Promise.all([
    client.location.findMany({
      select: { country_code: true, id: true, region_code: true },
      where: scope,
    }),
    client.publicHoliday.findMany({
      select: {
        country_code: true,
        created_at: true,
        default_classification: true,
        holiday_date: true,
        id: true,
        name: true,
        region_code: true,
        updated_at: true,
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
    client.publicHolidayPreference.findMany({
      select: { holiday_key: true, location_id: true, setting: true },
      where: scope,
    }),
  ]);

  return {
    customHolidays: customHolidays.map((holiday) => ({
      countryCode: holiday.country_code,
      createdAt: holiday.created_at,
      date: toDateOnly(holiday.holiday_date),
      defaultClassification: holiday.default_classification,
      id: holiday.id,
      name: holiday.name,
      regionCode: holiday.region_code,
      updatedAt: holiday.updated_at,
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
  };
}
