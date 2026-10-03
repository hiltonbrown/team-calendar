import { AlertCircleIcon, CheckCircle2Icon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";

interface CalendarSyncStatusProps {
  businessName: string;
  isPersonalUnlinked: boolean;
  isStale: boolean;
  isSyncPaused: boolean;
  lastLeaveRefresh: Date | null;
  orgQueryValue: string | null;
  syncError: string | null;
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

function SyncStatusBadge({
  isStale,
  isSyncPaused,
  lastLeaveRefresh,
  syncError,
}: {
  isStale: boolean;
  isSyncPaused: boolean;
  lastLeaveRefresh: Date | null;
  syncError: string | null;
}) {
  if (syncError) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
        <AlertCircleIcon aria-hidden="true" className="size-3.5" />
        Sync issue: {syncError}
      </span>
    );
  }

  if (isSyncPaused) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <ClockIcon aria-hidden="true" className="size-3.5" />
        Sync paused
      </span>
    );
  }

  if (isStale) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <ClockIcon aria-hidden="true" className="size-3.5" />
        Sync delayed: leave may be stale
        {lastLeaveRefresh
          ? ` (last synced ${formatRelativeTime(lastLeaveRefresh)})`
          : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <CheckCircle2Icon aria-hidden="true" className="size-3.5 text-primary" />
      {lastLeaveRefresh
        ? `Leave synced ${formatRelativeTime(lastLeaveRefresh)}`
        : "Leave synced"}
    </span>
  );
}

export function CalendarSyncStatus({
  businessName,
  isPersonalUnlinked,
  isStale,
  isSyncPaused,
  lastLeaveRefresh,
  orgQueryValue,
  syncError,
}: CalendarSyncStatusProps) {
  return (
    <div className="flex flex-col gap-3">
      {isPersonalUnlinked ? (
        <div
          aria-label="Account not linked"
          className="flex flex-col gap-2 rounded-2xl bg-amber-500/10 p-4 text-amber-900 text-label-md sm:flex-row sm:items-center sm:justify-between dark:bg-amber-500/20 dark:text-amber-200"
          role="status"
        >
          <div className="flex items-center gap-2">
            <AlertCircleIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <p>
              Your account is not linked to a person in this organisation.
              Personal leave requests and balances will not be shown.
            </p>
          </div>
          <Link
            className="font-medium text-amber-900 underline hover:no-underline dark:text-amber-100"
            href={withOrg("/settings/integrations/xero/matches", orgQueryValue)}
          >
            Review people
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-2.5 text-label-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-medium text-foreground">{businessName}</span>
          <span aria-hidden="true" className="text-muted-foreground/40">
            ·
          </span>
          <SyncStatusBadge
            isStale={isStale}
            isSyncPaused={isSyncPaused}
            lastLeaveRefresh={lastLeaveRefresh}
            syncError={syncError}
          />
        </div>

        <Link
          className="font-medium text-label-sm text-primary hover:underline"
          href={withOrg("/settings/integrations/xero", orgQueryValue)}
        >
          Integration settings
        </Link>
      </div>
    </div>
  );
}
