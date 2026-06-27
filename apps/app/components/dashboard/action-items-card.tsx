import type { EmployeeDashboardView } from "@repo/availability";
import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDateTime } from "./dashboard-format";

interface ActionItemsCardProps {
  orgQueryValue: string | null;
  state: EmployeeDashboardView["actionItems"];
}

export function ActionItemsCard({
  state,
  orgQueryValue,
}: ActionItemsCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        description="Items that need your attention"
        orgQueryValue={orgQueryValue}
        title="Action items"
      >
        <DashboardCardError entityName="action items" />
      </DashboardCardShell>
    );
  }

  const isEmpty =
    state.data.xeroSyncFailedRecords.length === 0 &&
    state.data.declinedRecords.length === 0 &&
    state.data.infoRequestedNotifications.length === 0;

  return (
    <DashboardCardShell
      description="Items that need your attention"
      orgQueryValue={orgQueryValue}
      title="Action items"
    >
      {isEmpty ? (
        <EmptyState
          description="Nothing needs your attention right now."
          title="All clear"
        />
      ) : (
        <div className="space-y-4 text-body-sm">
          {state.data.xeroSyncFailedRecords.map((record) => (
            <div className="flex gap-2.5" key={record.recordId}>
              <ItemDot tone="danger" />
              <div>
                <p className="font-medium">Xero sync failed</p>
                <p className="text-muted-foreground">
                  {record.recordType.replaceAll("_", " ")}
                  {record.xeroWriteError ? `, ${record.xeroWriteError}` : ""}
                </p>
              </div>
            </div>
          ))}
          {state.data.declinedRecords.map((record) => (
            <div className="flex gap-2.5" key={record.recordId}>
              <ItemDot tone="danger" />
              <div>
                <p className="font-medium">Declined request</p>
                <p className="text-muted-foreground">
                  {record.recordType.replaceAll("_", " ")}
                  {record.declinedAt
                    ? `, ${formatDateTime(record.declinedAt)}`
                    : ""}
                </p>
              </div>
            </div>
          ))}
          {state.data.infoRequestedNotifications.map((notification) => (
            <Link
              className="flex gap-2.5"
              href={withOrg(
                notification.actionUrl ??
                  "/notifications?type=leave_info_requested&unreadOnly=true",
                orgQueryValue
              )}
              key={notification.notificationId}
            >
              <ItemDot tone="info" />
              <div>
                <p className="font-medium">{notification.title}</p>
                <p className="text-muted-foreground">{notification.body}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardCardShell>
  );
}

function ItemDot({ tone }: { tone: "danger" | "info" }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
        tone === "danger" ? "bg-destructive" : "bg-on-accent-container"
      }`}
    />
  );
}
