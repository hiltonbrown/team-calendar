import { auth } from "@repo/auth/server";
import { listForOrganisation } from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { PublicHolidayFilterSchema } from "./_schemas";
import { PublicHolidaysList } from "./public-holidays-list";

export const metadata: Metadata = {
  description: "Manage public holidays for your organisation.",
  title: "Public Holidays - Team Calendar",
};

interface PublicHolidaysPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Public Holidays is the single operational list. Everyone may review it;
// admins and owners receive the source refresh and mutation controls. Settings
// Holidays remains a summary and launch surface only.
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

  const [holidaysResult, locations, organisation] = await Promise.all([
    listForOrganisation(clerkOrgId, organisationId, {
      includeSuppressed: filters.includeSuppressed,
      locationId: filters.locationId,
      year: filters.year,
    }),
    database.location.findMany({
      orderBy: { name: "asc" },
      select: {
        country_code: true,
        id: true,
        name: true,
        region_code: true,
      },
      where: scopedQuery(clerkOrgId, organisationId),
    }),
    database.organisation.findFirst({
      select: { country_code: true, region_code: true },
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
          holidays={holidaysResult.value}
          locations={locations.map(({ id, name }) => ({ id, name }))}
          organisationId={organisationId}
          refreshTargets={buildRefreshTargets(organisation, locations)}
        />
      </div>
    </>
  );
};

export default PublicHolidaysPage;

function buildRefreshTargets(
  organisation: { country_code: string; region_code: string | null } | null,
  locations: Array<{
    country_code: string | null;
    name: string;
    region_code: string | null;
  }>
) {
  if (!organisation) {
    return [];
  }
  const targets = new Map<
    string,
    { countryCode: string; label: string; regionCode: string | null }
  >();
  const addTarget = (
    countryCode: string,
    regionCode: string | null,
    label: string
  ) => {
    targets.set(`${countryCode}:${regionCode ?? "national"}`, {
      countryCode,
      label,
      regionCode,
    });
  };
  addTarget(
    organisation.country_code,
    organisation.region_code,
    organisation.region_code
      ? `${organisation.country_code}-${organisation.region_code}`
      : `${organisation.country_code} national holidays`
  );
  for (const location of locations) {
    if (location.country_code) {
      addTarget(
        location.country_code,
        location.region_code,
        location.region_code
          ? `${location.name} (${location.country_code}-${location.region_code})`
          : `${location.name} (${location.country_code})`
      );
    }
  }
  return [...targets.values()];
}
