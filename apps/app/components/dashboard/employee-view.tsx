import type { EmployeeDashboardView } from "@repo/availability";
import { ActionItemsCard } from "./action-items-card";
import { BalancesCard } from "./balances-card";
import {
  DashboardScaffold,
  toDashboardHeaderProps,
} from "./dashboard-scaffold";
import { NextPublicHolidayCard } from "./next-public-holiday-card";
import { QuickActionsCard } from "./quick-actions-card";
import { TodayStatusCard } from "./today-status-card";
import { UpcomingRecordsCard } from "./upcoming-records-card";
import { XeroDisconnectedBanner } from "./xero-disconnected-banner";

interface EmployeeViewProps {
  orgQueryValue: string | null;
  personId: string;
  view: EmployeeDashboardView;
}

export function EmployeeView({
  view,
  orgQueryValue,
  personId,
}: EmployeeViewProps) {
  const xero = view.header.hasActiveXeroConnection;

  return (
    <DashboardScaffold
      banner={
        xero ? null : (
          <XeroDisconnectedBanner
            connectHref="/settings/integrations"
            orgQueryValue={orgQueryValue}
          />
        )
      }
      header={toDashboardHeaderProps(view.header)}
      lead={
        <>
          <ActionItemsCard
            orgQueryValue={orgQueryValue}
            state={view.actionItems}
          />
          <TodayStatusCard
            orgQueryValue={orgQueryValue}
            state={view.todayStatus}
          />
          <UpcomingRecordsCard
            orgQueryValue={orgQueryValue}
            state={view.upcoming}
          />
        </>
      }
      rail={
        <>
          <QuickActionsCard orgQueryValue={orgQueryValue} />
          <NextPublicHolidayCard
            orgQueryValue={orgQueryValue}
            state={view.publicHolidays}
          />
          {xero ? (
            <BalancesCard
              orgQueryValue={orgQueryValue}
              personId={personId}
              state={view.balances}
            />
          ) : null}
        </>
      }
    />
  );
}
