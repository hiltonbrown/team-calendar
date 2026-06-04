import { DashboardCardShell } from "./dashboard-card-shell";
import { DashboardHeader } from "./dashboard-header";
import { DashboardLayout } from "./dashboard-layout";
import { XeroDisconnectedBanner } from "./xero-disconnected-banner";

interface AdminEmptyViewProps {
  hasActiveXeroConnection: boolean;
  orgQueryValue: string | null;
  roleLabel: "Admin" | "Owner";
}

export function AdminEmptyView({
  hasActiveXeroConnection,
  orgQueryValue,
  roleLabel,
}: AdminEmptyViewProps) {
  return (
    <div className="space-y-6">
      <DashboardHeader
        name="Welcome"
        roleLabel={roleLabel}
        subtitle="Your dashboard is ready. Add people manually, connect Xero, or create calendar feeds when you need them."
        xeroConnected={hasActiveXeroConnection}
      />

      {hasActiveXeroConnection ? null : (
        <XeroDisconnectedBanner
          connectHref="/settings/integrations/xero"
          orgQueryValue={orgQueryValue}
        />
      )}

      <DashboardLayout>
        <DashboardCardShell
          ctaHref="/people"
          ctaLabel="Manage people"
          description="Add people manually, or connect Xero to sync them automatically."
          orgQueryValue={orgQueryValue}
          title="People"
        >
          <p className="text-muted-foreground text-sm">
            People and their availability will appear here once they are added
            to this organisation.
          </p>
        </DashboardCardShell>
        <DashboardCardShell
          ctaHref="/calendar"
          ctaLabel="Open calendar"
          description="View leave, manual availability, and public holidays."
          orgQueryValue={orgQueryValue}
          title="Calendar"
        >
          <p className="text-muted-foreground text-sm">
            The calendar is available now and will fill as records are created
            or synced.
          </p>
        </DashboardCardShell>
        <DashboardCardShell
          ctaHref="/feeds"
          ctaLabel="Manage feeds"
          description="Publish secure ICS feeds for subscribed calendars."
          orgQueryValue={orgQueryValue}
          title="Feeds"
        >
          <p className="text-muted-foreground text-sm">
            Create a feed when you are ready to share availability with Google
            Calendar, Outlook, or Apple Calendar.
          </p>
        </DashboardCardShell>
      </DashboardLayout>
    </div>
  );
}
