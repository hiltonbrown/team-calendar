import type { AdminDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";

interface OrgPendingApprovalsCardProps {
  orgQueryValue: string | null;
  state: AdminDashboardView["orgWidePendingApprovals"];
}

export function OrgPendingApprovalsCard({
  state,
  orgQueryValue,
}: OrgPendingApprovalsCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/leave-approvals?status=submitted"
        ctaLabel="Review"
        description="Submitted records across the organisation"
        orgQueryValue={orgQueryValue}
        title="Org pending approvals"
      >
        <DashboardCardError entityName="pending approvals" />
      </DashboardCardShell>
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/leave-approvals?status=submitted"
      ctaLabel="Review"
      description="Submitted records across the organisation"
      orgQueryValue={orgQueryValue}
      title="Org pending approvals"
    >
      {state.data.count === 0 ? (
        <EmptyState
          description="No submitted approvals are waiting."
          title="Queue is clear"
        />
      ) : (
        <div className="space-y-2 text-body-sm">
          <p className="font-semibold text-headline-md">{state.data.count}</p>
          <p className="text-muted-foreground">
            Oldest age:{" "}
            {state.data.oldestAgeDays === null
              ? "N/A"
              : `${state.data.oldestAgeDays} days`}
          </p>
        </div>
      )}
    </DashboardCardShell>
  );
}
