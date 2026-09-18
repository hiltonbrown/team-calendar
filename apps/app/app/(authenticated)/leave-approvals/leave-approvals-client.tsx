"use client";

import { getAvailabilityRecordLabel } from "@repo/core";

import {
  Avatar,
  AvatarFallback,
} from "@repo/design-system/components/ui/avatar";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleXIcon,
  Clock3Icon,
  MoreHorizontalIcon,
  Undo2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useState,
  useTransition,
} from "react";
import { z } from "zod";
import {
  dispatchXeroLeaveSyncAction,
  retryApprovalAction,
  retryDeclineAction,
  revertApprovalAttemptAction,
} from "@/app/(authenticated)/leave-approvals/_actions";
import type { ApprovalModalRecord } from "@/components/approvals/approve-confirmation-modal";
import { ApproveConfirmationModal } from "@/components/approvals/approve-confirmation-modal";
import { DeclineModal } from "@/components/approvals/decline-modal";
import { RequestInfoModal } from "@/components/approvals/request-info-modal";
import { EmptyState } from "@/components/states/empty-state";
import type { XeroFailedAction } from "@/components/states/xero-sync-failed-state";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";
import { formatLeaveBalance } from "@/lib/format-leave-balance";
import { useFilterParams } from "@/lib/url-state/use-filter-params";

// Radix Select rejects empty-string item values, so the "no filter" option
// carries this sentinel and maps back to undefined at the state boundary.
const ALL_STATUSES = "all";

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
    currencyCode?: string | null;
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
  nextCursor: string | null;
  organisationId: string;
  summary: ApprovalSummaryCounts;
}

const FilterSchema = z.object({
  cursor: z.string().optional(),
  includeFailed: z.string().optional(),
  status: z.string().optional(),
});

export function LeaveApprovalsClient({
  canDispatchReconciliation,
  filters,
  items,
  nextCursor,
  organisationId,
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

  // Keyboard shortcuts on a focused row: A approves, D declines, Enter expands.
  // Scoped to the row (not a global listener) so it never fights the filter
  // controls or the command palette.
  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    record: ApprovalItem,
    isExpanded: boolean
  ) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    const key = event.key.toLowerCase();
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpandedId(isExpanded ? null : record.id);
      return;
    }
    if (key === "a" && record.availableActions.includes("approve")) {
      event.preventDefault();
      setModal({ mode: "approve", record });
      return;
    }
    if (key === "d" && record.availableActions.includes("decline")) {
      event.preventDefault();
      setModal({ mode: "decline", record });
    }
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
      if (result.value.approvalStatus === "xero_sync_failed") {
        toast.error(
          result.value.xeroWriteError ??
            "Xero could not complete this action. Try again."
        );
        router.refresh();
        return;
      }
      toast.success(inlineActionSuccessMessage(action));
      router.refresh();
    });
  };

  const syncXeroLeave = () => {
    startTransition(async () => {
      const result = await dispatchXeroLeaveSyncAction({
        organisationId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (!result.value.queued) {
        toast.message("Xero leave sync is not yet enabled");
        return;
      }
      toast.success("Xero leave sync queued");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
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
        {canDispatchReconciliation ? (
          <Button
            disabled={isPending}
            onClick={syncXeroLeave}
            title="Sync Xero leave"
            type="button"
            variant="secondary"
          >
            Sync Xero leave
          </Button>
        ) : null}
      </div>

      <QueueSummary summary={summary} />

      <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 md:flex-row md:items-center">
        <label className="grid gap-1 text-sm" htmlFor="approvals-status-filter">
          <span className="font-medium">Status</span>
          <Select
            onValueChange={(value) =>
              setFilterParams({
                status: value === ALL_STATUSES ? undefined : value,
              })
            }
            value={
              filters.status && filters.status.length === 1
                ? filters.status[0]
                : ALL_STATUSES
            }
          >
            <SelectTrigger
              className="h-10 min-w-48 rounded-xl bg-background"
              id="approvals-status-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              <SelectItem value="submitted">Pending approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="xero_sync_failed">Xero sync failed</SelectItem>
            </SelectContent>
          </Select>
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
        <div className="rounded-2xl bg-background">
          <p className="flex flex-wrap items-center gap-1.5 px-4 pt-3 text-muted-foreground text-xs">
            <span>Tab to a row, then</span>
            <Kbd>A</Kbd>
            <span>approve</span>
            <Kbd>D</Kbd>
            <span>decline</span>
            <Kbd>Enter</Kbd>
            <span>expand</span>
          </p>
          <table aria-label="Leave approval queue" className="block w-full">
            <thead className="hidden lg:block">
              <tr className="hidden grid-cols-[1.2fr_0.8fr_1fr_1.1fr_0.8fr_auto] gap-4 px-4 py-3 text-muted-foreground text-xs lg:grid">
                <th className="text-left font-normal" scope="col">
                  Person
                </th>
                <th className="text-left font-normal" scope="col">
                  Type
                </th>
                <th className="text-left font-normal" scope="col">
                  Dates
                </th>
                <th className="text-left font-normal" scope="col">
                  Balance
                </th>
                <th className="text-left font-normal" scope="col">
                  Status
                </th>
                <th className="text-right font-normal" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="block">
              {items.map((record) => {
                const isExpanded = expandedId === record.id;
                const detailId = `approval-details-${record.id}`;
                const name = personName(record);
                const isRecordPending =
                  isPending && pendingRecordId === record.id;
                return (
                  <Fragment key={record.id}>
                    <tr
                      aria-busy={isRecordPending}
                      aria-controls={detailId}
                      aria-expanded={isExpanded}
                      className="grid cursor-pointer gap-4 px-4 py-5 focus-visible:bg-accent focus-visible:outline-[3px] focus-visible:outline-ring focus-visible:-outline-offset-2 lg:grid-cols-[1.2fr_0.8fr_1fr_1.1fr_0.8fr_auto] lg:items-center"
                      onClick={(event) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest("button, a, input, select")
                        ) {
                          return;
                        }
                        setExpandedId(isExpanded ? null : record.id);
                      }}
                      onKeyDown={(event) =>
                        handleRowKeyDown(event, record, isExpanded)
                      }
                      tabIndex={0}
                    >
                      <td className="block">
                        <PersonCell record={record} />
                      </td>
                      <QueueDatum label="Type">
                        {getAvailabilityRecordLabel(record.recordType)}
                      </QueueDatum>
                      <QueueDatum label="Dates">
                        {formatDateRange(record.startsAt, record.endsAt)}
                        <span className="block text-muted-foreground text-xs">
                          {record.durationWorkingDays === null
                            ? "Duration unavailable"
                            : `${record.durationWorkingDays} working days`}
                        </span>
                      </QueueDatum>
                      <QueueDatum label="Balance">
                        {balanceLabel(record)}
                      </QueueDatum>
                      <QueueDatum label="Status">
                        <ApprovalStatusBadge status={record.approvalStatus} />
                      </QueueDatum>
                      <td className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <ActionButtons
                          disabled={isRecordPending}
                          onInlineAction={runInlineAction}
                          onOpen={setModal}
                          record={record}
                        />
                        <Button
                          aria-controls={detailId}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${name}`}
                          onClick={() =>
                            setExpandedId(isExpanded ? null : record.id)
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <ChevronDownIcon
                            aria-hidden="true"
                            className="size-4"
                          />
                        </Button>
                        {isRecordPending ? (
                          <span
                            aria-live="polite"
                            className="text-muted-foreground text-xs"
                            role="status"
                          >
                            Updating {name}…
                          </span>
                        ) : null}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="block" id={detailId}>
                        <td className="block px-4 pb-4">
                          <DetailPanel
                            onInlineAction={runInlineAction}
                            record={record}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {nextCursor ? (
            <div className="flex justify-center border-t p-4">
              <Button
                onClick={() => setFilterParams({ cursor: nextCursor })}
                type="button"
                variant="secondary"
              >
                Load more
              </Button>
            </div>
          ) : null}
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

function inlineActionSuccessMessage(
  action: "retry_approval" | "retry_decline" | "revert_to_submitted"
): string {
  if (action === "revert_to_submitted") {
    return "Leave returned to pending";
  }
  if (action === "retry_approval") {
    return "Leave approved in Xero";
  }
  return "Leave declined in Xero";
}

function QueueSummary({ summary }: { summary: ApprovalSummaryCounts }) {
  return (
    <section
      aria-labelledby="approval-queue-summary"
      className="flex flex-col gap-4 rounded-[20px] bg-muted p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h3 className="font-semibold text-sm" id="approval-queue-summary">
          Approval queue
        </h3>
        <p className="mt-1 font-semibold text-3xl tabular-nums">
          {summary.pending}
          <span className="ml-2 font-normal text-muted-foreground text-sm">
            pending
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {summary.failedSync > 0 ? (
          <span className="rounded-xl bg-error-container px-3 py-2 font-medium text-on-error-container text-sm">
            {summary.failedSync} failed sync
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">No failed syncs</span>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer rounded-xl px-3 py-2 font-medium focus-visible:outline-[3px] focus-visible:outline-ring">
            This month
          </summary>
          <p className="mt-2 text-muted-foreground">
            {summary.approvedThisMonth} approved, {summary.declinedThisMonth}{" "}
            declined
          </p>
        </details>
      </div>
    </section>
  );
}

function QueueDatum({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <td className="block min-w-0 text-sm">
      <span className="mb-1 block text-muted-foreground text-xs lg:hidden">
        {label}
      </span>
      {children}
    </td>
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
          disabled={disabled}
          onClick={() => onOpen({ mode: "approve", record })}
          size="sm"
          type="button"
        >
          Approve
        </Button>
      )}
      {record.availableActions.includes("decline") && (
        <Button
          disabled={disabled}
          onClick={() => onOpen({ mode: "decline", record })}
          size="sm"
          type="button"
          variant="destructive"
        >
          Decline
        </Button>
      )}
      <SecondaryActions
        disabled={disabled}
        onInlineAction={onInlineAction}
        onOpen={onOpen}
        record={record}
      />
    </>
  );
}

function SecondaryActions({
  disabled,
  onInlineAction,
  onOpen,
  record,
}: Parameters<typeof ActionButtons>[0]) {
  const hasSecondaryAction = record.availableActions.some((action) =>
    [
      "request_more_info",
      "retry_approval",
      "retry_decline",
      "revert_to_submitted",
    ].includes(action)
  );
  if (!hasSecondaryAction) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`More actions for ${personName(record)}`}
          disabled={disabled}
          size="sm"
          type="button"
          variant="secondary"
        >
          <MoreHorizontalIcon aria-hidden="true" className="size-4" />
          More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Request actions</DropdownMenuLabel>
        {record.availableActions.includes("request_more_info") ? (
          <DropdownMenuItem onSelect={() => onOpen({ mode: "info", record })}>
            Request more information
          </DropdownMenuItem>
        ) : null}
        {record.availableActions.includes("retry_approval") ? (
          <DropdownMenuItem
            onSelect={() => onInlineAction(record, "retry_approval")}
          >
            Retry approval
          </DropdownMenuItem>
        ) : null}
        {record.availableActions.includes("retry_decline") ? (
          <DropdownMenuItem
            onSelect={() => onInlineAction(record, "retry_decline")}
          >
            Retry decline
          </DropdownMenuItem>
        ) : null}
        {record.availableActions.includes("revert_to_submitted") ? (
          <DropdownMenuItem
            onSelect={() => onInlineAction(record, "revert_to_submitted")}
          >
            Revert to pending
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
      {record.xeroWriteError ? (
        <XeroSyncFailedState
          failedAction={normaliseFailedAction(record.failedAction)}
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
      ) : null}
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
        Retry approval
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
        Retry decline
      </Button>
    );
  }
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

export function ApprovalStatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const presentation = statusPresentation(status);
  return (
    <Badge
      className={`gap-1 border-transparent shadow-none ${presentation.className}`}
      data-status={status}
      variant="secondary"
    >
      {presentation.icon}
      {label}
    </Badge>
  );
}

function statusPresentation(status: string) {
  if (status === "approved") {
    return {
      className: "bg-secondary text-secondary-foreground",
      icon: <CheckCircle2Icon aria-hidden="true" className="size-3" />,
    };
  }
  if (status === "declined") {
    return {
      className: "bg-surface-container-high text-on-surface",
      icon: <CircleXIcon aria-hidden="true" className="size-3" />,
    };
  }
  if (status === "withdrawn") {
    return {
      className: "bg-accent-container text-on-accent-container",
      icon: <Undo2Icon aria-hidden="true" className="size-3" />,
    };
  }
  if (status === "xero_sync_failed") {
    return {
      className: "bg-error-container text-on-error-container",
      icon: <AlertTriangleIcon aria-hidden="true" className="size-3" />,
    };
  }
  return {
    className: "bg-warning-container text-on-warning-container",
    icon: <Clock3Icon aria-hidden="true" className="size-3" />,
  };
}

function normaliseFailedAction(value: string | null): XeroFailedAction | null {
  if (
    value === "approve" ||
    value === "decline" ||
    value === "submit" ||
    value === "sync" ||
    value === "withdraw"
  ) {
    return value;
  }
  return null;
}

function modalRecord(record: ApprovalItem): ApprovalModalRecord {
  return {
    balanceAvailable: record.balanceSnapshot?.balanceAvailable ?? null,
    balanceCurrencyCode: record.balanceSnapshot?.currencyCode ?? null,
    balanceRemainingAfterApproval:
      record.balanceSnapshot?.balanceRemainingAfterApproval ?? null,
    balanceUnit: record.balanceSnapshot?.unit ?? null,
    durationWorkingDays: record.durationWorkingDays,
    employeeName: personName(record),
    endsAt: record.endsAt,
    id: record.id,
    organisationId: record.organisationId,
    recordType: record.recordType,
    startsAt: record.startsAt,
  };
}

function balanceLabel(record: ApprovalItem): string {
  const snapshot = record.balanceSnapshot;
  if (!snapshot) {
    return "Balance unavailable";
  }
  if (snapshot.balanceRemainingAfterApproval !== null) {
    return `${formatLeaveBalance({ amount: snapshot.balanceRemainingAfterApproval, unit: "days" })} remaining after approval`;
  }
  if (snapshot.balanceAvailable !== null) {
    return `${formatLeaveBalance({
      amount: snapshot.balanceAvailable,
      currencyCode: snapshot.currencyCode,
      unit: snapshot.unit,
    })} available`;
  }
  return "Balance unavailable";
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
