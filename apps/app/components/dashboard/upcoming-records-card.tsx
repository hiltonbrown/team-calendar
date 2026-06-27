import type { EmployeeDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDate } from "./dashboard-format";

interface UpcomingRecordsCardProps {
  orgQueryValue: string | null;
  state: EmployeeDashboardView["upcoming"];
}

export function UpcomingRecordsCard({
  state,
  orgQueryValue,
}: UpcomingRecordsCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/plans"
        ctaLabel="View plans"
        description="Next 14 days"
        orgQueryValue={orgQueryValue}
        title="Upcoming"
      >
        <DashboardCardError entityName="upcoming records" />
      </DashboardCardShell>
    );
  }

  return (
    <DashboardCardShell
      ctaHref="/plans"
      ctaLabel="View plans"
      description="Next 14 days"
      orgQueryValue={orgQueryValue}
      title="Upcoming"
    >
      {state.data.next14Days.length === 0 ? (
        <EmptyState
          description="No upcoming records in the next 14 days."
          title="Nothing scheduled"
        />
      ) : (
        <div className="space-y-3 text-body-sm">
          {state.data.next14Days.map((record) => (
            <div
              className="flex items-center justify-between gap-4"
              key={record.recordId}
            >
              <div>
                <p className="font-medium">
                  {record.recordType.replaceAll("_", " ")}
                </p>
                <p className="text-muted-foreground">
                  {formatDate(record.startsAt)} to {formatDate(record.endsAt)}
                </p>
              </div>
              <p className="text-muted-foreground">
                {record.approvalStatus.replaceAll("_", " ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardCardShell>
  );
}
