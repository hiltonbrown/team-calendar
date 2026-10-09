import { auth } from "@repo/auth/server";
import {
  type ResolvedPublicHoliday,
  resolvePublicHolidays,
} from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
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
  await requirePageRole("org:viewer");
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { orgRole } = await auth();
  const canManage = orgRole === "org:admin" || orgRole === "org:owner";
  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);
  const filters =
    parseFilterParams(filterParams, PublicHolidayFilterSchema) ??
    PublicHolidayFilterSchema.parse({});

  const [holidaysResult, locations] = await Promise.all([
    resolvePublicHolidays({
      clerkOrgId,
      from: `${filters.year}-01-01`,
      includeHidden: true,
      organisationId,
      to: `${filters.year}-12-31`,
    }),
    database.location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: scopedQuery(clerkOrgId, organisationId),
    }),
  ]);

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
