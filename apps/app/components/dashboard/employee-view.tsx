import type { EmployeeDashboardView } from "@repo/availability";
import { BalancesCard } from "./balances-card";
import { formatFullDate } from "./dashboard-format";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeader, REQUEST_LEAVE_ACTION } from "./dashboard-header";
import {
  DEFAULT_DASHBOARD_TIMEZONE,
  showBalances,
} from "./dashboard-view-state";
import { MyRequests } from "./my-requests";
import { NeedsReply } from "./needs-reply";
import { NextPublicHolidayCard } from "./next-public-holiday-card";
import { TimelineSection } from "./timeline-section";

interface EmployeeViewProps {
  now: Date;
  orgQueryValue: string | null;
  personId: string;
  view: EmployeeDashboardView;
}

export function EmployeeView({
  now,
  orgQueryValue,
  personId,
  view,
}: EmployeeViewProps) {
  const timezone = view.header.timezone ?? DEFAULT_DASHBOARD_TIMEZONE;
  return (
    <div className="space-y-6">
      <DashboardHeader
        dateLabel={formatFullDate(now, timezone)}
        locationLabel={view.header.locationName}
        orgQueryValue={orgQueryValue}
        primaryAction={REQUEST_LEAVE_ACTION}
        scopeLine="Your leave and availability"
      />
      <TimelineSection
        now={now}
        orgQueryValue={orgQueryValue}
        state={view.timeline}
        viewerRole="employee"
      />
      <DashboardGrid
        lead={
          <>
            <NeedsReply
              orgQueryValue={orgQueryValue}
              state={view.actionItems}
            />
            <MyRequests
              orgQueryValue={orgQueryValue}
              state={view.myRequests}
              timezone={timezone}
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
