import type { AdminDashboardView } from "@repo/availability";
import { ActionItemsCard } from "./action-items-card";
import { ActiveFeedsCard } from "./active-feeds-card";
import { BalancesCard } from "./balances-card";
import {
  DashboardScaffold,
  toDashboardHeaderProps,
} from "./dashboard-scaffold";
import { NextPublicHolidayCard } from "./next-public-holiday-card";
import { OrgPendingApprovalsCard } from "./org-pending-approvals-card";
import { OrgXeroSyncFailedCard } from "./org-xero-sync-failed-card";
import { QuickActionsCard } from "./quick-actions-card";
import { RecentAuditEventsCard } from "./recent-audit-events-card";
import { SyncHealthCard } from "./sync-health-card";
import { TodayStatusCard } from "./today-status-card";
import { UpcomingRecordsCard } from "./upcoming-records-card";
import { UsageVsLimitsCard } from "./usage-vs-limits-card";
import { XeroDisconnectedBanner } from "./xero-disconnected-banner";

interface AdminViewProps {
  orgQueryValue: string | null;
  personId: string;
  view: AdminDashboardView;
}

export function AdminView({ view, orgQueryValue, personId }: AdminViewProps) {
  const xero = view.header.hasActiveXeroConnection;

  return (
    <DashboardScaffold
      banner={
        xero ? null : (
          <XeroDisconnectedBanner
            connectHref="/settings/integrations/xero"
            orgQueryValue={orgQueryValue}
          />
        )
      }
      header={toDashboardHeaderProps(view.header)}
      lead={
        <>
          {xero ? (
            <SyncHealthCard
              orgQueryValue={orgQueryValue}
              state={view.syncHealth}
            />
          ) : null}
          {xero ? (
            <OrgPendingApprovalsCard
              orgQueryValue={orgQueryValue}
              state={view.orgWidePendingApprovals}
            />
          ) : null}
          <ActionItemsCard
            orgQueryValue={orgQueryValue}
            state={view.actionItems}
          />
          <TodayStatusCard
            orgQueryValue={orgQueryValue}
            state={view.todayStatus}
          />
        </>
      }
      rail={
        <>
          <OrgXeroSyncFailedCard
            orgQueryValue={orgQueryValue}
            state={view.orgWideXeroSyncFailed}
          />
          <ActiveFeedsCard
            orgQueryValue={orgQueryValue}
            state={view.activeFeeds}
          />
          <UsageVsLimitsCard
            orgQueryValue={orgQueryValue}
            state={view.usageVsLimits}
          />
          <RecentAuditEventsCard
            orgQueryValue={orgQueryValue}
            state={view.recentAuditEvents}
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
        </>
      }
    />
  );
}
