import type { AdminDashboardView } from "@repo/availability";
import { ActiveFeedsCard } from "./active-feeds-card";
import { EmployeeView } from "./employee-view";
import { OrgPendingApprovalsCard } from "./org-pending-approvals-card";
import { OrgXeroSyncFailedCard } from "./org-xero-sync-failed-card";
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
  return (
    <div className="space-y-6">
      <EmployeeView
        orgQueryValue={orgQueryValue}
        personId={personId}
        showXeroBanner={false}
        view={view}
      />
      {view.header.hasActiveXeroConnection ? null : (
        <XeroDisconnectedBanner
          connectHref="/settings/integrations/xero"
          orgQueryValue={orgQueryValue}
        />
      )}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {view.header.hasActiveXeroConnection ? (
          <SyncHealthCard
            orgQueryValue={orgQueryValue}
            state={view.syncHealth}
          />
        ) : null}
        {view.header.hasActiveXeroConnection ? (
          <OrgPendingApprovalsCard
            orgQueryValue={orgQueryValue}
            state={view.orgWidePendingApprovals}
          />
        ) : null}
        <ActiveFeedsCard
          orgQueryValue={orgQueryValue}
          state={view.activeFeeds}
        />
        <UsageVsLimitsCard
          orgQueryValue={orgQueryValue}
          state={view.usageVsLimits}
        />
        <OrgXeroSyncFailedCard
          orgQueryValue={orgQueryValue}
          state={view.orgWideXeroSyncFailed}
        />
        <RecentAuditEventsCard
          orgQueryValue={orgQueryValue}
          state={view.recentAuditEvents}
        />
      </div>
    </div>
  );
}
