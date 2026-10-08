import type { ManagerDashboardView } from "@repo/availability";
import { ActionItemsCard } from "./action-items-card";
import { buildManagerCalendarTimeline } from "./ambient-calendar-data";
import { AmbientCalendarField } from "./ambient-calendar-field";
import { ApprovalQueueCard } from "./approval-queue-card";
import { BalancesCard } from "./balances-card";
import {
  DashboardScaffold,
  toDashboardHeaderProps,
} from "./dashboard-scaffold";
import { NextPublicHolidayCard } from "./next-public-holiday-card";
import { QuickActionsCard } from "./quick-actions-card";
import { TeamXeroSyncFailedCard } from "./team-xero-sync-failed-card";
import { TodayStatusCard } from "./today-status-card";
import { UpcomingRecordsCard } from "./upcoming-records-card";
import { XeroDisconnectedBanner } from "./xero-disconnected-banner";

interface ManagerViewProps {
  orgQueryValue: string | null;
  personId: string;
  view: ManagerDashboardView;
}
export function ManagerView({
  view,
  orgQueryValue,
  personId,
}: ManagerViewProps) {
  const xero = view.header.xeroConnectionState === "connected";
  const timeline = buildManagerCalendarTimeline(view, {
    now: new Date(),
    timezone: view.header.timezone ?? "Australia/Brisbane",
  });
  return (
    <DashboardScaffold
      banner={
        xero ? null : (
          <XeroDisconnectedBanner
            connectHref="/settings/integrations"
            orgQueryValue={orgQueryValue}
            xeroConnectionState={view.header.xeroConnectionState}
          />
        )
      }
      feature={
        <AmbientCalendarField model={timeline} orgQueryValue={orgQueryValue} />
      }
      header={toDashboardHeaderProps(view.header)}
      lead={
        <>
          {xero ? (
            <ApprovalQueueCard
              orgQueryValue={orgQueryValue}
              state={view.approvalQueue}
            />
          ) : null}
          <ActionItemsCard
            orgQueryValue={orgQueryValue}
            state={view.actionItems}
          />
        </>
      }
      rail={
        <>
          <TodayStatusCard
            orgQueryValue={orgQueryValue}
            state={view.todayStatus}
          />
          <UpcomingRecordsCard
            orgQueryValue={orgQueryValue}
            state={view.upcoming}
          />
          <NextPublicHolidayCard
            orgQueryValue={orgQueryValue}
            state={view.publicHolidays}
          />
          <QuickActionsCard orgQueryValue={orgQueryValue} />
          {xero ? (
            <BalancesCard
              orgQueryValue={orgQueryValue}
              personId={personId}
              state={view.balances}
            />
          ) : null}
          <TeamXeroSyncFailedCard
            orgQueryValue={orgQueryValue}
            state={view.teamXeroSyncFailed}
          />
        </>
      }
    />
  );
}
