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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useNotificationEvents } from "@repo/notifications/components/provider";
import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { statusToneClasses } from "@/components/availability/availability-status";
import { EmptyState } from "@/components/states/empty-state";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";
import { withOrg } from "@/lib/navigation/org-url";
import { dispatchManualSyncAction } from "./_actions";
import type { SyncRunFiltersInput } from "./_schemas";

interface SyncClientProps {
  filters: SyncRunFiltersInput;
  nextCursor: string | null;
  organisationId: string;
  orgQueryValue: string | null;
  runs: RunListItem[];
  summaries: TenantSummary[];
}

const runTypeOptions: Array<{
  label: string;
  value: SyncRunType;
  wired: boolean;
}> = [
  { label: "Sync people", value: "people", wired: true },
  { label: "Sync leave records", value: "leave_records", wired: true },
  { label: "Sync balances", value: "leave_balances", wired: true },
  {
    label: "Reconcile approvals",
    value: "approval_state_reconciliation",
    wired: true,
  },
];
const syncRunStatuses: SyncRunStatus[] = [
  "running",
  "succeeded",
  "partial_success",
  "failed",
  "cancelled",
];
const syncTriggerTypes: SyncTriggerType[] = ["scheduled", "manual", "webhook"];

interface PendingDispatch {
  runType: SyncRunType;
  xeroTenantId: string;
}

export function SyncClient({
  filters,
  nextCursor,
  orgQueryValue,
  organisationId,
  runs,
  summaries,
}: SyncClientProps) {
  const router = useRouter();
  const { subscribe } = useNotificationEvents();
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);
  const [, startTransition] = useTransition();
  const pendingDispatchesRef = useRef(new Map<string, PendingDispatch>());
  const [pendingDispatches, setPendingDispatches] = useState<PendingDispatch[]>(
    []
  );

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
    return withOrg(
      `/sync?${buildQuery({ ...filters, cursor: nextCursor })}`,
      orgQueryValue
    );
  }, [filters, nextCursor, orgQueryValue]);

  const dispatch = (xeroTenantId: string, runType: SyncRunType) => {
    const key = pendingDispatchKey({ runType, xeroTenantId });
    if (pendingDispatchesRef.current.has(key)) {
      return;
    }
    pendingDispatchesRef.current.set(key, { runType, xeroTenantId });
    setPendingDispatches([...pendingDispatchesRef.current.values()]);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sync dispatch handles queued/failed/succeeded branching with counts
    startTransition(async () => {
      try {
        const result = await dispatchManualSyncAction({
          organisationId,
          runType,
          xeroTenantId,
        });
        if (!result.ok) {
          setMessage({ text: result.error.message, tone: "error" });
          return;
        }
        if (!result.value.queued) {
          setMessage({
            text: reasonLabel(result.value.reason),
            tone: "error",
          });
          return;
        }
        const v = result.value as {
          errorSummary?: string | null;
          failed?: number;
          fetched?: number;
          runId?: string;
          status?: string;
          upserted?: number;
        };
        // Surface NZ/UK guard and other succeeded-with-notice cases
        if (v.errorSummary) {
          setMessage({ text: v.errorSummary, tone: "status" });
        } else if (
          typeof v.fetched === "number" ||
          typeof v.upserted === "number"
        ) {
          const parts: string[] = [];
          if (typeof v.fetched === "number") {
            parts.push(`${v.fetched} fetched`);
          }
          if (typeof v.upserted === "number") {
            parts.push(`${v.upserted} upserted`);
          }
          if (typeof v.failed === "number" && v.failed > 0) {
            parts.push(`${v.failed} failed`);
          }
          const detail = parts.length ? ` — ${parts.join(", ")}` : "";
          setMessage({
            text: `Sync ${v.status ?? "completed"}${detail}.`,
            tone: v.failed && v.failed > 0 ? "error" : "status",
          });
        } else {
          setMessage({ text: "Sync queued.", tone: "status" });
        }
        router.refresh();
      } catch (error) {
        setMessage({
          text:
            error instanceof Error
              ? error.message
              : "Failed to dispatch manual sync.",
          tone: "error",
        });
      } finally {
        pendingDispatchesRef.current.delete(key);
        setPendingDispatches([...pendingDispatchesRef.current.values()]);
      }
    });
  };

  return (
    <div className="space-y-6">
      {message ? (
        <div
          aria-live={message.tone === "error" ? "assertive" : "polite"}
          className="rounded-2xl bg-muted px-4 py-3 text-sm"
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </div>
      ) : null}

      {summaries.length === 0 ? (
        <EmptyState
          description="Connect Xero from the integrations settings to monitor sync health."
          title="No Xero tenants"
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {summaries.map((summary) => (
            <TenantCard
              key={summary.xeroTenantId}
              onDispatch={dispatch}
              orgQueryValue={orgQueryValue}
              pendingRunTypes={pendingDispatches
                .filter(
                  (pending) => pending.xeroTenantId === summary.xeroTenantId
                )
                .map((pending) => pending.runType)}
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
          <FilterBar
            filters={filters}
            orgQueryValue={orgQueryValue}
            summaries={summaries}
          />
        </div>

        {runs.length === 0 ? (
          <EmptyState
            actionSlot={
              hasActiveFilters(filters) ? (
                <Button asChild variant="secondary">
                  <Link href={withOrg("/sync", orgQueryValue)}>
                    Clear filters
                  </Link>
                </Button>
              ) : undefined
            }
            description={
              hasActiveFilters(filters)
                ? "No sync runs match these filters. Clear them to return to the full history."
                : "Completed and active sync runs will appear here."
            }
            title={
              hasActiveFilters(filters) ? "No matching runs" : "No runs yet"
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl bg-muted">
            <div className="space-y-3 p-3 md:hidden">
              {runs.map((run) => (
                <RunHistoryCard
                  key={run.id}
                  orgQueryValue={orgQueryValue}
                  run={run}
                />
              ))}
            </div>
            <section
              aria-describedby="sync-history-scroll-hint"
              aria-label="Sync run history table"
              className="hidden overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:block"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll the wide history table
              tabIndex={0}
            >
              <p className="sr-only" id="sync-history-scroll-hint">
                Scroll horizontally to review every run detail column.
              </p>
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
                    <th className="p-4 font-medium">View</th>
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
                        {run.recordsUpserted} upserted,{" "}
                        <span
                          className={
                            run.recordsFailed > 0
                              ? "font-medium text-destructive"
                              : ""
                          }
                        >
                          {run.recordsFailed} failed
                        </span>
                      </td>
                      <td className="p-4">{run.triggeredByUserDisplay}</td>
                      <td className="p-4">
                        <Button asChild size="sm" variant="secondary">
                          <Link
                            href={withOrg(`/sync/${run.id}`, orgQueryValue)}
                          >
                            View
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
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
  onDispatch,
  orgQueryValue,
  pendingRunTypes,
  summary,
}: {
  onDispatch: (xeroTenantId: string, runType: SyncRunType) => void;
  orgQueryValue: string | null;
  pendingRunTypes: SyncRunType[];
  summary: TenantSummary;
}) {
  const [selectedRunType, setSelectedRunType] = useState<SyncRunType>("people");
  const hasCurrentFailure =
    summary.currentFailedRuns > 0 ||
    (summary.pendingFailedRecords > 0 &&
      summary.currentPartialSuccessRuns === 0);
  const hasPartialSuccessWarning =
    !hasCurrentFailure && summary.currentPartialSuccessRuns > 0;
  const pendingSelected = pendingRunTypes.includes(selectedRunType);
  const runningSelected = summary.currentRun?.runType === selectedRunType;
  const connectionInactive = summary.connectionStatus !== "active";
  const syncPaused = summary.syncPausedAt !== null;
  const disabledReason = tenantActionDisabledReason({
    connectionInactive,
    runningSelected,
    syncPaused,
  });
  const actionDescriptionId = `sync-action-description-${summary.xeroTenantId}`;
  const selectId = `sync-type-${summary.xeroTenantId}`;
  const titleId = `sync-tenant-${summary.xeroTenantId}`;

  return (
    <article
      aria-labelledby={titleId}
      className="space-y-4 rounded-2xl bg-muted p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold" id={titleId}>
            {summary.tenantName}
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary">{summary.payrollRegion}</Badge>
            <ConnectionDot status={summary.connectionStatus} />
          </div>
        </div>
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

      {hasCurrentFailure ? (
        <XeroSyncFailedState
          message={currentFailureMessage(summary)}
          retrySlot={
            <Button asChild size="sm" variant="secondary">
              <Link
                href={withOrg(
                  `/sync?${buildQuery({
                    status: ["failed", "partial_success"],
                    xeroTenantId: [summary.xeroTenantId],
                  })}`,
                  orgQueryValue
                )}
              >
                Review affected runs
              </Link>
            </Button>
          }
        />
      ) : null}

      {hasPartialSuccessWarning ? (
        <div
          className="flex flex-col gap-3 rounded-2xl bg-warning-container p-4 text-on-warning-container"
          role="alert"
        >
          <div className="flex items-center gap-2 font-medium text-sm">
            <AlertTriangleIcon aria-hidden="true" className="size-4" />
            Xero sync partially completed
          </div>
          <p className="text-sm">{partialSuccessMessage(summary)}</p>
          <div>
            <Button asChild size="sm" variant="secondary">
              <Link
                href={withOrg(
                  `/sync?${buildQuery({
                    status: ["failed", "partial_success"],
                    xeroTenantId: [summary.xeroTenantId],
                  })}`,
                  orgQueryValue
                )}
              >
                Review affected runs
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {summary.failedRunsLast30Days > 0 ? (
        <p className="text-muted-foreground text-sm">
          Historical context: {historicalFailureSummary(summary)}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-1 text-sm" htmlFor={selectId}>
            <span className="text-muted-foreground">Sync type</span>
            <select
              className="h-9 w-full rounded-xl bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              disabled={pendingSelected}
              id={selectId}
              onChange={(event) => {
                if (isSyncRunType(event.target.value)) {
                  setSelectedRunType(event.target.value);
                }
              }}
              value={selectedRunType}
            >
              {runTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {runTypeOptionLabel(option.value)}
                </option>
              ))}
            </select>
          </label>
          <Button
            aria-busy={pendingSelected || runningSelected}
            aria-describedby={actionDescriptionId}
            className="sm:min-w-28"
            disabled={pendingSelected || disabledReason !== null}
            onClick={() => onDispatch(summary.xeroTenantId, selectedRunType)}
            type="button"
          >
            {pendingSelected || runningSelected ? "Running" : "Run sync"}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm" id={actionDescriptionId}>
          {disabledReason ??
            `Runs ${runTypeLabel(selectedRunType).toLowerCase()} for ${summary.tenantName}.`}
        </p>
        {summary.currentRun && !runningSelected ? (
          <p className="text-muted-foreground text-sm" role="status">
            Currently running: {runTypeLabel(summary.currentRun.runType)}.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function RunHistoryCard({
  orgQueryValue,
  run,
}: {
  orgQueryValue: string | null;
  run: RunListItem;
}) {
  return (
    <article className="space-y-3 rounded-xl bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{run.tenantName}</h3>
          <p className="text-muted-foreground text-sm">
            {runTypeLabel(run.runType)}
          </p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Started</dt>
          <dd>{formatDateTime(run.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Failed records</dt>
          <dd className={run.recordsFailed > 0 ? "text-destructive" : ""}>
            {run.recordsFailed}
          </dd>
        </div>
      </dl>
      <Button asChild className="w-full" size="sm" variant="secondary">
        <Link href={withOrg(`/sync/${run.id}`, orgQueryValue)}>
          View run details
        </Link>
      </Button>
    </article>
  );
}

function currentFailureMessage(summary: TenantSummary): string {
  const runSummary = `${currentFailedRunSummary(summary.currentFailedRuns)}${currentPartialRunSummary(summary.currentPartialSuccessRuns)}`;
  if (summary.pendingFailedRecords === 1) {
    return `${runSummary}1 failed record needs review before downstream data can be trusted.`;
  }
  if (summary.pendingFailedRecords > 1) {
    return `${runSummary}${summary.pendingFailedRecords} failed records need review before downstream data can be trusted.`;
  }
  return `${runSummary}Review the failed runs before relying on downstream data.`;
}

function currentFailedRunSummary(currentFailedRuns: number): string {
  if (currentFailedRuns === 0) {
    return "";
  }
  if (currentFailedRuns === 1) {
    return "1 sync type is still failing. ";
  }
  return `${currentFailedRuns} sync types are still failing. `;
}

function currentPartialRunSummary(currentPartialSuccessRuns: number): string {
  if (currentPartialSuccessRuns === 0) {
    return "";
  }
  if (currentPartialSuccessRuns === 1) {
    return "1 other sync type completed with issues. ";
  }
  return `${currentPartialSuccessRuns} other sync types completed with issues. `;
}

function partialSuccessMessage(summary: TenantSummary): string {
  const runSummary =
    summary.currentPartialSuccessRuns === 1
      ? "1 sync type completed with issues."
      : `${summary.currentPartialSuccessRuns} sync types completed with issues.`;
  if (summary.pendingFailedRecords === 1) {
    return `${runSummary} 1 failed record needs review before downstream data can be trusted.`;
  }
  if (summary.pendingFailedRecords > 1) {
    return `${runSummary} ${summary.pendingFailedRecords} failed records need review before downstream data can be trusted.`;
  }
  return `${runSummary} Review the affected runs before relying on downstream data.`;
}

function historicalFailureSummary(summary: TenantSummary): string {
  const failedRunLabel =
    summary.failedRunsLast30Days === 1 ? "run failed" : "runs failed";
  const totalRunLabel = summary.totalRunsLast30Days === 1 ? "run" : "runs";
  return `${summary.failedRunsLast30Days} ${failedRunLabel} out of ${summary.totalRunsLast30Days} ${totalRunLabel} in the past 30 days.`;
}

function FilterBar({
  filters,
  orgQueryValue,
  summaries,
}: {
  filters: SyncRunFiltersInput;
  orgQueryValue: string | null;
  summaries: TenantSummary[];
}) {
  const router = useRouter();
  const [tenant, setTenant] = useState(filters.xeroTenantId?.[0] ?? "all");
  const [runType, setRunType] = useState(filters.runType?.[0] ?? "all");
  const [status, setStatus] = useState(filters.status?.[0] ?? "all");
  const [triggerType, setTriggerType] = useState(
    filters.triggerType?.[0] ?? "all"
  );
  const activeFilterCount = countActiveFilters(filters);

  const apply = () => {
    router.push(
      withOrg(
        `/sync?${buildQuery({
          runType: runType === "all" ? undefined : [runType],
          status: status === "all" ? undefined : [status],
          triggerType: triggerType === "all" ? undefined : [triggerType],
          xeroTenantId: tenant === "all" ? undefined : [tenant],
        })}`,
        orgQueryValue
      )
    );
  };

  const clear = () => {
    setTenant("all");
    setRunType("all");
    setStatus("all");
    setTriggerType("all");
    router.push(withOrg("/sync", orgQueryValue));
  };

  return (
    <div className="space-y-3 rounded-2xl bg-muted p-3">
      <div className="flex flex-wrap items-end gap-2">
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
            ...syncRunStatuses.map((value) => ({
              label: statusLabel(value),
              value,
            })),
          ]}
          value={status}
        />
        <SelectFilter
          label="Trigger"
          onChange={setTriggerType}
          options={[
            { label: "All triggers", value: "all" },
            ...syncTriggerTypes.map((value) => ({
              label: triggerTypeLabel(value),
              value,
            })),
          ]}
          value={triggerType}
        />
        <Button onClick={apply} type="button">
          Apply filters
        </Button>
        {activeFilterCount > 0 ? (
          <Button onClick={clear} type="button" variant="secondary">
            Clear filters
          </Button>
        ) : null}
      </div>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {activeFilterCount === 0
          ? "Showing all sync runs."
          : `${activeFilterCount} ${activeFilterCount === 1 ? "filter" : "filters"} active.`}
      </p>
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
  const fieldId = `sync-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label className="grid gap-1 text-sm" htmlFor={fieldId}>
      <span className="text-muted-foreground">{label}</span>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger
          className="min-w-40 rounded-xl bg-background"
          id={fieldId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
    active: statusToneClasses.leave,
    expired: statusToneClasses.holiday,
    not_configured: statusToneClasses.private,
    revoked: statusToneClasses.failed,
  }[status];
  return (
    <span
      className="inline-flex items-center gap-2 text-muted-foreground text-sm"
      title={
        status === "revoked"
          ? "Reconnect from the Xero integrations settings"
          : undefined
      }
    >
      <span className={`size-2 rounded-full ring-2 ${colour}`} />
      {statusLabel(status)}
    </span>
  );
}

function StatusBadge({ status }: { status: SyncRunStatus }) {
  const className = {
    cancelled: statusToneClasses.private,
    failed: statusToneClasses.failed,
    partial_success: statusToneClasses.holiday,
    running: `${statusToneClasses.manual} motion-safe:animate-pulse`,
    succeeded: statusToneClasses.leave,
  }[status];
  return (
    <Badge className={`border-0 ring-1 ${className}`}>
      {statusLabel(status)}
    </Badge>
  );
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

function countActiveFilters(filters: SyncRunFiltersInput): number {
  return [
    filters.dateFrom,
    filters.dateTo,
    filters.runType?.length ? filters.runType : undefined,
    filters.status?.length ? filters.status : undefined,
    filters.triggerType?.length ? filters.triggerType : undefined,
    filters.xeroTenantId?.length ? filters.xeroTenantId : undefined,
  ].filter(Boolean).length;
}

function hasActiveFilters(filters: SyncRunFiltersInput): boolean {
  return countActiveFilters(filters) > 0;
}

function pendingDispatchKey(dispatch: PendingDispatch): string {
  return `${dispatch.xeroTenantId}:${dispatch.runType}`;
}

function runTypeOptionLabel(runType: SyncRunType): string {
  if (runType === "people") {
    return "People (recommended)";
  }
  return runTypeLabel(runType);
}

function isSyncRunType(value: string): value is SyncRunType {
  return runTypeOptions.some((option) => option.value === value);
}

function tenantActionDisabledReason(input: {
  connectionInactive: boolean;
  runningSelected: boolean;
  syncPaused: boolean;
}): string | null {
  if (input.connectionInactive) {
    return "Reconnect Xero in Settings before running a sync.";
  }
  if (input.syncPaused) {
    return "Resume Xero syncing in Settings before running a sync.";
  }
  if (input.runningSelected) {
    return "This sync type is already running for this tenant.";
  }
  return null;
}

function reasonLabel(reason?: string): string {
  if (reason === "connection_not_active") {
    return "Reconnect Xero before running this sync.";
  }
  if (reason === "dispatch_not_wired") {
    return "This sync job is not registered yet.";
  }
  if (reason === "tenant_sync_paused") {
    return "Resume Xero syncing before running this sync.";
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
