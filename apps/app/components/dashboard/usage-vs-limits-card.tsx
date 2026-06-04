import type { AdminDashboardView } from "@repo/availability";
import { LockIcon } from "lucide-react";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";

interface UsageVsLimitsCardProps {
  orgQueryValue: string | null;
  state: AdminDashboardView["usageVsLimits"];
}

export function UsageVsLimitsCard({
  state,
  orgQueryValue,
}: UsageVsLimitsCardProps) {
  return (
    <DashboardCardShell
      ctaHref={
        state.status === "ready" && state.data.visibleToAdmin
          ? "/settings/billing"
          : undefined
      }
      ctaLabel="Billing"
      description="Plan usage against current limits"
      orgQueryValue={orgQueryValue}
      title="Usage vs limits"
    >
      {state.status === "error" ? (
        <DashboardCardError entityName="billing" />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{state.data.plan.label}</p>
              <p className="text-muted-foreground">{state.data.plan.status}</p>
            </div>
            {state.data.visibleToAdmin ? null : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <LockIcon className="size-4" />
                <span>Owner managed</span>
              </div>
            )}
          </div>
          {state.data.metrics.map((metric) => (
            <div key={metric.metricKey}>
              <div className="mb-1 flex items-center justify-between gap-4">
                <span>{metric.label}</span>
                <span>
                  {metric.currentValue} / {metric.limit ?? "Unlimited"}{" "}
                  {metric.unit}
                </span>
              </div>
              {metric.percentage === null ? null : (
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${metric.percentage}%` }}
                  />
                </div>
              )}
            </div>
          ))}
          {state.data.visibleToAdmin ? null : (
            <p className="text-muted-foreground">
              Billing is managed by the account owner.
            </p>
          )}
        </div>
      )}
    </DashboardCardShell>
  );
}
