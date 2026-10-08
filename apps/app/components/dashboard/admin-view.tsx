import type { AdminDashboardView } from "@repo/availability";
import { ActionItemsCard } from "./action-items-card";
import { ActiveFeedsCard } from "./active-feeds-card";
import { buildPersonalCalendarTimeline } from "./ambient-calendar-data";
import { AmbientCalendarField } from "./ambient-calendar-field";
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
import { UsageVsLimitsCard } from "./usage-vs-limits-card";
import { XeroDisconnectedBanner } from "./xero-disconnected-banner";

interface AdminViewProps {
  orgQueryValue: string | null;
  personId: string;
  view: AdminDashboardView;
}
export function AdminView({ view, orgQueryValue, personId }: AdminViewProps) {
  const xero = view.header.xeroConnectionState === "connected";
  const timeline = buildPersonalCalendarTimeline(view, {
    now: new Date(),
    timezone: view.header.timezone ?? "Australia/Brisbane",
  });
  return (
    <DashboardScaffold
      banner={
        xero ? null : (
          <XeroDisconnectedBanner
            connectHref="/settings/integrations/xero"
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
