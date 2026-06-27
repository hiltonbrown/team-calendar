import type { EmployeeDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDate, formatDaysUntil } from "./dashboard-format";

interface NextPublicHolidayCardProps {
  orgQueryValue: string | null;
  state: EmployeeDashboardView["publicHolidays"];
}

export function NextPublicHolidayCard({
  state,
  orgQueryValue,
}: NextPublicHolidayCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/public-holidays"
        ctaLabel="View holidays"
        description="For your current location"
        orgQueryValue={orgQueryValue}
        title="Next public holiday"
      >
        <DashboardCardError entityName="public holidays" />
      </DashboardCardShell>
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/public-holidays"
      ctaLabel="View holidays"
      description="For your current location"
      orgQueryValue={orgQueryValue}
      title="Next public holiday"
    >
      {state.data.next ? (
        <div className="space-y-2">
          <p className="font-semibold text-body-lg">{state.data.next.name}</p>
          <p className="text-body-sm text-muted-foreground">
            {formatDate(state.data.next.holiday_date)}
          </p>
          <p className="text-body-sm">
            {formatDaysUntil(state.data.daysUntil)}
          </p>
        </div>
      ) : (
        <EmptyState
          description="No upcoming public holiday is scheduled."
          title="No upcoming holiday"
        />
      )}
    </DashboardCardShell>
  );
}
