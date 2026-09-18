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
import { useNotificationEvents } from "@repo/notifications/components/provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { statusToneClasses } from "@/components/availability/availability-status";
import { EmptyState } from "@/components/states/empty-state";
import { withOrg } from "@/lib/navigation/org-url";
import {
  cancelRunAction,
  dispatchManualSyncAction,
  exportFailedRecordsCsvAction,
} from "../_actions";

const FIRST_LINE_PATTERN = /\r?\n/;
type PendingAction = "cancel" | "export" | "rerun" | null;

interface SyncRunDetailClientProperties {
  detail: RunDetail;
  organisationId: string;
  orgQueryValue: string | null;
  tenantSummary: TenantSummary | null;
}

export function SyncRunDetailClient({
  detail,
  orgQueryValue,
  organisationId,
  tenantSummary,
}: SyncRunDetailClientProperties) {
  const router = useRouter();
  const { subscribe } = useNotificationEvents();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rawVisible, setRawVisible] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [, startTransition] = useTransition();
  const pendingActionRef = useRef<PendingAction>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const { run } = detail;
  const runningSameType = tenantSummary?.currentRun?.runType === run.runType;
  const connectionInactive = tenantSummary?.connectionStatus !== "active";
  const rerunDisabledReason = actionDisabledReason(
    connectionInactive,
    runningSameType
  );

  const beginAction = (action: Exclude<PendingAction, null>): boolean => {
    if (pendingActionRef.current !== null) {
      return false;
    }
    pendingActionRef.current = action;
    setPendingAction(action);
    return true;
  };

  const finishAction = () => {
    pendingActionRef.current = null;
    setPendingAction(null);
  };

  useEffect(
    () =>
      subscribe((event) => {
        if (
          event.type === "sync.run_status_changed" &&
          event.payload.organisationId === organisationId &&
          event.payload.runId === run.id
        ) {
          router.refresh();
        }
      }),
    [organisationId, router, run.id, subscribe]
  );

  const rerun = () => {
    if (!run.xeroTenantId) {
      setMessage({
        text: "This run is not linked to a Xero tenant.",
        tone: "error",
      });
      return;
    }
    if (!confirmRerun) {
      setConfirmRerun(true);
      setMessage({
        text: "Re-running starts a fresh sync. Previous failed records stay in the audit trail. Select Continue re-run to proceed.",
        tone: "status",
      });
      return;
    }
    if (!beginAction("rerun")) {
      return;
    }
    startTransition(async () => {
      try {
        setConfirmRerun(false);
        const result = await dispatchManualSyncAction({
          organisationId,
          runType: run.runType,
          xeroTenantId: run.xeroTenantId ?? "",
        });
        if (!result.ok) {
          setMessage({ text: result.error.message, tone: "error" });
          return;
        }
        setMessage({
          text: result.value.queued
            ? "Sync queued."
            : reasonLabel(result.value.reason),
          tone: result.value.queued ? "status" : "error",
        });
        router.refresh();
      } catch {
        setMessage({
          text: "The sync could not be queued. Try again.",
          tone: "error",
        });
      } finally {
        finishAction();
      }
    });
  };

  const cancel = () => {
    if (!beginAction("cancel")) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await cancelRunAction({ organisationId, runId: run.id });
        if (!result.ok) {
          setMessage({ text: result.error.message, tone: "error" });
          return;
        }
        setMessage({ text: "Cancellation requested.", tone: "status" });
        router.refresh();
      } catch {
        setMessage({
          text: "Cancellation could not be requested. Try again.",
          tone: "error",
        });
      } finally {
        finishAction();
      }
    });
  };

  const exportCsv = () => {
    if (!beginAction("export")) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await exportFailedRecordsCsvAction({
          organisationId,
          runId: run.id,
        });
        if (!result.ok) {
          setMessage({ text: result.error.message, tone: "error" });
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
        setMessage({ text: "CSV export ready.", tone: "status" });
      } catch {
        setMessage({ text: "CSV export failed. Try again.", tone: "error" });
      } finally {
        finishAction();
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
      <section className="space-y-6">
        <div className="space-y-2">
          <Link
            className="text-muted-foreground text-sm"
            href={withOrg("/sync", orgQueryValue)}
          >
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

        {run.errorSummary ? (
          <div
            className={`rounded-2xl p-4 text-sm ${statusToneClasses.failed}`}
          >
            <p>{run.errorSummary}</p>
            {detail.failedRecords.some((record) => record.rawPayload) && (
              <p className="mt-2 text-muted-foreground">
                Expand failed records below for details.
              </p>
            )}
          </div>
        ) : null}

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
                aria-busy={pendingAction === "export"}
                disabled={pendingAction !== null}
                onClick={exportCsv}
                type="button"
                variant="secondary"
              >
                {pendingAction === "export"
                  ? "Preparing CSV…"
                  : "Export as CSV"}
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
                        {record.rawPayload ? (
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
                        ) : null}
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
        {message ? (
          <p
            aria-live={message.tone === "error" ? "assertive" : "polite"}
            className="text-muted-foreground text-sm"
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
        <Button
          aria-busy={pendingAction === "rerun"}
          aria-describedby="rerun-sync-description"
          className="w-full"
          disabled={pendingAction !== null || rerunDisabledReason !== null}
          onClick={rerun}
          type="button"
        >
          {rerunActionLabel(pendingAction, confirmRerun)}
        </Button>
        <p
          className="text-muted-foreground text-sm"
          id="rerun-sync-description"
        >
          {rerunDisabledReason ??
            "Starts a fresh sync and keeps this run in the audit trail."}
        </p>
        {run.status === "running" && (
          <div className="space-y-2">
            <Button
              aria-busy={pendingAction === "cancel"}
              aria-describedby="cancel-sync-description"
              className="w-full"
              disabled={pendingAction !== null}
              onClick={cancel}
              type="button"
              variant="secondary"
            >
              {pendingAction === "cancel"
                ? "Requesting cancellation…"
                : "Cancel running sync"}
            </Button>
            <p
              className="text-muted-foreground text-sm"
              id="cancel-sync-description"
            >
              Stops future work after the current operation reaches a safe
              point.
            </p>
          </div>
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
        {timelineOpen ? (
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
        ) : null}
      </aside>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  const isFailed = label === "Records failed" && value > 0;
  return (
    <div
      className={`rounded-2xl p-4 ${isFailed ? "bg-error-container" : "bg-muted"}`}
    >
      <p
        className={`font-semibold text-3xl ${isFailed ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      <p
        className={`mt-1 text-sm ${isFailed ? "text-destructive" : "text-muted-foreground"}`}
      >
        {label}
      </p>
    </div>
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
      {status.replaceAll("_", " ")}
    </Badge>
  );
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

function actionDisabledReason(
  connectionInactive: boolean,
  runningSameType: boolean
): string | null {
  if (connectionInactive) {
    return "Reconnect Xero in Settings before re-running this sync.";
  }
  if (runningSameType) {
    return "Another run of this type is already running.";
  }
  return null;
}

function rerunActionLabel(
  pendingAction: PendingAction,
  confirmRerun: boolean
): string {
  if (pendingAction === "rerun") {
    return "Queuing re-run…";
  }
  if (confirmRerun) {
    return "Continue re-run";
  }
  return "Re-run this sync";
}

function reasonLabel(reason?: string): string {
  if (reason === "connection_not_active") {
    return "Reconnect Xero before running this sync.";
  }
  if (reason === "tenant_sync_paused") {
    return "Resume Xero syncing before running this sync.";
  }
  if (reason === "dispatch_not_wired") {
    return "This sync job is not registered yet.";
  }
  return "Sync was not queued.";
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
