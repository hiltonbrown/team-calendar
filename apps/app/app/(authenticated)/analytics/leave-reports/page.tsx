import { auth, currentUser } from "@repo/auth/server";
import {
  type AnalyticsRole,
  aggregateLeaveReports,
  type DateRangePreset,
  resolveDateRange,
} from "@repo/availability";
import { database } from "@repo/database";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import {
  PermissionDeniedError,
  requirePageRole,
} from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";
import { AnalyticsFilters } from "../analytics-filters";
import { ExportCsvButton } from "./export-csv-button";
import {
  LeaveDaysByTeamChart,
  type LeaveDaysByTeamChartItem,
} from "./leave-days-by-team-chart";

export const metadata: Metadata = {
  description: "Analyse leave trends by team.",
  title: "Leave Reports - Team Calendar",
};

interface LeaveReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LeaveReportsPage = async ({ searchParams }: LeaveReportsPageProps) => {
  try {
    await requirePageRole("org:manager");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return (
        <>
          <Header page="Leave Reports" />
          <div className="flex flex-1 flex-col p-6 pt-0">
            <PermissionDeniedState />
          </div>
        </>
      );
    }
    throw error;
  }

  const params = await searchParams;
  const orgParam = Array.isArray(params.org) ? params.org[0] : params.org;
  const [{ orgRole }, user] = await Promise.all([auth(), currentUser()]);
  const role = analyticsRole(orgRole);
  if (!(role && user)) {
    return (
      <>
        <Header page="Leave Reports" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <PermissionDeniedState />
        </div>
      </>
    );
  }

  const { clerkOrgId, organisationId } =
    await requireActiveOrgPageContext(orgParam);
  const organisation = await database.organisation.findFirst({
    select: { timezone: true },
    where: {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      id: organisationId,
    },
  });
  if (!organisation) {
    redirect("/");
  }

  const presetParam = Array.isArray(params.preset)
    ? params.preset[0]
    : params.preset;
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const toParam = Array.isArray(params.to) ? params.to[0] : params.to;
  const validPresets = new Set<DateRangePreset>([
    "this_month",
    "last_month",
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    "last_12_months",
    "custom",
  ]);
  const preset: DateRangePreset =
    presetParam && isDateRangePreset(presetParam, validPresets)
      ? presetParam
      : "this_year";

  const rangeResult = resolveDateRange({
    customEnd: toParam,
    customStart: fromParam,
    preset,
    timezone: organisation.timezone ?? "UTC",
  });
  if (!rangeResult.ok) {
    return (
      <>
        <Header organisationId={organisationId} page="Leave Reports" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="leave reports" />
        </div>
      </>
    );
  }

  const dataResult = await aggregateLeaveReports({
    actingUserId: user.id,
    clerkOrgId,
    dateRange: rangeResult.value,
    filters: {
      includeArchivedPeople: false,
      personType: "all",
    },
    includePublicHolidays: false,
    organisationId,
    role,
  });

  if (!dataResult.ok) {
    return (
      <>
        <Header organisationId={organisationId} page="Leave Reports" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="leave reports" />
        </div>
      </>
    );
  }

  const report = dataResult.value;
  const chartData: LeaveDaysByTeamChartItem[] = report.leaveDaysByTeam
    .slice(0, 10)
    .map((team) => ({
      days: team.days,
      peopleCount: team.peopleCount,
      teamName: team.teamName,
    }));

  return (
    <>
      <Header organisationId={organisationId} page="Leave Reports">
        <ExportCsvButton
          from={fromParam}
          organisationId={organisationId}
          preset={preset}
          to={toParam}
        />
      </Header>
      <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <AnalyticsFilters
          customEnd={toParam}
          customStart={fromParam}
          preset={preset}
        />
        <section className="rounded-[20px] bg-muted p-6">
          <div className="max-w-3xl space-y-2">
            <p className="font-medium text-muted-foreground text-sm">
              Analytics
            </p>
            <h2 className="font-semibold text-2xl tracking-normal">
              Leave trends for {report.range.label}
            </h2>
            <p className="text-muted-foreground text-sm">
              Compare approved leave patterns across teams and identify where
              coverage needs attention.
            </p>
          </div>
        </section>

        <section className="grid gap-6 rounded-[20px] bg-muted p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] md:p-8">
          <div>
            <p className="text-muted-foreground text-sm">
              Leave days · {report.range.label}
            </p>
            <p className="mt-2 font-semibold text-4xl tabular-nums">
              {formatNumber(report.summaryStats.totalLeaveDays)}
            </p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <SummaryFact
              label="Approved records"
              value={report.summaryStats.totalLeaveRecords}
            />
            <SummaryFact
              label="People with leave"
              value={report.summaryStats.peopleWithLeaveInPeriod}
            />
            <SummaryFact
              label="Average days"
              value={report.summaryStats.averageDaysPerPersonWithLeave}
            />
          </dl>
        </section>

        <Card className="rounded-[20px]">
          <CardHeader>
            <CardTitle>Leave days by team</CardTitle>
            <p className="text-muted-foreground text-sm">
              Top teams by approved leave days in the selected period.
            </p>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <LeaveDaysByTeamChart data={chartData} />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl bg-muted text-muted-foreground text-sm">
                No approved leave records were found for this period.
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-xs">
          Generated {formatDateTime(report.dataFreshness.generatedAt)} from{" "}
          {formatNumber(report.dataFreshness.recordCount)} records.
        </p>
      </div>
    </>
  );
};

function SummaryFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-background p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-1 font-semibold text-xl tabular-nums">
        {formatNumber(value)}
      </dd>
    </div>
  );
}

function isDateRangePreset(
  value: string,
  presets: Set<DateRangePreset>
): value is DateRangePreset {
  // The Set is constructed from the complete DateRangePreset union above.
  return presets.has(value as DateRangePreset);
}

function analyticsRole(role: string | null | undefined): AnalyticsRole | null {
  if (role === "org:owner") {
    return "owner";
  }
  if (role === "org:admin") {
    return "admin";
  }
  if (role === "org:manager") {
    return "manager";
  }
  return null;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-AU", {
    maximumFractionDigits: 1,
  });
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default LeaveReportsPage;
