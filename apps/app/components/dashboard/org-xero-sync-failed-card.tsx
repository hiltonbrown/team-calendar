import type { AdminDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";

interface OrgXeroSyncFailedCardProps {
  orgQueryValue: string | null;
  state: AdminDashboardView["orgWideXeroSyncFailed"];
}

export function OrgXeroSyncFailedCard({
  state,
  orgQueryValue,
}: OrgXeroSyncFailedCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/people?xeroSyncFailedOnly=true"
        ctaLabel="Review"
        description="Failed records across the organisation"
        orgQueryValue={orgQueryValue}
        title="Org Xero sync failed"
      >
        <DashboardCardError entityName="organisation failed records" />
      </DashboardCardShell>
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/people?xeroSyncFailedOnly=true"
      ctaLabel="Review"
      description="Failed records across the organisation"
      orgQueryValue={orgQueryValue}
      title="Org Xero sync failed"
    >
      {state.data.count === 0 ? (
        <EmptyState
          description="No failed Xero records are waiting."
          title="No failed records"
        />
      ) : (
        <div className="space-y-2 text-body-sm">
          <p className="font-semibold text-headline-md">{state.data.count}</p>
          <p className="text-muted-foreground">
            Submit {state.data.byFailedAction.submit}, approve{" "}
            {state.data.byFailedAction.approve}, decline{" "}
            {state.data.byFailedAction.decline}, withdraw{" "}
            {state.data.byFailedAction.withdraw}
          </p>
        </div>
      )}
    </DashboardCardShell>
  );
}
