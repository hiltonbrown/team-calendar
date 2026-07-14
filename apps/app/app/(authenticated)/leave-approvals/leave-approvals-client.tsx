"use client";

import {
  Avatar,
  AvatarFallback,
} from "@repo/design-system/components/ui/avatar";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { toast } from "@repo/design-system/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { AlertTriangleIcon, ChevronDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { z } from "zod";
import {
  dispatchApprovalReconciliationAction,
  retryApprovalAction,
  retryDeclineAction,
  revertApprovalAttemptAction,
} from "@/app/(authenticated)/leave-approvals/_actions";
import type { ApprovalModalRecord } from "@/components/approvals/approve-confirmation-modal";
import { ApproveConfirmationModal } from "@/components/approvals/approve-confirmation-modal";
import { DeclineModal } from "@/components/approvals/decline-modal";
import { RequestInfoModal } from "@/components/approvals/request-info-modal";
import { EmptyState } from "@/components/states/empty-state";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";
import { useFilterParams } from "@/lib/url-state/use-filter-params";

type ApprovalAction =
  | "approve"
  | "decline"
  | "request_more_info"
  | "retry_approval"
  | "retry_decline"
  | "revert_to_submitted"
  | "view_only";

interface ApprovalItem {
  approvalNote: string | null;
  approvalStatus: string;
  approvedAt: string | Date | null;
  availableActions: ApprovalAction[];
  balanceSnapshot: {
    balanceAvailable: number | null;
    balanceRemainingAfterApproval: number | null;
    leaveBalanceUpdatedAt: string | Date | null;
    unit: string | null;
  } | null;
  durationWorkingDays: number | null;
  endsAt: string | Date;
  failedAction: string | null;
  id: string;
  mutedActionNote: string | null;
  notesInternal?: string | null;
  organisationId: string;
  person: {
    email: string;
    firstName: string;
    id: string;
    lastName: string;
    teamName: string | null;
  };
  recordType: string;
  startsAt: string | Date;
  submittedAt: string | Date | null;
  xeroWriteError: string | null;
}

interface ApprovalSummaryCounts {
  approvedThisMonth: number;
  declinedThisMonth: number;
  failedSync: number;
  pending: number;
}

interface LeaveApprovalsClientProps {
  canDispatchReconciliation: boolean;
  filters: {
    includeFailed: boolean;
    status?: string[];
  };
  items: ApprovalItem[];
  organisationId: string;
  reconciliationEnabled: boolean;
  summary: ApprovalSummaryCounts;
}

const FilterSchema = z.object({
  includeFailed: z.string().optional(),
  status: z.string().optional(),
});

export function LeaveApprovalsClient({
  canDispatchReconciliation,
  filters,
  items,
  organisationId,
  reconciliationEnabled,
  summary,
}: LeaveApprovalsClientProps) {
  const router = useRouter();
  const [, setFilterParams] = useFilterParams(FilterSchema);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    mode: "approve" | "decline" | "info";
    record: ApprovalItem;
  } | null>(null);
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const closeModal = () => setModal(null);
  const refreshAfterSuccess = () => {
    setModal(null);
    router.refresh();
  };

  const runInlineAction = (
    record: ApprovalItem,
    action: "retry_approval" | "retry_decline" | "revert_to_submitted"
  ) => {
    setPendingRecordId(record.id);
    startTransition(async () => {
      let fn = revertApprovalAttemptAction;
      if (action === "retry_approval") {
        fn = retryApprovalAction;
      }
      if (action === "retry_decline") {
        fn = retryDeclineAction;
      }
      const result = await fn({
        organisationId: record.organisationId,
        recordId: record.id,
      });
      setPendingRecordId(null);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  const syncApprovalState = () => {
    startTransition(async () => {
      const result = await dispatchApprovalReconciliationAction({
        organisationId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (!result.value.queued) {
        toast.message("Reconciliation is not yet enabled");
        return;
      }
      toast.success("Approval reconciliation queued");
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 transition-all duration-500 ease-in-out">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-semibold text-foreground text-title-lg tracking-tight">
            Leave approvals
          </h2>
          <p className="text-label-md text-muted-foreground">
            Approval and decline actions are written to Xero Payroll
            immediately.
          </p>
        </div>
        {canDispatchReconciliation && (
          <Button
            disabled={isPending || !reconciliationEnabled}
            onClick={syncApprovalState}
            title={
              reconciliationEnabled
                ? "Sync approval state"
                : "Reconciliation is not yet enabled"
            }
            type="button"
            variant="secondary"
          >
            Sync approval state
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCell label="Pending" value={summary.pending} />
        <SummaryCell label="Failed sync" value={summary.failedSync} />
        <SummaryCell
          label="Approved this month"
          value={summary.approvedThisMonth}
        />
        <SummaryCell
          label="Declined this month"
          value={summary.declinedThisMonth}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 md:flex-row md:items-center">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select
            className="h-10 rounded-xl bg-background px-3"
            onChange={(event) =>
              setFilterParams({
                status: event.currentTarget.value || undefined,
              })
            }
            value={
              filters.status && filters.status.length === 1
                ? filters.status[0]
                : ""
            }
          >
            <option value="">All statuses</option>
            <option value="submitted">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="xero_sync_failed">Xero sync failed</option>
          </select>
        </label>
        <label className="mt-5 flex items-center gap-2 text-sm">
          <input
            checked={filters.includeFailed}
            onChange={(event) =>
              setFilterParams({
                includeFailed: event.currentTarget.checked ? "true" : "",
              })
            }
            type="checkbox"
          />
          Include failed
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState
          description="No leave requests match the current filters."
          title="No approvals to review"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-background">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Person</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((record) => {
                const isExpanded = expandedId === record.id;
                return (
                  <Fragment key={record.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : record.id)
                      }
                    >
                      <TableCell>
                        <PersonCell record={record} />
                      </TableCell>
                      <TableCell>{labelForType(record.recordType)}</TableCell>
                      <TableCell>
                        {formatDateRange(record.startsAt, record.endsAt)}
                        <div className="text-muted-foreground text-xs">
                          {record.durationWorkingDays === null
                            ? "Duration unavailable"
                            : `${record.durationWorkingDays} working days`}
                        </div>
                      </TableCell>
                      <TableCell>{balanceLabel(record)}</TableCell>
                      <TableCell>
                        {submittedLabel(record.submittedAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={record.approvalStatus} />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <ActionButtons
                            disabled={
                              isPending && pendingRecordId === record.id
                            }
                            onInlineAction={runInlineAction}
                            onOpen={setModal}
                            record={record}
                          />
                          <Button size="sm" type="button" variant="ghost">
                            <ChevronDownIcon className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${record.id}-detail`}>
                        <TableCell colSpan={7}>
                          <DetailPanel
                            onInlineAction={runInlineAction}
                            record={record}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {modal && modal.mode === "approve" && (
        <ApproveConfirmationModal
          onClose={closeModal}
          onSuccess={refreshAfterSuccess}
          record={modalRecord(modal.record)}
        />
      )}
      {modal && modal.mode === "decline" && (
        <DeclineModal
          onClose={closeModal}
          onSuccess={refreshAfterSuccess}
          record={modalRecord(modal.record)}
        />
      )}
      {modal && modal.mode === "info" && (
        <RequestInfoModal
          onClose={closeModal}
          onSuccess={refreshAfterSuccess}
          record={modalRecord(modal.record)}
        />
      )}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="font-semibold text-2xl">{value}</div>
      <div className="text-muted-foreground text-sm">{label}</div>
    </div>
  );
}

function PersonCell({ record }: { record: ApprovalItem }) {
  const name = personName(record);
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div>
        <div className="font-medium">{name}</div>
        <div className="text-muted-foreground text-xs">
          {record.person.teamName ?? record.person.email}
        </div>
      </div>
    </div>
  );
}

function ActionButtons({
  disabled,
  onInlineAction,
  onOpen,
  record,
}: {
  disabled: boolean;
  onInlineAction: (
    record: ApprovalItem,
    action: "retry_approval" | "retry_decline" | "revert_to_submitted"
  ) => void;
  onOpen: (value: {
    mode: "approve" | "decline" | "info";
    record: ApprovalItem;
  }) => void;
  record: ApprovalItem;
}) {
  if (record.mutedActionNote) {
    return (
      <span className="max-w-48 text-muted-foreground text-xs">
        {record.mutedActionNote}
      </span>
    );
  }
  return (
    <>
      {record.availableActions.includes("approve") && (
        <Button
          onClick={() => onOpen({ mode: "approve", record })}
          size="sm"
          type="button"
        >
          Approve
        </Button>
      )}
      {record.availableActions.includes("decline") && (
        <Button
          onClick={() => onOpen({ mode: "decline", record })}
          size="sm"
          type="button"
          variant="destructive"
        >
          Decline
        </Button>
      )}
      {record.availableActions.includes("request_more_info") && (
        <Button
          onClick={() => onOpen({ mode: "info", record })}
          size="sm"
          type="button"
          variant="ghost"
        >
          Request more info
        </Button>
      )}
      {record.availableActions.includes("retry_approval") && (
        <Button
          disabled={disabled}
          onClick={() => onInlineAction(record, "retry_approval")}
          size="sm"
          type="button"
        >
          Try again
        </Button>
      )}
      {record.availableActions.includes("retry_decline") && (
        <Button
          disabled={disabled}
          onClick={() => onInlineAction(record, "retry_decline")}
          size="sm"
          type="button"
        >
          Try again
        </Button>
      )}
      {record.availableActions.includes("revert_to_submitted") && (
        <Button
          disabled={disabled}
          onClick={() => onInlineAction(record, "revert_to_submitted")}
          size="sm"
          type="button"
          variant="secondary"
        >
          Revert to pending
        </Button>
      )}
    </>
  );
}

function DetailPanel({
  onInlineAction,
  record,
}: {
  onInlineAction: (
    record: ApprovalItem,
    action: "retry_approval" | "retry_decline" | "revert_to_submitted"
  ) => void;
  record: ApprovalItem;
}) {
  const retrySlot = retrySlotForRecord(record, onInlineAction);
  return (
    <div className="grid gap-4 rounded-2xl bg-muted p-4">
      {record.xeroWriteError && (
        <XeroSyncFailedState
          message={record.xeroWriteError}
          retrySlot={retrySlot}
          revertSlot={
            record.availableActions.includes("revert_to_submitted") ? (
              <Button
                onClick={() => onInlineAction(record, "revert_to_submitted")}
                size="sm"
                type="button"
                variant="secondary"
              >
                Revert to pending
              </Button>
            ) : undefined
          }
        />
      )}
      <div className="grid gap-2 text-sm md:grid-cols-3">
        <DetailItem label="Employee notes">
          {record.notesInternal?.trim() || "No notes provided."}
        </DetailItem>
        <DetailItem label="Submission">
          {submittedLabel(record.submittedAt)}
        </DetailItem>
        <DetailItem label="Balance">{balanceLabel(record)}</DetailItem>
      </div>
    </div>
  );
}

function retrySlotForRecord(
  record: ApprovalItem,
  onInlineAction: (
    record: ApprovalItem,
    action: "retry_approval" | "retry_decline" | "revert_to_submitted"
  ) => void
) {
  if (record.availableActions.includes("retry_approval")) {
    return (
      <Button
        onClick={() => onInlineAction(record, "retry_approval")}
        size="sm"
        type="button"
      >
        Try again
      </Button>
    );
  }
  if (record.availableActions.includes("retry_decline")) {
    return (
      <Button
        onClick={() => onInlineAction(record, "retry_decline")}
        size="sm"
        type="button"
      >
        Try again
      </Button>
    );
  }
  return;
}

function DetailItem({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <div className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const isFailed = status === "xero_sync_failed";
  return (
    <Badge className="gap-1" variant={isFailed ? "destructive" : "secondary"}>
      {isFailed && <AlertTriangleIcon className="size-3" />}
      {label}
    </Badge>
  );
}

function modalRecord(record: ApprovalItem): ApprovalModalRecord {
  return {
    balanceRemainingAfterApproval:
      record.balanceSnapshot?.balanceRemainingAfterApproval ?? null,
    durationWorkingDays: record.durationWorkingDays,
    employeeName: personName(record),
    endsAt: record.endsAt,
    id: record.id,
    organisationId: record.organisationId,
    recordType: record.recordType,
    startsAt: record.startsAt,
  };
}

function balanceLabel(record: ApprovalItem) {
  const remaining = record.balanceSnapshot?.balanceRemainingAfterApproval;
  if (remaining === null || remaining === undefined) {
    return "Balance unavailable";
  }
  return `${remaining} days remaining after approval`;
}

function submittedLabel(value: string | Date | null) {
  if (!value) {
    return "Not submitted";
  }
  return formatDate(value);
}

function formatDateRange(startsAt: string | Date, endsAt: string | Date) {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);
  return start === end ? start : `${start} to ${end}`;
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function labelForType(recordType: string) {
  return recordType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Approved",
    declined: "Declined",
    submitted: "Pending approval",
    withdrawn: "Withdrawn",
    xero_sync_failed: "Xero sync failed",
  };
  return labels[status] ?? status;
}

function personName(record: ApprovalItem) {
  return `${record.person.firstName} ${record.person.lastName}`.trim();
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
