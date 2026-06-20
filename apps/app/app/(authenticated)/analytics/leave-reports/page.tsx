import { auth, currentUser } from "@repo/auth/server";
import {
  type AnalyticsRole,
  aggregateLeaveReports,
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
import {
  LeaveDaysByTeamChart,
  type LeaveDaysByTeamChartItem,
} from "./leave-days-by-team-chart";

export const metadata: Metadata = {
  description: "Analyse leave trends by team.",
  title: "Leave Reports - LeaveSync",
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
          <main className="flex flex-1 flex-col p-6 pt-0">
            <PermissionDeniedState />
          </main>
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
        <main className="flex flex-1 flex-col p-6 pt-0">
          <PermissionDeniedState />
        </main>
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

  const rangeResult = resolveDateRange({
    preset: "this_year",
    timezone: organisation.timezone ?? "UTC",
  });
  if (!rangeResult.ok) {
    return (
      <>
        <Header organisationId={organisationId} page="Leave Reports" />
        <main className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="leave reports" />
        </main>
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
        <main className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="leave reports" />
        </main>
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
      <Header organisationId={organisationId} page="Leave Reports" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <section className="rounded-2xl bg-muted p-6">
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

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard
            label="Leave days"
            value={formatNumber(report.summaryStats.totalLeaveDays)}
          />
          <StatCard
            label="Approved records"
            value={formatNumber(report.summaryStats.totalLeaveRecords)}
          />
          <StatCard
            label="People with leave"
            value={formatNumber(report.summaryStats.peopleWithLeaveInPeriod)}
          />
          <StatCard
            label="Average days"
            value={formatNumber(
              report.summaryStats.averageDaysPerPersonWithLeave
            )}
          />
        </section>

        <Card className="rounded-2xl">
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
      </main>
    </>
  );
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-2 font-semibold text-2xl tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
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
