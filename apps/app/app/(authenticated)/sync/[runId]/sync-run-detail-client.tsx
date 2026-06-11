"use client";

import type {
  RunDetail,
  SyncRunStatus,
  SyncRunType,
  SyncTriggerType,
  TenantSummary,
} from "@repo/availability";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmptyState } from "@/components/states/empty-state";
import {
  cancelRunAction,
  dispatchManualSyncAction,
  exportFailedRecordsCsvAction,
} from "../_actions";

const FIRST_LINE_PATTERN = /\r?\n/;

interface SyncRunDetailClientProperties {
  detail: RunDetail;
  organisationId: string;
  tenantSummary: TenantSummary | null;
}

export function SyncRunDetailClient({
  detail,
  organisationId,
  tenantSummary,
}: SyncRunDetailClientProperties) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rawVisible, setRawVisible] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const run = detail.run;
  const runningSameType =
    tenantSummary?.currentRun?.runType === run.runType &&
    tenantSummary.currentRun.id !== run.id;
  const connectionInactive = tenantSummary?.connectionStatus !== "active";

  const rerun = () => {
    if (!run.xeroTenantId) {
      setMessage("This run is not linked to a Xero tenant.");
      return;
    }
    if (!confirmRerun) {
      setConfirmRerun(true);
      setMessage(
        "Re-running starts a fresh sync. Previous failed records stay in the audit trail. Select Continue re-run to proceed."
      );
      return;
    }
    startTransition(async () => {
      setConfirmRerun(false);
      const result = await dispatchManualSyncAction({
        organisationId,
        runType: run.runType,
        xeroTenantId: run.xeroTenantId ?? "",
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setMessage(result.value.queued ? "Sync queued." : "Sync was not queued.");
      router.refresh();
    });
  };

  const cancel = () => {
    startTransition(async () => {
      const result = await cancelRunAction({ organisationId, runId: run.id });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setMessage("Cancellation requested.");
      router.refresh();
    });
  };

  const exportCsv = () => {
    startTransition(async () => {
      const result = await exportFailedRecordsCsvAction({
        organisationId,
        runId: run.id,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      const blob = new Blob([result.value.csvContent], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.value.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
      <section className="space-y-6">
        <div className="space-y-2">
          <Link className="text-muted-foreground text-sm" href="/sync">
            Sync health / Run {run.id.slice(0, 8)}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-semibold text-2xl">
              {run.tenantName} {runTypeLabel(run.runType)}
            </h1>
            <StatusBadge status={run.status} />
            <Badge variant="secondary">
              {triggerTypeLabel(run.triggerType)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Started {formatDateTime(run.startedAt)}
            {run.completedAt
              ? `, completed ${formatDateTime(run.completedAt)}`
              : ", still running"}
            , duration {formatDuration(run.durationSeconds)}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCell label="Records fetched" value={run.recordsFetched} />
          <StatCell label="Records upserted" value={run.recordsUpserted} />
          <StatCell label="Records skipped" value={run.recordsSkipped} />
          <StatCell label="Records failed" value={run.recordsFailed} />
        </div>

        {run.errorSummary && (
          <div className="rounded-2xl bg-amber-50 p-4 text-amber-950 text-sm dark:bg-amber-950/30 dark:text-amber-100">
            <p>{run.errorSummary}</p>
            {detail.failedRecords.some((record) => record.rawPayload) && (
              <p className="mt-2 text-muted-foreground">
                Expand failed records below for details.
              </p>
            )}
          </div>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg">Failed records</h2>
              <p className="text-muted-foreground text-sm">
                Raw payloads stay collapsed unless opened by an admin or owner.
              </p>
            </div>
            {detail.failedRecords.length > 0 && (
              <Button
                disabled={isPending}
                onClick={exportCsv}
                type="button"
                variant="secondary"
              >
                Export as CSV
              </Button>
            )}
          </div>

          {detail.failedRecords.length === 0 ? (
            <EmptyState description="This run completed without any failures." />
          ) : (
            <div className="space-y-2">
              {detail.failedRecords.map((record) => {
                const isOpen = expanded === record.id;
                return (
                  <article className="rounded-2xl bg-muted p-4" key={record.id}>
                    <button
                      className="grid w-full gap-3 text-left md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                      onClick={() => setExpanded(isOpen ? null : record.id)}
                      type="button"
                    >
                      <span
                        className="truncate font-mono text-sm"
                        title={record.sourceRemoteId ?? ""}
                      >
                        {record.sourceRemoteId ?? "No remote ID"}
                      </span>
                      <Badge variant="secondary">{record.recordType}</Badge>
                      <Badge variant="outline">{record.errorCode}</Badge>
                      <span className="text-muted-foreground text-sm">
                        {formatDateTime(record.createdAt)}
                      </span>
                    </button>
                    <p className="mt-3 text-sm">
                      {firstLine(record.errorMessage)}
                    </p>
                    {isOpen && (
                      <div className="mt-4 space-y-3">
                        <p className="whitespace-pre-wrap text-sm">
                          {record.errorMessage}
                        </p>
                        {record.rawPayload && (
                          <>
                            <Button
                              onClick={() =>
                                setRawVisible(
                                  rawVisible === record.id ? null : record.id
                                )
                              }
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              {rawVisible === record.id
                                ? "Hide raw payload"
                                : "Show raw payload"}
                            </Button>
                            {rawVisible === record.id && (
                              <pre className="overflow-auto rounded-xl bg-background p-3 text-xs">
                                {JSON.stringify(record.rawPayload, null, 2)}
                              </pre>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <aside className="space-y-3 rounded-2xl bg-muted p-4 xl:sticky xl:top-20 xl:self-start">
        <h2 className="font-semibold">Actions</h2>
        {message && <p className="text-muted-foreground text-sm">{message}</p>}
        <Button
          className="w-full"
          disabled={
            isPending ||
            connectionInactive ||
            runningSameType ||
            run.runType !== "approval_state_reconciliation"
          }
          onClick={rerun}
          title={actionDisabledTitle(
            connectionInactive,
            runningSameType,
            run.runType
          )}
          type="button"
        >
          {confirmRerun ? "Continue re-run" : "Re-run this sync"}
        </Button>
        {run.status === "running" && (
          <Button
            className="w-full"
            disabled={isPending}
            onClick={cancel}
            type="button"
            variant="secondary"
          >
            Cancel running sync
          </Button>
        )}
        {detail.timeline.length > 0 && (
          <Button
            className="w-full"
            onClick={() => setTimelineOpen((value) => !value)}
            type="button"
            variant="secondary"
          >
            View timeline
          </Button>
        )}
        {timelineOpen && (
          <ol className="space-y-2 text-sm">
            {detail.timeline.map((event) => (
              <li key={event.id}>
                <p className="font-medium">{event.action}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <p className="font-semibold text-3xl">{value}</p>
      <p className="mt-1 text-muted-foreground text-sm">{label}</p>
    </div>
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
  return <Badge className={className}>{status.replaceAll("_", " ")}</Badge>;
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

function actionDisabledTitle(
  connectionInactive: boolean,
  runningSameType: boolean,
  runType: SyncRunType
): string | undefined {
  if (connectionInactive) {
    return "Reconnect Xero before re-running this sync.";
  }
  if (runningSameType) {
    return "Another run of this type is already running.";
  }
  if (runType !== "approval_state_reconciliation") {
    return "This sync job is not registered yet.";
  }
  return;
}

function firstLine(value: string): string {
  return value.split(FIRST_LINE_PATTERN)[0] ?? value;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
