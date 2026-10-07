import type { AdminDashboardView } from "@repo/availability";
import { xeroRecoveryMessage } from "@repo/core";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDateTime } from "./dashboard-format";
import { MetricTile } from "./metric-tile";

interface SyncHealthCardProps {
  orgQueryValue: string | null;
  state: AdminDashboardView["syncHealth"];
}
export function SyncHealthCard({ state, orgQueryValue }: SyncHealthCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/sync"
        ctaLabel="Open sync"
        description="Xero connection and run status"
        orgQueryValue={orgQueryValue}
        title="Sync health"
      >
        <DashboardCardError entityName="sync health" />
      </DashboardCardShell>
    );
  }
  return (
    <DashboardCardShell
      ctaHref="/sync"
      ctaLabel="Open sync"
      description="Xero connection and run status"
      orgQueryValue={orgQueryValue}
      title="Sync health"
    >
      {state.data.xeroConnectionState === "connected" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <MetricTile label="Tenants" value={state.data.tenantCount} />
          <MetricTile
            label="Active"
            tone={state.data.activeTenantCount > 0 ? "positive" : "neutral"}
            value={state.data.activeTenantCount}
          />
          <MetricTile label="Runs 24h" value={state.data.runsLast24h} />
          <MetricTile
            label="Failed 24h"
            tone={state.data.failedRunsLast24h > 0 ? "danger" : "neutral"}
            value={state.data.failedRunsLast24h}
          />
          <MetricTile
            label="Failed records"
            tone={state.data.pendingFailedRecords > 0 ? "danger" : "neutral"}
            value={state.data.pendingFailedRecords}
          />
          <MetricTile
            label="Last success"
            value={
              state.data.lastSuccessfulSync
                ? formatDateTime(state.data.lastSuccessfulSync)
                : "Never"
            }
          />
        </div>
      ) : (
        <EmptyState
          description={
            state.data.xeroConnectionState === "not_connected"
              ? "No active Xero connection is configured."
              : xeroRecoveryMessage(state.data.xeroConnectionState)
          }
          title={
            state.data.xeroConnectionState === "not_connected"
              ? "Xero not connected"
              : "Xero sync unavailable"
          }
        />
      )}
    </DashboardCardShell>
  );
}
