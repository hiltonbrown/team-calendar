import type { ManagerDashboardView } from "@repo/availability";
import { AvailabilityScan } from "@/components/availability/availability-scan";
import {
  type AvailabilityStatusItem,
  toneForStatusKey,
} from "@/components/availability/availability-status";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";

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
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Metric label="On leave" value={state.data.peopleOnLeaveCount} />
            <Metric label="WFH" value={state.data.peopleWorkingFromHomeCount} />
            <Metric
              label="Travelling"
              value={state.data.peopleTravellingCount}
            />
            <Metric
              label="Other unavailable"
              value={state.data.peopleOtherOooCount}
            />
            <Metric label="Available" value={state.data.peopleAvailableCount} />
            <Metric
              label="Sync failed"
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold text-lg">{value}</p>
    </div>
  );
}
