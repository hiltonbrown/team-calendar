import type { AdminDashboardView } from "@repo/availability";
import { ApprovalRows } from "./approval-rows";
import { BalancesCard } from "./balances-card";
import { formatFullDate } from "./dashboard-format";
import { DashboardGrid } from "./dashboard-grid";
import { approvalHeaderActions, DashboardHeader } from "./dashboard-header";
import {
  DEFAULT_DASHBOARD_TIMEZONE,
  showBalances,
} from "./dashboard-view-state";
import { NeedsReply } from "./needs-reply";
import { NextPublicHolidayCard } from "./next-public-holiday-card";
import { TimelineSection } from "./timeline-section";

interface AdminViewProps {
  now: Date;
  orgQueryValue: string | null;
  personId: string;
  view: AdminDashboardView;
}

export function AdminView({
  now,
  orgQueryValue,
  personId,
  view,
}: AdminViewProps) {
  const timezone = view.header.timezone ?? DEFAULT_DASHBOARD_TIMEZONE;
  const peopleCount = view.header.totalActivePeopleCount;
  return (
    <div className="space-y-6">
      <DashboardHeader
        dateLabel={formatFullDate(now, timezone)}
        locationLabel={view.header.locationName}
        orgQueryValue={orgQueryValue}
        scopeLine={`${view.header.organisationName} · ${peopleCount} ${peopleCount === 1 ? "person" : "people"}`}
        {...approvalHeaderActions(view.approvalQueue)}
      />
      <TimelineSection
        now={now}
        orgQueryValue={orgQueryValue}
        state={view.timeline}
        viewerRole="admin"
      />
      <DashboardGrid
        lead={
          <>
            <NeedsReply
              orgQueryValue={orgQueryValue}
              state={view.actionItems}
            />
            <ApprovalRows
              now={now}
              orgQueryValue={orgQueryValue}
              state={view.approvalQueue}
              timezone={timezone}
              title="Waiting for approval"
            />
          </>
        }
        rail={
          <>
            {showBalances(view.balances) ? (
              <BalancesCard
                orgQueryValue={orgQueryValue}
                personId={personId}
                state={view.balances}
              />
            ) : null}
            <NextPublicHolidayCard
              orgQueryValue={orgQueryValue}
              state={view.publicHolidays}
            />
          </>
        }
      />
    </div>
  );
}
