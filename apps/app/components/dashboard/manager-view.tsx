import type { ManagerDashboardView } from "@repo/availability";
import { ActionItemsCard } from "./action-items-card";
import { ApprovalQueueCard } from "./approval-queue-card";
import { BalancesCard } from "./balances-card";
import { CoverageTimeline } from "./coverage-timeline";
import { buildCoverageDays } from "./coverage-timeline-data";
import {
  DashboardScaffold,
  toDashboardHeaderProps,
} from "./dashboard-scaffold";
import { NextPublicHolidayCard } from "./next-public-holiday-card";
import { QuickActionsCard } from "./quick-actions-card";
import { TeamThisWeekCard } from "./team-this-week-card";
import { TeamTodayCard } from "./team-today-card";
import { TeamXeroSyncFailedCard } from "./team-xero-sync-failed-card";
import { TodayStatusCard } from "./today-status-card";
import { UpcomingPeaksCard } from "./upcoming-peaks-card";
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
  const xero = view.header.hasActiveXeroConnection;
  const coverage =
    view.teamToday.status === "ready"
      ? buildCoverageDays(
          view.teamToday.data,
          view.upcomingPeaks.status === "ready"
            ? view.upcomingPeaks.data.peaks
            : null
        )
      : null;

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
          {coverage && coverage.total > 0 ? (
            <CoverageTimeline
              days={coverage.days}
              orgQueryValue={orgQueryValue}
              total={coverage.total}
            />
          ) : null}
          <TeamTodayCard orgQueryValue={orgQueryValue} state={view.teamToday} />
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
          <UpcomingPeaksCard
            orgQueryValue={orgQueryValue}
            state={view.upcomingPeaks}
          />
          <TeamThisWeekCard
            orgQueryValue={orgQueryValue}
            state={view.teamThisWeek}
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
