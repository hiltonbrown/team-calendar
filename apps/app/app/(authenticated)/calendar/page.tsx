import { auth, currentUser } from "@repo/auth/server";
import {
  type CalendarRange,
  type CalendarRole,
  type CalendarScope,
  getCalendarRange,
} from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { CalendarScanPanel } from "@/components/calendar/calendar-scan-panel";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { withOrg } from "@/lib/navigation/org-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { CalendarFilterSchema } from "./_schemas";

export const metadata: Metadata = {
  description: "View team leave, availability and public holidays.",
  title: "Calendar - Team Calendar",
};

interface CalendarPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CalendarPage = async ({ searchParams }: CalendarPageProps) => {
  await requirePageRole("org:viewer");

  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);
  const parsedFilters = parseFilterParams(
    filterParams,
    CalendarFilterSchema
  ) ?? {
    includeDrafts: false,
    recordTypeCategory: "all",
    view: "week",
  };
  const { orgRole } = await auth();
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }

  const role = calendarRole(orgRole);
  const currentPerson = await database.person.findFirst({
    where: {
      ...scopedQuery(clerkOrgId, organisationId),
      archived_at: null,
      clerk_user_id: user.id,
    },
    select: { id: true },
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

  const [organisation, teams, locations] = await Promise.all([
    database.organisation.findFirst({
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
      select: { timezone: true },
    }),
    database.team.findMany({
      where: scopedQuery(clerkOrgId, organisationId),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    database.location.findMany({
      where: scopedQuery(clerkOrgId, organisationId),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const timezone = organisation?.timezone ?? "UTC";
  const anchorDate = parsedFilters.anchor
    ? new Date(`${parsedFilters.anchor}T12:00:00.000Z`)
    : new Date();

  const dataResult = await getCalendarRange({
    actingPersonId: currentPerson?.id ?? null,
    actingUserId: user.id,
    anchorDate,
    clerkOrgId,
    filters: {
      approvalStatus: parsedFilters.approvalStatus,
      includeDrafts: parsedFilters.includeDrafts,
      locationId: parsedFilters.locationId,
      personType: parsedFilters.personType,
      recordType: parsedFilters.recordType,
      recordTypeCategory: parsedFilters.recordTypeCategory,
    },
    organisationId,
    role,
    scope: scope.value,
    view: parsedFilters.view,
  });

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
        <main className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="calendar" />
        </main>
      </>
    );
  }

  const selectedPersonId =
    scope.value.type === "person" ? scope.value.value : null;

  return (
    <>
      <Header page="Calendar" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        {!dataResult.value.hasActiveXeroConnection && (
          <DisconnectedXeroBanner
            canConnect={role === "admin" || role === "owner"}
            orgQueryValue={orgQueryValue}
          />
        )}

        <CalendarToolbar
          actingPersonId={currentPerson?.id ?? null}
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

        <CalendarScanPanel
          data={dataResult.value}
          orgQueryValue={orgQueryValue}
        />

        {renderCalendarView({
          actingPersonId: currentPerson?.id ?? null,
          data: dataResult.value,
          orgQueryValue,
          selectedPersonId,
        })}
      </main>
    </>
  );
};

export default CalendarPage;

function resolveScope(
  filters: { scopeType?: string; scopeValue?: string },
  defaultScopeType: CalendarScope["type"]
): { ok: true; value: CalendarScope } | { ok: false } {
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
}: {
  canConnect: boolean;
  orgQueryValue: string | null;
}) {
  return (
    <div className="rounded-2xl bg-muted p-5 text-muted-foreground text-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p>
          Xero is not connected. Leave records will save locally only. Connect
          Xero from the integrations settings to enable submission for approval.
        </p>
        {canConnect && (
          <a
            className="font-medium text-primary"
            href={withOrg("/settings/integrations/xero", orgQueryValue)}
          >
            Connect Xero
          </a>
        )}
      </div>
    </div>
  );
}

function renderCalendarView({
  actingPersonId,
  data,
  orgQueryValue,
  selectedPersonId,
}: {
  actingPersonId: string | null;
  data: CalendarRange;
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
  if (data.view === "month") {
    return (
      <CalendarMonthView
        actingPersonId={actingPersonId}
        data={data}
        orgQueryValue={orgQueryValue}
        selectedPersonId={selectedPersonId}
      />
    );
  }
  return (
    <CalendarWeekView
      actingPersonId={actingPersonId}
      data={data}
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
