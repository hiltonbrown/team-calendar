import type { ManagerDashboardView } from "@repo/availability";
import { AvailabilityScan } from "@/components/availability/availability-scan";
import {
  type AvailabilityStatusItem,
  toneForStatusKey,
} from "@/components/availability/availability-status";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { MetricTile } from "./metric-tile";

interface TeamTodayCardProps {
  orgQueryValue: string | null;
  state: ManagerDashboardView["teamToday"];
}

export function TeamTodayCard({ state, orgQueryValue }: TeamTodayCardProps) {
  return (
    <DashboardCardShell
      ctaHref="/people"
      ctaLabel="View people"
      description="Status snapshot for your scope"
      orgQueryValue={orgQueryValue}
      title="Team today"
    >
      {state.status === "error" ? (
        <DashboardCardError entityName="team activity" />
      ) : (
        <div className="space-y-4">
          <AvailabilityScan
            actionHref={withOrg("/calendar?scopeType=my_team", orgQueryValue)}
            actionLabel="Open calendar"
            emptyDescription="No active leave, manual availability, public holiday, or Xero sync issue is visible for your team today."
            emptyTitle="Everyone looks available"
            items={state.data.peopleNeedingAttention.map((person) =>
              toScanItem(person, orgQueryValue)
            )}
            title="Needs attention today"
          />
          <div className="grid grid-cols-2 gap-2 text-body-sm sm:grid-cols-3">
            <MetricTile
              label="On leave"
              value={state.data.peopleOnLeaveCount}
            />
            <MetricTile
              label="WFH"
              tone="info"
              value={state.data.peopleWorkingFromHomeCount}
            />
            <MetricTile
              label="Travelling"
              tone="info"
              value={state.data.peopleTravellingCount}
            />
            <MetricTile
              label="Other unavailable"
              value={state.data.peopleOtherOooCount}
            />
            <MetricTile
              label="Available"
              tone="positive"
              value={state.data.peopleAvailableCount}
            />
            <MetricTile
              label="Sync failed"
              tone={
                state.data.peopleWithXeroSyncFailedCount > 0
                  ? "danger"
                  : "neutral"
              }
              value={state.data.peopleWithXeroSyncFailedCount}
            />
          </div>
        </div>
      )}
    </DashboardCardShell>
  );
}

type TeamTodayPerson = Extract<
  ManagerDashboardView["teamToday"],
  { status: "ready" }
>["data"]["peopleNeedingAttention"][number];

function toScanItem(
  person: TeamTodayPerson,
  orgQueryValue: string | null
): AvailabilityStatusItem {
  return {
    approvalStatus: person.approvalStatus,
    contactabilityStatus: person.contactabilityStatus,
    endsAt: person.endsAt,
    href: withOrg(`/people/${person.personId}`, orgQueryValue),
    id: person.personId,
    name: `${person.personFirstName} ${person.personLastName}`,
    personId: person.personId,
    startsAt: person.startsAt,
    statusLabel: person.statusLabel,
    subtitle:
      person.xeroSyncFailedCount > 1
        ? `${person.xeroSyncFailedCount} failed records`
        : null,
    tone: toneForStatusKey({
      statusKey: person.statusKey,
      xeroSyncFailedCount: person.xeroSyncFailedCount,
    }),
  };
}
