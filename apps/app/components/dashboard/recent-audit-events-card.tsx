import type { AdminDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDateTime } from "./dashboard-format";

interface RecentAuditEventsCardProps {
  orgQueryValue: string | null;
  state: AdminDashboardView["recentAuditEvents"];
}

export function RecentAuditEventsCard({
  state,
  orgQueryValue,
}: RecentAuditEventsCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/settings/audit-log"
        ctaLabel="Open audit log"
        description="Recent notable changes"
        orgQueryValue={orgQueryValue}
        title="Recent audit events"
      >
        <DashboardCardError entityName="audit events" />
      </DashboardCardShell>
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/settings/audit-log"
      ctaLabel="Open audit log"
      description="Recent notable changes"
      orgQueryValue={orgQueryValue}
      title="Recent audit events"
    >
      {state.data.events.length === 0 ? (
        <EmptyState
          description="No recent audit events matched the dashboard filter."
          title="No events"
        />
      ) : (
        <div className="space-y-3 text-sm">
          {state.data.events.map((event) => (
            <div key={event.id}>
              <p className="font-medium">{event.action}</p>
              <p className="text-muted-foreground">
                {event.actorDisplay}, {formatDateTime(event.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardCardShell>
  );
}
