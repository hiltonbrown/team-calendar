import { requireOrg } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import {
  type CalendarRange,
  type CalendarRole,
  type CalendarScope,
  getCalendarRange,
} from "@repo/availability";
import {
  type ClerkOrgId,
  type OrganisationId,
  xeroRecoveryMessage,
} from "@repo/core";
import {
  resolveAccountCompanies,
  scopedQuery,
  tenantDatabase,
  tenantTransaction,
} from "@repo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { CalendarLiveUpdates } from "@/components/calendar/calendar-live-updates";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { CalendarScanPanel } from "@/components/calendar/calendar-scan-panel";
import { CalendarSyncStatus } from "@/components/calendar/calendar-sync-status";
import { CalendarTimeline } from "@/components/calendar/calendar-timeline";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { withOrg } from "@/lib/navigation/org-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { type CalendarFilterInput, CalendarFilterSchema } from "./_schemas";
import { CalendarRetryButton } from "./calendar-retry-button";
export const metadata: Metadata = {
  description: "View team leave, availability and public holidays.",
  title: "Calendar - Team Calendar",
};
interface CalendarPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const defaultCalendarFilters: CalendarFilterInput = {
  includeDrafts: false,
  recordTypeCategory: "all",
  surface: "calendar",
  view: "week",
};
async function loadCalendarResources(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  userId: string,
  actingPersonId: string | null,
  parsedFilters: CalendarFilterInput,
  role: CalendarRole,
  scope: CalendarScope,
  companyIds: string[],
  explicitCompanyIds?: string[]
) {
  const [organisation, teams, locations, xeroConnection] =
    await tenantTransaction(clerkOrgId, (tx) =>
      Promise.all([
        tx.organisation.findFirst({
          select: { name: true, timezone: true },
          where: {
            archived_at: null,
            clerk_org_id: clerkOrgId,
            id: organisationId,
          },
        }),
        tx.team.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
          where: {
            clerk_org_id: clerkOrgId,
            organisation_id: { in: companyIds },
          },
        }),
        tx.location.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
          where: {
            clerk_org_id: clerkOrgId,
            organisation_id: { in: companyIds },
          },
        }),
        tx.xeroConnection.findFirst({
          select: {
            last_leave_records_sync_at: true,
            last_sync_error_message: true,
            leave_records_stale_since: true,
            sync_paused_at: true,
            tenant_name: true,
          },
          where: {
            archived_at: null,
            clerk_org_id: clerkOrgId,
            organisation_id: organisationId,
          },
        }),
      ])
    );
  const timezone = organisation?.timezone ?? "UTC";
  const anchorDate = parsedFilters.anchor
    ? new Date(`${parsedFilters.anchor}T12:00:00.000Z`)
    : new Date();
  const dataResult = await getCalendarRange({
    actingPersonId,
    actingUserId: userId,
    anchorDate,
    clerkOrgId,
    companyIds: explicitCompanyIds,
    filters: {
      approvalStatus: parsedFilters.approvalStatus,
      includeDrafts: parsedFilters.includeDrafts,
      locationId: parsedFilters.locationId,
      personType: parsedFilters.personType,
      recordType: parsedFilters.recordType,
      recordTypeCategory: parsedFilters.recordTypeCategory,
    },
    role,
    scope,
    view: parsedFilters.view,
  });
  return {
    dataResult,
    locations,
    organisation,
    teams,
    timezone,
    xeroConnection,
  };
}
async function loadAccountCalendarContext(
  orgParam: string | undefined,
  filterParams: Record<string, string | string[] | undefined>
) {
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const companies = await resolveAccountCompanies(clerkOrgId);
  if (companies.length === 0) {
    redirect("/onboarding");
  }
  const explicitContext = orgParam
    ? await requireActiveOrgPageContext(orgParam)
    : null;
  let organisationId = (explicitContext?.organisationId ??
    companies[0]?.id) as OrganisationId;
  const orgQueryValue = explicitContext?.orgQueryValue ?? null;
  const parsedFilters: CalendarFilterInput =
    parseFilterParams(filterParams, CalendarFilterSchema) ??
    defaultCalendarFilters;
  const explicitCompanyIds =
    parsedFilters.companyIds ?? (orgParam ? [organisationId] : undefined);
  const companyIds =
    explicitCompanyIds ?? companies.map((company) => company.id);
  organisationId = (companyIds[0] ?? organisationId) as OrganisationId;
  return {
    clerkOrgId,
    companies,
    companyIds,
    explicitCompanyIds,
    organisationId,
    orgQueryValue,
    parsedFilters,
  };
}
const CalendarPage = async ({ searchParams }: CalendarPageProps) => {
  await requirePageRole("org:viewer");
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = firstQueryValue(org);
  const {
    clerkOrgId,
    companies,
    organisationId,
    orgQueryValue,
    parsedFilters,
    explicitCompanyIds,
    companyIds,
  } = await loadAccountCalendarContext(orgParam, filterParams);
  const { orgRole } = await auth();
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }
  const role = calendarRole(orgRole);
  const currentPerson = await tenantDatabase(clerkOrgId).person.findFirst({
    select: { id: true },
    where: {
      ...scopedQuery(clerkOrgId, organisationId),
      archived_at: null,
      clerk_user_id: user.id,
    },
  });
  const defaultScopeType = defaultScopeForRole(role);
  const scope = resolveScope(parsedFilters, defaultScopeType);
  if (!scope.ok) {
    redirect(
      withOrg(
        `/calendar?view=${parsedFilters.view}&scopeType=${defaultScopeType}`,
        orgQueryValue
      )
    );
  }
  const {
    dataResult,
    locations,
    organisation,
    teams,
    timezone,
    xeroConnection,
  } = await loadCalendarResources(
    clerkOrgId,
    organisationId,
    user.id,
    currentPerson?.id ?? null,
    parsedFilters,
    role,
    scope.value,
    companyIds,
    explicitCompanyIds
  );
  if (!dataResult.ok) {
    if (dataResult.error.code === "invalid_scope") {
      redirect(
        withOrg(
          `/calendar?view=${parsedFilters.view}&scopeType=${defaultScopeType}`,
          orgQueryValue
        )
      );
    }
    return (
      <>
        <Header page="Calendar" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState
            entityName="calendar"
            retrySlot={<CalendarRetryButton />}
          />
        </div>
      </>
    );
  }
  const calendarFilters: CalendarFilterInput = {
    ...parsedFilters,
    scopeType: scope.value.type,
    scopeValue: scope.value.value,
  };
  const selectedPersonId =
    scope.value.type === "person" ? scope.value.value : null;
  return (
    <>
      <Header page="Calendar" />
      {companies
        .filter((company) => companyIds.includes(company.id))
        .map((company) => (
          <CalendarLiveUpdates key={company.id} organisationId={company.id} />
        ))}
      <div className="flex flex-1 flex-col gap-8 p-6 pt-0">
        {companyIds.length === 1 &&
        dataResult.value.xeroConnectionState === "connected" ? (
          <CalendarSyncStatus
            businessName={
              xeroConnection?.tenant_name ?? organisation?.name ?? "Xero"
            }
            isPersonalUnlinked={currentPerson === null}
            isStale={Boolean(xeroConnection?.leave_records_stale_since)}
            isSyncPaused={Boolean(xeroConnection?.sync_paused_at)}
            lastLeaveRefresh={
              xeroConnection?.last_leave_records_sync_at ?? null
            }
            orgQueryValue={orgQueryValue}
            syncError={xeroConnection?.last_sync_error_message ?? null}
          />
        ) : null}
        {companyIds.length === 1 &&
        dataResult.value.xeroConnectionState !== "connected" ? (
          <DisconnectedXeroBanner
            canConnect={role === "admin" || role === "owner"}
            orgQueryValue={orgQueryValue}
            xeroConnectionState={dataResult.value.xeroConnectionState}
          />
        ) : null}

        <CalendarToolbar
          actingPersonId={currentPerson?.id ?? null}
          companies={companies}
          data={dataResult.value}
          filters={{
            ...parsedFilters,
            anchor:
              parsedFilters.anchor ?? dateOnlyInTimeZone(new Date(), timezone),
            scopeType: scope.value.type,
            scopeValue: "value" in scope.value ? scope.value.value : undefined,
          }}
          locations={locations}
          orgQueryValue={orgQueryValue}
          teams={teams}
        />

        {dataResult.value.view === "week" ? (
          <CalendarTimeline
            data={dataResult.value}
            filters={calendarFilters}
            orgQueryValue={orgQueryValue}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
            {renderCalendarView({
              actingPersonId: currentPerson?.id ?? null,
              data: dataResult.value,
              filters: calendarFilters,
              orgQueryValue,
              selectedPersonId,
            })}
            <CalendarScanPanel
              data={dataResult.value}
              filters={calendarFilters}
              orgQueryValue={orgQueryValue}
            />
          </div>
        )}
      </div>
    </>
  );
};
export default CalendarPage;
function resolveScope(
  filters: {
    scopeType?: string;
    scopeValue?: string;
  },
  defaultScopeType: CalendarScope["type"]
):
  | {
      ok: true;
      value: CalendarScope;
    }
  | {
      ok: false;
    } {
  const scopeType = filters.scopeType ?? defaultScopeType;
  if (scopeType === "team" || scopeType === "person") {
    return filters.scopeValue
      ? { ok: true, value: { type: scopeType, value: filters.scopeValue } }
      : { ok: false };
  }
  if (
    scopeType === "my_self" ||
    scopeType === "my_team" ||
    scopeType === "all_teams"
  ) {
    return { ok: true, value: { type: scopeType } };
  }
  return { ok: false };
}
function DisconnectedXeroBanner({
  canConnect,
  orgQueryValue,
  xeroConnectionState,
}: {
  xeroConnectionState: import("@repo/core").XeroConnectionDisplayState;
  canConnect: boolean;
  orgQueryValue: string | null;
}) {
  return (
    <div className="rounded-2xl bg-muted p-5 text-label-lg text-muted-foreground">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p>
          {xeroConnectionState === "not_connected"
            ? "Xero is not connected. Connect Xero in Integration Settings to enable leave submission for manager approval."
            : xeroRecoveryMessage(xeroConnectionState)}
        </p>
        {canConnect && xeroConnectionState === "not_connected" ? (
          <a
            className="font-medium text-primary"
            href={withOrg("/settings/integrations/xero", orgQueryValue)}
          >
            Connect Xero
          </a>
        ) : null}
      </div>
    </div>
  );
}
function renderCalendarView({
  actingPersonId,
  data,
  filters,
  orgQueryValue,
  selectedPersonId,
}: {
  actingPersonId: string | null;
  data: CalendarRange;
  filters: CalendarFilterInput;
  orgQueryValue: string | null;
  selectedPersonId: string | null;
}) {
  if (data.view === "day") {
    return (
      <CalendarDayView
        actingPersonId={actingPersonId}
        data={data}
        orgQueryValue={orgQueryValue}
        selectedPersonId={selectedPersonId}
      />
    );
  }
  return (
    <CalendarMonthView
      actingPersonId={actingPersonId}
      data={data}
      filters={filters}
      orgQueryValue={orgQueryValue}
      selectedPersonId={selectedPersonId}
    />
  );
}
function calendarRole(role: string | null | undefined): CalendarRole {
  if (role === "org:owner") {
    return "owner";
  }
  if (role === "org:admin") {
    return "admin";
  }
  if (role === "org:manager") {
    return "manager";
  }
  return "viewer";
}
function defaultScopeForRole(role: CalendarRole): CalendarScope["type"] {
  if (role === "admin" || role === "owner") {
    return "all_teams";
  }
  if (role === "manager") {
    return "my_team";
  }
  return "my_self";
}
function dateOnlyInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
