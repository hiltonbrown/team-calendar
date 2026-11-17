import { requireAccount } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getSession } from "@repo/auth/server";
import {
  type ResolvedPublicHoliday,
  resolvePublicHolidays,
} from "@repo/availability";
import type { AccountId } from "@repo/core";
import { scopedQuery, withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { PublicHolidayFilterSchema } from "./_schemas";
import { type HolidayGroup, PublicHolidaysList } from "./public-holidays-list";

export const metadata: Metadata = {
  description: "Review and manage public holidays for your organisation.",
  title: "Public Holidays - Team Calendar",
};

interface PublicHolidaysPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Public Holidays is the single operational list. Everyone may review it;
// admins and owners also get the hide, restore and working-day controls.
const PublicHolidaysPage = async ({
  searchParams,
}: PublicHolidaysPageProps) => {
  await requirePagePermission({ calendar: ["read"] });
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { role: sessionRole } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  const canManage = can(sessionRole, { settings: ["update"] });
  // Account discovery finishes before the read scope.
  const accountId = (await requireAccount()) as AccountId;
  const filters =
    parseFilterParams(filterParams, PublicHolidayFilterSchema) ??
    PublicHolidayFilterSchema.parse({});

  const { holidaysResult, locations, organisationId } = await withTenantDb(
    accountId,
    async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(accountId, orgParam, db);
      const [preparedHolidaysResult, preparedLocations] = [
        await resolvePublicHolidays(
          {
            accountId,
            from: `${filters.year}-01-01`,
            includeHidden: true,
            organisationId: scopedOrganisationId,
            to: `${filters.year}-12-31`,
          },
          undefined,
          db
        ),
        await db.location.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
          where: scopedQuery(accountId, scopedOrganisationId),
        }),
      ];

      return {
        holidaysResult: preparedHolidaysResult,
        locations: preparedLocations,
        organisationId: scopedOrganisationId,
      };
    }
  );

  if (!holidaysResult.ok) {
    return (
      <>
        <Header page="Public Holidays" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="public holidays" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header page="Public Holidays" />
      <div className="flex flex-1 flex-col p-6 pt-0">
        <PublicHolidaysList
          canManage={canManage}
          filters={filters}
          groups={groupByLocation(holidaysResult.value, locations, filters)}
          hasOfficialHolidays={holidaysResult.value.some(
            (holiday) => holiday.origin === "official"
          )}
          locations={locations}
          organisationId={organisationId}
        />
      </div>
    </>
  );
};

export default PublicHolidaysPage;

function groupByLocation(
  holidays: readonly ResolvedPublicHoliday[],
  locations: ReadonlyArray<{ id: string; name: string }>,
  filters: { includeHidden: boolean; locationId?: string }
): HolidayGroup[] {
  const subjects = [
    ...locations.map((location) => ({
      id: location.id as string | null,
      name: location.name,
    })),
    { id: null, name: "People without a location" },
  ].filter(
    (subject) => !filters.locationId || subject.id === filters.locationId
  );
  return subjects.map((subject) => ({
    holidays: holidays.filter(
      (holiday) =>
        holiday.locationId === subject.id &&
        (filters.includeHidden || !holiday.hidden)
    ),
    locationId: subject.id,
    name: subject.name,
  }));
}
