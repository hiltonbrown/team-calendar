import { auth, currentUser } from "@repo/auth/server";
import {
  type AnalyticsRole,
  aggregateOutOfOffice,
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
import { OooDaysByTypeChart } from "./ooo-days-by-type-chart";
import { OooDaysMonthlyChart } from "./ooo-days-monthly-chart";

export const metadata: Metadata = {
  description: "Analyse out-of-office and travel trends.",
  title: "Out of Office - Team Calendar",
};

interface OutOfOfficePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const OutOfOfficePage = async ({ searchParams }: OutOfOfficePageProps) => {
  try {
    await requirePageRole("org:manager");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return (
        <>
          <Header page="Out of Office" />
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
        <Header page="Out of Office" />
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
        <Header organisationId={organisationId} page="Out of Office" />
        <main className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="out-of-office records" />
        </main>
      </>
    );
  }

  const dataResult = await aggregateOutOfOffice({
    actingUserId: user.id,
    clerkOrgId,
    dateRange: rangeResult.value,
    filters: {
      includeArchivedPeople: false,
      personType: "all",
    },
    organisationId,
    role,
  });

  if (!dataResult.ok) {
    return (
      <>
        <Header organisationId={organisationId} page="Out of Office" />
        <main className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState entityName="out-of-office records" />
        </main>
      </>
    );
  }

  const report = dataResult.value;

  const donutChartData = report.oooTypeDonut.map((item) => ({
    days: item.days,
    label: item.label,
    recordType: item.recordType,
  }));

  const months = report.oooDaysByTypeMonthly.months;
  const series = report.oooDaysByTypeMonthly.series;

  const monthlyChartData = months.map((month, monthIndex) => {
    const item: Record<string, string | number> = {
      month: formatMonthLabel(month),
    };
    for (const s of series) {
      item[s.recordType] = s.values[monthIndex] ?? 0;
    }
    return item;
  });

  const recordTypes = series.map((s) => s.recordType);

  const mostCommonTypeLabel = report.summaryStats.mostCommonOooType
    ? `${labelForRecordType(report.summaryStats.mostCommonOooType)} (${formatNumber(report.summaryStats.mostCommonOooTypeDays)} d)`
    : "None";

  return (
    <>
      <Header organisationId={organisationId} page="Out of Office" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <section className="rounded-2xl bg-muted p-6">
          <div className="max-w-3xl space-y-2">
            <p className="font-medium text-muted-foreground text-sm">
              Analytics
            </p>
            <h2 className="font-semibold text-2xl tracking-normal">
              Out-of-office trends for {report.range.label}
            </h2>
            <p className="text-muted-foreground text-sm">
              Analyse approved out-of-office and travel patterns to understand
              presence.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          <StatCard
            label="Out-of-office days"
            value={formatNumber(report.summaryStats.totalOooDays)}
          />
          <StatCard
            label="Approved records"
            value={formatNumber(report.summaryStats.totalRecords)}
          />
          <StatCard
            label="People out-of-office"
            value={formatNumber(report.summaryStats.peopleWithOooInPeriod)}
          />
          <StatCard
            label="Average days"
            value={formatNumber(
              report.summaryStats.averageDaysPerPersonWithOoo
            )}
          />
          <StatCard label="Most common type" value={mostCommonTypeLabel} />
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Out-of-office by type</CardTitle>
              <p className="text-muted-foreground text-sm">
                Approved out-of-office days by type in the selected period.
              </p>
            </CardHeader>
            <CardContent>
              {donutChartData.length > 0 ? (
                <OooDaysByTypeChart data={donutChartData} />
              ) : (
                <div className="flex min-h-[280px] items-center justify-center rounded-2xl bg-muted text-muted-foreground text-sm">
                  No approved out-of-office records were found for this period.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Monthly trends</CardTitle>
              <p className="text-muted-foreground text-sm">
                Approved out-of-office days by type monthly.
              </p>
            </CardHeader>
            <CardContent>
              {report.summaryStats.totalOooDays > 0 ? (
                <OooDaysMonthlyChart
                  data={monthlyChartData}
                  recordTypes={recordTypes}
                />
              ) : (
                <div className="flex min-h-[280px] items-center justify-center rounded-2xl bg-muted text-muted-foreground text-sm">
                  No approved out-of-office records were found for this period.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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

function formatMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  if (!(year && month)) {
    return monthStr;
  }
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function labelForRecordType(recordType: string): string {
  if (recordType === "wfh") {
    return "WFH";
  }
  return recordType
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default OutOfOfficePage;
