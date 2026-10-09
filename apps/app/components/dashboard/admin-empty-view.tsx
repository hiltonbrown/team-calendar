import { DashboardCardShell } from "./dashboard-card-shell";
import { formatFullDate } from "./dashboard-format";
import { DashboardHeader } from "./dashboard-header";
import { DEFAULT_DASHBOARD_TIMEZONE } from "./dashboard-view-state";

interface AdminEmptyViewProps {
  now: Date;
  orgQueryValue: string | null;
}

/** Owners and admins without a person profile in this organisation. */
export function AdminEmptyView({ now, orgQueryValue }: AdminEmptyViewProps) {
  return (
    <div className="space-y-6">
      <DashboardHeader
        dateLabel={formatFullDate(now, DEFAULT_DASHBOARD_TIMEZONE)}
        locationLabel={null}
        orgQueryValue={orgQueryValue}
        scopeLine="Your dashboard is ready. Add people manually, connect Xero, or create calendar feeds when you need them."
      />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCardShell
          ctaHref="/people"
          ctaLabel="Manage people"
          description="Add people manually, or connect Xero to sync them automatically."
          orgQueryValue={orgQueryValue}
          title="People"
        >
          <p className="text-body-sm text-muted-foreground">
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
          <p className="text-body-sm text-muted-foreground">
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
          <p className="text-body-sm text-muted-foreground">
            Create a feed when you are ready to share availability with Google
            Calendar, Outlook, or Apple Calendar.
          </p>
        </DashboardCardShell>
      </div>
    </div>
  );
}
