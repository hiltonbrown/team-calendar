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
  title: "Public Holidays - LeaveSync",
  description: "Manage public holidays for your organisation.",
};

interface PublicHolidaysPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// S-11 Public holidays is the member-view surface: read access from viewer
// upward, with the admin action column and suppressed rows shown only to
// admins and owners. The admin-config counterpart that suppresses, restores,
// adds custom days, and refreshes from source is S-23 at `/settings/holidays`
// (admin and owner only). This split is intentional per ScreenCatalogue v4.1;
// keep the two in sync.
const PublicHolidaysPage = async ({
  searchParams,
}: PublicHolidaysPageProps) => {
  await requirePageRole("org:viewer");
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);
  const filters =
    parseFilterParams(filterParams, PublicHolidayFilterSchema) ??
    PublicHolidayFilterSchema.parse({});

  const [holidaysResult, locations] = await Promise.all([
    listForOrganisation(clerkOrgId, organisationId, {
      includeSuppressed: filters.includeSuppressed,
      locationId: filters.locationId,
      year: filters.year,
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
          filters={filters}
          holidays={holidaysResult.value}
          locations={locations}
        />
      </div>
    </>
  );
};

export default PublicHolidaysPage;
