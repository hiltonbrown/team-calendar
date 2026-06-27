import type { ManagerDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDate, formatPercentage } from "./dashboard-format";

interface UpcomingPeaksCardProps {
  orgQueryValue: string | null;
  state: ManagerDashboardView["upcomingPeaks"];
}

export function UpcomingPeaksCard({
  state,
  orgQueryValue,
}: UpcomingPeaksCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/calendar?scopeType=my_team&view=month"
        ctaLabel="Open month"
        description="Days with more than 20% of your scope away"
        orgQueryValue={orgQueryValue}
        title="Upcoming peaks"
      >
        <DashboardCardError entityName="upcoming peaks" />
      </DashboardCardShell>
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/calendar?scopeType=my_team&view=month"
      ctaLabel="Open month"
      description="Days with more than 20% of your scope away"
      orgQueryValue={orgQueryValue}
      title="Upcoming peaks"
    >
      {state.data.peaks.length === 0 ? (
        <EmptyState
          description="No peak days are forecast in the next month."
          title="No peaks"
        />
      ) : (
        <div className="space-y-3 text-body-sm">
          {state.data.peaks.map((peak) => (
            <div key={peak.date.toISOString()}>
              <p className="font-medium">
                {formatDate(peak.date)}: {peak.peopleAwayCount}/
                {peak.totalPeopleInScope} away
              </p>
              <p className="text-muted-foreground">
                {formatPercentage(peak.percentage)}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardCardShell>
  );
}
