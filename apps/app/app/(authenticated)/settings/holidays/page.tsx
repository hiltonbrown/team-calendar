import { requireOrg } from "@repo/auth/helpers";
import {
  loadHolidaySettings,
  type ResolvedPublicHoliday,
} from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import { toDateOnly } from "@repo/core";
import { scopedQuery, withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import {
  HolidaysClient,
  type LocalHolidayGroup,
  type UpcomingHoliday,
} from "./holidays-client";

export const metadata: Metadata = {
  description: "Review public holidays and switch on local days by location.",
  title: "Holidays - Settings - Team Calendar",
};

interface HolidaysPageProps {
  searchParams: Promise<{ org?: string }>;
}

const UPCOMING_LIMIT = 8;

// Settings > Holidays summarises coverage and holds the per-location local day
// switches. `/public-holidays` is the operational list for review and overrides.
const HolidaysPage = async ({ searchParams }: HolidaysPageProps) => {
  await requirePageRole("org:admin");
  const { org } = await searchParams;
  // Trusted account is discovered before scoped company and settings preparation.
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const { settingsResult, locations, organisationId, range } =
    await withTenantDb(clerkOrgId, async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(clerkOrgId, org, db);
      const today = new Date();
      const preparedRange = {
        clerkOrgId,
        from: toDateOnly(today),
        organisationId: scopedOrganisationId,
        to: `${today.getUTCFullYear() + 2}-12-31`,
      };
      const [preparedSettingsResult, preparedLocations] = [
        await loadHolidaySettings(preparedRange, undefined, db),
        await db.location.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
          where: scopedQuery(clerkOrgId, scopedOrganisationId),
        }),
      ];

      return {
        locations: preparedLocations,
        organisationId: scopedOrganisationId,
        range: preparedRange,
        settingsResult: preparedSettingsResult,
      };
    });

  if (!settingsResult.ok) {
    throw new Error(settingsResult.error.message);
  }

  const options = new Map(
    settingsResult.value.localOptions.map((group) => [
      group.locationId,
      group.holidays,
    ])
  );
  const localGroups: LocalHolidayGroup[] = locations.map((location) => ({
    holidays: options.get(location.id) ?? [],
    locationId: location.id,
    locationName: location.name,
  }));

  return (
    <HolidaysClient
      coverageEnd={range.to}
      localGroups={localGroups}
      organisationId={organisationId}
      summary={summarise(settingsResult.value.holidays)}
    />
  );
};

function summarise(holidays: ResolvedPublicHoliday[]): {
  customCount: number;
  officialCount: number;
  upcoming: UpcomingHoliday[];
} {
  const unique = new Map<string, ResolvedPublicHoliday>();
  for (const holiday of holidays) {
    if (!unique.has(holiday.key)) {
      unique.set(holiday.key, holiday);
    }
  }
  const all = [...unique.values()];
  return {
    customCount: all.filter((holiday) => holiday.origin === "custom").length,
    officialCount: all.filter((holiday) => holiday.origin === "official")
      .length,
    upcoming: all.slice(0, UPCOMING_LIMIT).map((holiday) => ({
      date: holiday.date,
      key: holiday.key,
      name: holiday.name,
      startsAt: holiday.startsAt,
    })),
  };
}

export default HolidaysPage;
