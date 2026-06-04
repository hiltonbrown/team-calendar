"use client";

import type {
  RunListItem,
  SyncRunStatus,
  SyncRunType,
  SyncTriggerType,
  TenantSummary,
} from "@repo/availability";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { useNotificationEvents } from "@repo/notifications/components/provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EmptyState } from "@/components/states/empty-state";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";
import { dispatchManualSyncAction } from "./_actions";
import type { SyncRunFiltersInput } from "./_schemas";

interface SyncClientProps {
  filters: SyncRunFiltersInput;
  nextCursor: string | null;
  organisationId: string;
  runs: RunListItem[];
  summaries: TenantSummary[];
}

const runTypeOptions: Array<{
  label: string;
  value: SyncRunType;
  wired: boolean;
}> = [
  { label: "Sync people", value: "people", wired: false },
  { label: "Sync leave records", value: "leave_records", wired: false },
  { label: "Sync balances", value: "leave_balances", wired: false },
  {
    label: "Reconcile approvals",
    value: "approval_state_reconciliation",
    wired: true,
  },
];

export function SyncClient({
  filters,
  nextCursor,
  organisationId,
  runs,
  summaries,
}: SyncClientProps) {
  const router = useRouter();
  const { subscribe } = useNotificationEvents();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(
    () =>
      subscribe((event) => {
        if (
          event.type === "sync.run_status_changed" &&
          event.payload.organisationId === organisationId
        ) {
          router.refresh();
        }
      }),
    [organisationId, router, subscribe]
  );

  const loadMoreHref = useMemo(() => {
    if (!nextCursor) {
      return null;
    }
    return `/sync?${buildQuery({ ...filters, cursor: nextCursor })}`;
  }, [filters, nextCursor]);

  const dispatch = (xeroTenantId: string, runType: SyncRunType) => {
    startTransition(async () => {
      const result = await dispatchManualSyncAction({
        organisationId,
        runType,
        xeroTenantId,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      if (!result.value.queued) {
        setMessage(reasonLabel(result.value.reason));
        return;
      }
      setMessage("Sync queued.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-2xl bg-muted px-4 py-3 text-sm">{message}</div>
      )}

      {summaries.length === 0 ? (
        <EmptyState
          description="Connect Xero in Settings > Integrations > Xero to monitor sync health."
          title="No Xero tenants"
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {summaries.map((summary) => (
            <TenantCard
              disabled={isPending}
              key={summary.xeroTenantId}
              onDispatch={dispatch}
              summary={summary}
            />
          ))}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-semibold text-lg">Run history</h2>
            <p className="text-muted-foreground text-sm">
              Runs are ordered from newest to oldest.
            </p>
          </div>
          <FilterBar filters={filters} summaries={summaries} />
        </div>

        {runs.length === 0 ? (
          <EmptyState
            description="No sync runs match the current filters."
            title="No runs found"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl bg-muted">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-4 font-medium">Tenant</th>
                    <th className="p-4 font-medium">Run type</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Trigger</th>
                    <th className="p-4 font-medium">Started</th>
                    <th className="p-4 font-medium">Duration</th>
                    <th className="p-4 font-medium">Records</th>
                    <th className="p-4 font-medium">Triggered by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background">
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="p-4">{run.tenantName}</td>
                      <td className="p-4">{runTypeLabel(run.runType)}</td>
                      <td className="p-4">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="p-4">
                        {triggerTypeLabel(run.triggerType)}
                      </td>
                      <td className="p-4">{formatDateTime(run.startedAt)}</td>
                      <td className="p-4">
                        {formatDuration(run.durationSeconds)}
                      </td>
                      <td className="p-4">
                        {run.recordsUpserted} upserted, {run.recordsFailed}{" "}
                        failed
                      </td>
                      <td className="p-4">{run.triggeredByUserDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loadMoreHref && (
          <Button asChild variant="secondary">
            <Link href={loadMoreHref}>Load more</Link>
          </Button>
        )}
      </section>
    </div>
  );
}

function TenantCard({
  disabled,
  onDispatch,
  summary,
}: {
  disabled: boolean;
  onDispatch: (xeroTenantId: string, runType: SyncRunType) => void;
  summary: TenantSummary;
}) {
  const hasFailures =
    summary.failedRunsLast30Days > 0 || summary.pendingFailedRecords > 0;

  return (
    <article className="space-y-4 rounded-2xl bg-muted p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{summary.tenantName}</h2>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary">{summary.payrollRegion}</Badge>
            <ConnectionDot status={summary.connectionStatus} />
          </div>
        </div>
        {summary.pendingFailedRecords > 0 && (
          <Button asChild size="sm" variant="secondary">
            <Link
              href={`/sync?${buildQuery({
                status: ["failed", "partial_success"],
                xeroTenantId: [summary.xeroTenantId],
              })}`}
            >
              {summary.pendingFailedRecords} pending failures
            </Link>
          </Button>
        )}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <SummaryCell
          label="People"
          value={relativeTime(summary.lastPeopleSync)}
        />
        <SummaryCell
          label="Leave records"
          value={relativeTime(summary.lastLeaveRecordsSync)}
        />
        <SummaryCell
          label="Balances"
          value={relativeTime(summary.lastLeaveBalancesSync)}
        />
        <SummaryCell
          label="Reconciliation"
          value={relativeTime(summary.lastApprovalReconciliation)}
        />
      </dl>

      {hasFailures && (
        <XeroSyncFailedState
          message="Recent sync failures need review before downstream data can be trusted."
          retrySlot={
            <Button asChild size="sm" variant="secondary">
              <Link
                href={`/sync?${buildQuery({ xeroTenantId: [summary.xeroTenantId] })}`}
              >
                View run history
              </Link>
            </Button>
          }
        />
      )}

      <div className="flex flex-wrap gap-2">
        {runTypeOptions.map((option) => {
          const running = summary.currentRun?.runType === option.value;
          const connectionInactive = summary.connectionStatus !== "active";
          const buttonDisabled =
            disabled || running || connectionInactive || !option.wired;
          return running ? (
            <span
              className="inline-flex h-9 items-center rounded-xl bg-primary/10 px-3 font-medium text-primary text-sm motion-safe:animate-pulse"
              key={option.value}
            >
              Running
            </span>
          ) : (
            <Button
              disabled={buttonDisabled}
              key={option.value}
              onClick={() => onDispatch(summary.xeroTenantId, option.value)}
              size="sm"
              title={buttonTitle(option.wired, connectionInactive)}
              type="button"
              variant="secondary"
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </article>
  );
}

function FilterBar({
  filters,
  summaries,
}: {
  filters: SyncRunFiltersInput;
  summaries: TenantSummary[];
}) {
  const router = useRouter();
  const [tenant, setTenant] = useState(filters.xeroTenantId?.[0] ?? "all");
  const [runType, setRunType] = useState(filters.runType?.[0] ?? "all");
  const [status, setStatus] = useState(filters.status?.[0] ?? "all");
  const [triggerType, setTriggerType] = useState(
    filters.triggerType?.[0] ?? "all"
  );

  const apply = () => {
    router.push(
      `/sync?${buildQuery({
        runType: runType === "all" ? undefined : [runType],
        status: status === "all" ? undefined : [status],
        triggerType: triggerType === "all" ? undefined : [triggerType],
        xeroTenantId: tenant === "all" ? undefined : [tenant],
      })}`
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-muted p-3">
      <SelectFilter
        label="Tenant"
        onChange={setTenant}
        options={[
          { label: "All tenants", value: "all" },
          ...summaries.map((summary) => ({
            label: summary.tenantName,
            value: summary.xeroTenantId,
          })),
        ]}
        value={tenant}
      />
      <SelectFilter
        label="Run type"
        onChange={setRunType}
        options={[
          { label: "All types", value: "all" },
          ...runTypeOptions.map((option) => ({
            label: runTypeLabel(option.value),
            value: option.value,
          })),
        ]}
        value={runType}
      />
      <SelectFilter
        label="Status"
        onChange={setStatus}
        options={[
          { label: "All statuses", value: "all" },
          ...(
            [
              "running",
              "succeeded",
              "partial_success",
              "failed",
              "cancelled",
            ] as SyncRunStatus[]
          ).map((value) => ({ label: statusLabel(value), value })),
        ]}
        value={status}
      />
      <SelectFilter
        label="Trigger"
        onChange={setTriggerType}
        options={[
          { label: "All triggers", value: "all" },
          ...(["scheduled", "manual", "webhook"] as SyncTriggerType[]).map(
            (value) => ({ label: triggerTypeLabel(value), value })
          ),
        ]}
        value={triggerType}
      />
      <Button onClick={apply} type="button">
        Apply
      </Button>
    </div>
  );
}

function SelectFilter({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-9 rounded-xl bg-background px-3"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium text-sm">{value}</dd>
    </div>
  );
}

function ConnectionDot({
  status,
}: {
  status: TenantSummary["connectionStatus"];
}) {
  const colour = {
    active: "bg-emerald-500",
    expired: "bg-amber-500",
    not_configured: "bg-muted-foreground",
    revoked: "bg-red-500",
  }[status];
  return (
    <span
      className="inline-flex items-center gap-2 text-muted-foreground text-sm"
      title={
        status === "revoked"
          ? "Reconnect in Settings > Integrations > Xero"
          : undefined
      }
    >
      <span className={`size-2 rounded-full ${colour}`} />
      {statusLabel(status)}
    </span>
  );
}

function StatusBadge({ status }: { status: SyncRunStatus }) {
  const className = {
    cancelled: "bg-muted-foreground text-background",
    failed: "bg-red-600 text-white",
    partial_success: "bg-amber-500 text-white",
    running: "bg-blue-600 text-white motion-safe:animate-pulse",
    succeeded: "bg-emerald-600 text-white",
  }[status];
  return <Badge className={className}>{statusLabel(status)}</Badge>;
}

function buildQuery(input: {
  cursor?: string;
  runType?: string[];
  status?: string[];
  triggerType?: string[];
  xeroTenantId?: string[];
}): string {
  const params = new URLSearchParams();
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  for (const key of [
    "runType",
    "status",
    "triggerType",
    "xeroTenantId",
  ] as const) {
    const values = input[key];
    if (values?.length) {
      params.set(key, values.join(","));
    }
  }
  return params.toString();
}

function buttonTitle(
  wired: boolean,
  connectionInactive: boolean
): string | undefined {
  if (!wired) {
    return "This sync job is not registered yet.";
  }
  if (connectionInactive) {
    return "Reconnect Xero before running this sync.";
  }
  return;
}

function reasonLabel(reason?: string): string {
  if (reason === "connection_not_active") {
    return "Reconnect Xero before running this sync.";
  }
  if (reason === "dispatch_not_wired") {
    return "This sync job is not registered yet.";
  }
  return "Sync was not queued.";
}

function runTypeLabel(runType: SyncRunType): string {
  return {
    approval_state_reconciliation: "Approval reconciliation",
    leave_balances: "Leave balances",
    leave_records: "Leave records",
    people: "People",
  }[runType];
}

function triggerTypeLabel(triggerType: SyncTriggerType): string {
  return {
    manual: "Manual",
    scheduled: "Scheduled",
    webhook: "Webhook",
  }[triggerType];
}

function statusLabel(
  status: SyncRunStatus | TenantSummary["connectionStatus"]
): string {
  return status.replaceAll("_", " ");
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function relativeTime(value: Date | null): string {
  if (!value) {
    return "Never";
  }
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return "Just now";
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "Running";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
