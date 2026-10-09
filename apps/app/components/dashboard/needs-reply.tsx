import type {
  DashboardInfoRequest,
  DashboardSection,
} from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";

const TITLE = "Needs your reply";
const NOTIFICATIONS_HREF =
  "/notifications?type=leave_info_requested&unreadOnly=true";

interface NeedsReplyProps {
  orgQueryValue: string | null;
  state: DashboardSection<{
    infoRequestedNotifications: DashboardInfoRequest[];
  }>;
}

/** Requests for more information on the viewer's leave. Hidden when empty. */
export function NeedsReply({ orgQueryValue, state }: NeedsReplyProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell orgQueryValue={orgQueryValue} title={TITLE}>
        <DashboardCardError entityName="replies" />
      </DashboardCardShell>
    );
  }
  const notifications = state.data.infoRequestedNotifications;
  if (notifications.length === 0) {
    return null;
  }
  return (
    <DashboardCardShell
      ctaHref={NOTIFICATIONS_HREF}
      ctaLabel="View all"
      orgQueryValue={orgQueryValue}
      title={`${TITLE} (${notifications.length})`}
    >
      <ul className="space-y-2">
        {notifications.map((notification) => (
          <li
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface-container-low px-4 py-3"
            key={notification.notificationId}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium text-on-surface text-title-sm">
                {notification.title}
              </p>
              <p className="text-body-sm text-on-surface-variant">
                {notification.body}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link
                aria-label={`Reply: ${notification.title}`}
                href={withOrg(
                  notification.actionUrl ?? NOTIFICATIONS_HREF,
                  orgQueryValue
                )}
              >
                Reply
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </DashboardCardShell>
  );
}
