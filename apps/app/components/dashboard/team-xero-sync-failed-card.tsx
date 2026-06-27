import type { ManagerDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";

interface TeamXeroSyncFailedCardProps {
  orgQueryValue: string | null;
  state: ManagerDashboardView["teamXeroSyncFailed"];
}

export function TeamXeroSyncFailedCard({
  state,
  orgQueryValue,
}: TeamXeroSyncFailedCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/people?xeroSyncFailedOnly=true"
        ctaLabel="Review"
        description="Recent failed team records"
        orgQueryValue={orgQueryValue}
        title="Team Xero sync failed"
      >
        <DashboardCardError entityName="team Xero sync failed" />
      </DashboardCardShell>
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/people?xeroSyncFailedOnly=true"
      ctaLabel="Review"
      description="Recent failed team records"
      orgQueryValue={orgQueryValue}
      title="Team Xero sync failed"
    >
      {state.data.count === 0 ? (
        <EmptyState
          description="No failed Xero records are waiting."
          title="No failed records"
        />
      ) : (
        <div className="space-y-3 text-body-sm">
          <p className="font-medium">{state.data.count} failed records</p>
          {state.data.recentRecords.map((record) => (
            <div key={record.recordId}>
              <p className="font-medium">
                {record.personFirstName} {record.personLastName}
              </p>
              <p className="text-muted-foreground">
                {record.recordType.replaceAll("_", " ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardCardShell>
  );
}
