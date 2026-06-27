import type { EmployeeDashboardView } from "@repo/availability";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDate } from "./dashboard-format";

interface TodayStatusCardProps {
  orgQueryValue: string | null;
  state: EmployeeDashboardView["todayStatus"];
}

export function TodayStatusCard({
  state,
  orgQueryValue,
}: TodayStatusCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/calendar?scopeType=my_self"
        ctaLabel="Open calendar"
        description="Your current availability"
        orgQueryValue={orgQueryValue}
        title="Today"
      >
        <DashboardCardError entityName="today status" />
      </DashboardCardShell>
    );
  }

  let content: ReactNode;

  if (state.data.activeRecord) {
    content = (
      <div className="space-y-2">
        <p className="font-semibold text-body-lg">
          {state.data.currentStatus.label}
        </p>
        <p className="text-body-sm text-muted-foreground">
          {formatDate(state.data.activeRecord.startsAt)} to{" "}
          {formatDate(state.data.activeRecord.endsAt)}
        </p>
      </div>
    );
  } else if (state.data.activePublicHoliday) {
    content = (
      <div className="space-y-2">
        <p className="font-semibold text-body-lg">Public holiday</p>
        <p className="text-body-sm text-muted-foreground">
          {state.data.activePublicHoliday.name}
        </p>
      </div>
    );
  } else {
    content = (
      <EmptyState
        description="No active leave or availability record today."
        title="Available today"
      />
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/calendar?scopeType=my_self"
      ctaLabel="Open calendar"
      description="Your current availability"
      orgQueryValue={orgQueryValue}
      title="Today"
    >
      {content}
    </DashboardCardShell>
  );
}
