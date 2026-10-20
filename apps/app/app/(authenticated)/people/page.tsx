import { requireOrg } from "@repo/auth/helpers";
import { auth } from "@repo/auth/server";
import {
  getXeroConnectionStateForScope,
  listPeople,
  selectCalendarCompanies,
} from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantDb,
} from "@repo/database";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { PeopleFilterSchema } from "./_schemas";
import { PeopleClient } from "./people-client";
export const metadata: Metadata = {
  description: "Team directory with live availability and Xero sync status.",
  title: "People - Team Calendar",
};
interface PeoplePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const PeoplePage = async ({ searchParams }: PeoplePageProps) => {
  await requirePageRole("org:viewer");
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  // The account comes from Clerk before database preparation.
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const { orgRole, userId } = await auth();
  const canIncludeArchived = orgRole === "org:admin" || orgRole === "org:owner";
  const parsedFilters = parseFilterParams(filterParams, PeopleFilterSchema) ?? {
    includeArchived: false,
    pageSize: 50,
    personType: "all",
    xeroLinked: "all",
    xeroSyncFailedOnly: false,
  };
  const filters = {
    ...parsedFilters,
    includeArchived: canIncludeArchived ? parsedFilters.includeArchived : false,
  };
  let peopleRole: "admin" | "manager" | "owner" | "viewer" = "viewer";
  if (orgRole === "org:admin") {
    peopleRole = "admin";
  } else if (orgRole === "org:manager") {
    peopleRole = "manager";
  } else if (orgRole === "org:owner") {
    peopleRole = "owner";
  }
  const {
    peopleResult,
    teams,
    locations,
    xeroConnection,
    xeroStateResult,
    organisationId,
    orgQueryValue,
    companies,
    companyIds,
  } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const preparedCompanies = await resolveAccountCompanies(clerkOrgId, db);
      if (!preparedCompanies.length) {
        redirect("/onboarding");
      }
      const preparedCompanyIds =
        filters.companyIds ?? (orgParam ? [orgParam] : undefined);
      const selection = selectCalendarCompanies(
        { companyIds: preparedCompanyIds },
        preparedCompanies
      );
      if (!selection.ok) {
        notFound();
      }
      const selectedIds = selection.value.map((company) => company.id);
      const scopedOrganisationId = selectedIds[0] ?? preparedCompanies[0]?.id;
      if (!scopedOrganisationId) {
        redirect("/onboarding");
      }
      const preparedOrgQueryValue =
        selectedIds.length === 1 ? scopedOrganisationId : null;
      const actingPerson = userId
        ? await db.person.findFirst({
            orderBy: [{ created_at: "asc" }, { id: "asc" }],
            select: { id: true },
            where: {
              archived_at: null,
              clerk_org_id: clerkOrgId,
              clerk_user_id: userId,
              organisation_id: {
                in: preparedCompanies.map((company) => company.id),
              },
            },
          })
        : null;
      const preparedPeopleResult = await listPeople(
        {
          actingPersonId: actingPerson?.id,
          clerkOrgId,
          companyIds: preparedCompanyIds,
          filters,
          pagination: { cursor: filters.cursor, pageSize: filters.pageSize },
          role: peopleRole,
        },
        db
      );
      const preparedTeams = await db.team.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        where: {
          clerk_org_id: clerkOrgId,
          organisation_id: { in: selectedIds },
        },
      });
      const preparedLocations = await db.location.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        where: {
          clerk_org_id: clerkOrgId,
          organisation_id: { in: selectedIds },
        },
      });
      const preparedXeroConnection =
        selectedIds.length === 1
          ? await db.xeroConnection.findFirst({
              select: { id: true },
              where: {
                archived_at: null,
                clerk_org_id: clerkOrgId,
                organisation_id: scopedOrganisationId,
              },
            })
          : null;
      const preparedXeroStateResult =
        selectedIds.length === 1
          ? await getXeroConnectionStateForScope(
              { clerkOrgId, organisationId: scopedOrganisationId },
              db
            )
          : { ok: true as const, value: { state: "not_connected" as const } };
      return {
        companies: preparedCompanies,
        companyIds: preparedCompanyIds,
        locations: preparedLocations,
        organisationId: scopedOrganisationId,
        orgQueryValue: preparedOrgQueryValue,
        peopleResult: preparedPeopleResult,
        teams: preparedTeams,
        xeroConnection: preparedXeroConnection,
        xeroStateResult: preparedXeroStateResult,
      };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
  const xeroConnectionState = xeroStateResult.ok
    ? xeroStateResult.value.state
    : "unavailable";
  const connectionId = xeroConnection?.id ?? null;
  if (!peopleResult.ok) {
    return (
      <>
        <Header page="People" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="people" />
        </div>
      </>
    );
  }
  return (
    <>
      <Header page="People" />
      <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <PeopleClient
          canIncludeArchived={canIncludeArchived}
          canManageClerkAccess={canIncludeArchived && orgQueryValue !== null}
          companies={companies}
          companyIds={companyIds}
          connectionId={connectionId}
          filters={filters}
          locations={locations}
          nextCursor={peopleResult.value.nextCursor}
          organisationId={organisationId}
          orgQueryValue={orgQueryValue}
          people={peopleResult.value.people}
          teams={teams}
          totalCount={peopleResult.value.totalCount}
          xeroConnectionState={xeroConnectionState}
        />
      </div>
    </>
  );
};
export default PeoplePage;
