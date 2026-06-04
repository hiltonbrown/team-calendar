import type { AdminDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDateTime } from "./dashboard-format";

interface ActiveFeedsCardProps {
  orgQueryValue: string | null;
  state: AdminDashboardView["activeFeeds"];
}

export function ActiveFeedsCard({
  state,
  orgQueryValue,
}: ActiveFeedsCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/feeds"
        ctaLabel="Open feeds"
        description="Calendar publishing health"
        orgQueryValue={orgQueryValue}
        title="Active feeds"
      >
        <DashboardCardError entityName="feeds" />
      </DashboardCardShell>
    );
  }

  const isEmpty = state.data.activeCount === 0 && state.data.pausedCount === 0;

  return (
    <DashboardCardShell
      ctaHref="/feeds"
      ctaLabel="Open feeds"
      description="Calendar publishing health"
      orgQueryValue={orgQueryValue}
      title="Active feeds"
    >
      {isEmpty ? (
        <EmptyState
          description="No feeds have been created yet."
          title="No feeds"
        />
      ) : (
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-2xl">{state.data.activeCount}</p>
          <p className="text-muted-foreground">
            {state.data.pausedCount} paused
          </p>
          <p className="text-muted-foreground">
            Last render:{" "}
            {state.data.lastRenderedAt
              ? formatDateTime(state.data.lastRenderedAt)
              : "Never"}
          </p>
        </div>
      )}
    </DashboardCardShell>
  );
}
