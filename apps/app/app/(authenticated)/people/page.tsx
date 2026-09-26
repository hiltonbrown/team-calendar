import { auth } from "@repo/auth/server";
import { getXeroConnectionStateForScope, listPeople } from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
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
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);
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

  const actingPerson = userId
    ? await database.person.findFirst({
        select: { id: true },
        where: {
          clerk_org_id: clerkOrgId,
          clerk_user_id: userId,
          organisation_id: organisationId,
        },
      })
    : null;

  const [peopleResult, teams, locations, xeroTenant, xeroStateResult] =
    await Promise.all([
      listPeople({
        actingPersonId: actingPerson?.id,
        clerkOrgId,
        filters,
        organisationId,
        pagination: {
          cursor: filters.cursor,
          pageSize: filters.pageSize,
        },
        role: peopleRole,
      }),
      database.team.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        where: scopedQuery(clerkOrgId, organisationId),
      }),
      database.location.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        where: scopedQuery(clerkOrgId, organisationId),
      }),
      database.xeroTenant.findFirst({
        select: {
          id: true,
        },
        where: {
          clerk_org_id: clerkOrgId,
          organisation_id: organisationId,
        },
      }),
      getXeroConnectionStateForScope({ clerkOrgId, organisationId }),
    ]);
  const xeroConnectionState = xeroStateResult.ok
    ? xeroStateResult.value.state
    : "unavailable";
  const xeroTenantId = xeroTenant?.id ?? null;

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
          canManageClerkAccess={canIncludeArchived}
          filters={filters}
          locations={locations}
          nextCursor={peopleResult.value.nextCursor}
          organisationId={organisationId}
          orgQueryValue={orgQueryValue}
          people={peopleResult.value.people}
          teams={teams}
          totalCount={peopleResult.value.totalCount}
          xeroConnectionState={xeroConnectionState}
          xeroTenantId={xeroTenantId}
        />
      </div>
    </>
  );
};

export default PeoplePage;
