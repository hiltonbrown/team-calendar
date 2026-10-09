import type { ManagerDashboardView } from "@repo/availability";
import { ApprovalRows } from "./approval-rows";
import { BalancesCard } from "./balances-card";
import { CoverageMapCard } from "./coverage-map";
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

interface ManagerViewProps {
  now: Date;
  orgQueryValue: string | null;
  personId: string;
  view: ManagerDashboardView;
}

export function ManagerView({
  now,
  orgQueryValue,
  personId,
  view,
}: ManagerViewProps) {
  const timezone = view.header.timezone ?? DEFAULT_DASHBOARD_TIMEZONE;
  return (
    <div className="space-y-6">
      <DashboardHeader
        dateLabel={formatFullDate(now, timezone)}
        locationLabel={view.header.locationName}
        orgQueryValue={orgQueryValue}
        scopeLine={view.header.scopeLabel}
        {...approvalHeaderActions(view.approvalQueue)}
      />
      <TimelineSection
        now={now}
        orgQueryValue={orgQueryValue}
        state={view.timeline}
        viewerRole="manager"
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
              title="Waiting for your approval"
            />
          </>
        }
        rail={
          <>
            <CoverageMapCard
              orgQueryValue={orgQueryValue}
              state={view.coverage}
            />
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
