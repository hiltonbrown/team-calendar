import type { ManagerDashboardView } from "@repo/availability";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDate } from "./dashboard-format";

interface TeamThisWeekCardProps {
  orgQueryValue: string | null;
  state: ManagerDashboardView["teamThisWeek"];
}

export function TeamThisWeekCard({
  state,
  orgQueryValue,
}: TeamThisWeekCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref="/calendar?scopeType=my_team&view=week"
        ctaLabel="Open week"
        description="Approved leave this week"
        orgQueryValue={orgQueryValue}
        title="Team this week"
      >
        <DashboardCardError entityName="team this week" />
      </DashboardCardShell>
    );
  }

  const isEmpty =
    state.data.peopleWithLeaveCount === 0 &&
    state.data.upcomingRecords.length === 0;

  return (
    <DashboardCardShell
      ctaHref="/calendar?scopeType=my_team&view=week"
      ctaLabel="Open week"
      description="Approved leave this week"
      orgQueryValue={orgQueryValue}
      title="Team this week"
    >
      {isEmpty ? (
        <EmptyState
          description="No approved leave records overlap this week."
          title="Quiet week"
        />
      ) : (
        <div className="space-y-3 text-body-sm">
          <p className="font-medium">
            {state.data.peopleWithLeaveCount} people with leave this week
          </p>
          {state.data.upcomingRecords.map((record) => (
            <div key={record.recordId}>
              <p className="font-medium">
                {record.personFirstName} {record.personLastName}
              </p>
              <p className="text-muted-foreground">
                {record.recordType.replaceAll("_", " ")} from{" "}
                {formatDate(record.startsAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardCardShell>
  );
}
