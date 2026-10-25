import { requireAccount } from "@repo/auth/helpers";
import { hasPermission as can } from "@repo/auth/permissions";
import { getSession } from "@repo/auth/server";
import {
  getXeroConnectionStateForScope,
  listPeople,
  selectCalendarCompanies,
} from "@repo/availability";
import type { AccountId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantDb,
} from "@repo/database";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
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
  await requirePagePermission({ people: ["read"] });
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  // The account comes from Clerk before database preparation.
  const accountId = (await requireAccount()) as AccountId;
  const { role: sessionRole, userId } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  const canIncludeArchived = can(sessionRole, { people: ["manage"] });
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
  if (sessionRole === "admin") {
    peopleRole = "admin";
  } else if (sessionRole === "manager") {
    peopleRole = "manager";
  } else if (sessionRole === "owner") {
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
    accountId,
    async (db) => {
      const preparedCompanies = await resolveAccountCompanies(accountId, db);
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
              account_id: accountId,
              archived_at: null,
              organisation_id: {
                in: preparedCompanies.map((company) => company.id),
              },
              user_id: userId,
            },
          })
        : null;
      const preparedPeopleResult = await listPeople(
        {
          accountId,
          actingPersonId: actingPerson?.id,
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
          account_id: accountId,
          organisation_id: { in: selectedIds },
        },
      });
      const preparedLocations = await db.location.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        where: {
          account_id: accountId,
          organisation_id: { in: selectedIds },
        },
      });
      const preparedXeroConnection =
        selectedIds.length === 1
          ? await db.xeroConnection.findFirst({
              select: { id: true },
              where: {
                account_id: accountId,
                organisation_id: scopedOrganisationId,
                released_at: null,
              },
            })
          : null;
      const preparedXeroStateResult =
        selectedIds.length === 1
          ? await getXeroConnectionStateForScope(
              { accountId, organisationId: scopedOrganisationId },
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
          canManageAccountAccess={canIncludeArchived && orgQueryValue !== null}
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
