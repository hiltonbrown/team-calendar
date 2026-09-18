"use client";

import { getAvailabilityRecordLabel } from "@repo/core";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Clock3Icon,
  LeafIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { statusToneClasses } from "@/components/availability/availability-status";
import { SubmitConfirmationModal } from "@/components/plans/submit-confirmation-modal";
import {
  type XeroFailedAction,
  XeroSyncFailedState,
} from "@/components/states/xero-sync-failed-state";
import { formatLeaveBalance } from "@/lib/format-leave-balance";
import { withOrg } from "@/lib/navigation/org-url";
import {
  archiveRecordAction,
  deleteDraftAction,
  restoreRecordAction,
  retrySubmissionAction,
  revertToDraftAction,
  submitForApprovalAction,
  withdrawSubmissionAction,
} from "./_actions";
import type { PlansFilterInput } from "./_schemas";
import {
  type PlanStatusTone,
  planStatusForRecord,
  planStatusLegend,
  planStatusStyle,
  planStatusToneForRecord,
} from "./_status";

type EditableAction =
  | "archive"
  | "delete_draft"
  | "edit"
  | "restore"
  | "retry_submission"
  | "revert_to_draft"
  | "submit_for_approval"
  | "view"
  | "withdraw";

type RunnableAction = Exclude<EditableAction, "edit" | "view">;
type RowAction = Exclude<EditableAction, "view">;

interface BalanceChip {
  balanceAvailable: number | null;
  balanceUnavailableReason: "local_only" | "not_synced" | "not_xero_leave";
  currencyCode?: string | null;
  leaveBalanceUpdatedAt: string | Date | null;
  unit?: string | null;
}

export interface PlansClientRecord {
  allDay: boolean;
  approvalStatus: string;
  archivedAt: string | null;
  balanceChip: BalanceChip | null;
  editableActions: EditableAction[];
  endsAt: string;
  failedAction: "submit" | "withdraw" | null;
  id: string;
  personName: string;
  recordType: string;
  sourceType: string;
  startsAt: string;
  workingDays: number | null;
  workingDaysError: string | null;
  xeroWriteError: string | null;
}

interface PlansClientProps {
  canViewTeam: boolean;
  filters: PlansFilterInput;
  hasActiveXeroConnection: boolean;
  organisationId: string;
  orgQueryValue: string | null;
  records: PlansClientRecord[];
}

const recordTypeLabels: Record<string, string> = {
  alternative_contact: "Alternative contact",
  annual_leave: "Annual leave",
  another_office: "Another office",
  client_site: "Client site",
  contractor_unavailable: "Contractor unavailable",
  holiday: "Holiday",
  limited_availability: "Limited availability",
  long_service_leave: "Long service leave",
  offsite_meeting: "Offsite meeting",
  other: "Other",
  personal_leave: "Personal leave",
  sick_leave: "Sick leave",
  training: "Training",
  travelling: "Travelling",
  unpaid_leave: "Unpaid leave",
  wfh: "Working from home",
};

const leaveRecordTypes = new Set([
  "annual_leave",
  "holiday",
  "long_service_leave",
  "personal_leave",
  "sick_leave",
  "unpaid_leave",
]);

const primaryActionOrder: RowAction[] = [
  "retry_submission",
  "submit_for_approval",
  "edit",
  "restore",
  "revert_to_draft",
  "archive",
  "withdraw",
  "delete_draft",
];

export function PlansClient({
  canViewTeam,
  filters,
  hasActiveXeroConnection,
  organisationId,
  orgQueryValue,
  records,
}: PlansClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<Record<string, string>>({});
  const [submissionModal, setSubmissionModal] = useState<{
    mode: "retry" | "submit";
    record: PlansClientRecord;
  } | null>(null);
  const [confirmationAction, setConfirmationAction] = useState<{
    action: "revert_to_draft" | "withdraw";
    record: PlansClientRecord;
  } | null>(null);

  const newRecordHref = withOrg("/plans/new", orgQueryValue);

  const runAction = (recordId: string, action: RunnableAction) => {
    const record = records.find((candidate) => candidate.id === recordId);
    if (!record) {
      return;
    }
    if (action === "submit_for_approval" || action === "retry_submission") {
      setSubmissionModal({
        mode: action === "retry_submission" ? "retry" : "submit",
        record,
      });
      return;
    }
    if (action === "revert_to_draft" || action === "withdraw") {
      setConfirmationAction({ action, record });
      return;
    }
    executeAction(recordId, action);
  };

  const executeAction = (recordId: string, action: RunnableAction) => {
    setPendingRecordId(recordId);
    setInlineError((current) => ({ ...current, [recordId]: "" }));
    startTransition(async () => {
      try {
        const result = await runRecordAction(action, {
          organisationId,
          recordId,
        });

        if (!result.ok) {
          setInlineError((current) => ({
            ...current,
            [recordId]: result.error.message,
          }));
          return;
        }

        setConfirmationAction(null);
        if (action === "withdraw") {
          toast.success("Submission withdrawn.");
        }
        router.refresh();
      } finally {
        setPendingRecordId(null);
      }
    });
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-2xl bg-muted p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
            Availability planning
          </p>
          <h1 className="mt-2 font-semibold text-3xl text-foreground tracking-tight">
            Plans
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            Create leave requests and availability records, then track what
            needs approval, Xero sync, or correction.
          </p>
        </div>
        <Button asChild>
          <Link href={newRecordHref}>
            <PlusIcon className="mr-2 size-4" />
            New record
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <TabLink
          active={filters.tab === "my"}
          href={tabHref("my", orgQueryValue)}
        >
          My records
        </TabLink>
        {canViewTeam ? (
          <TabLink
            active={filters.tab === "team"}
            href={tabHref("team", orgQueryValue)}
          >
            Team records
          </TabLink>
        ) : null}
      </div>

      {records.length > 0 && <StatusOverview records={records} />}

      <form
        className="grid gap-4 rounded-2xl bg-muted p-5 md:grid-cols-3 xl:grid-cols-6"
        method="get"
      >
        {orgQueryValue ? (
          <input name="org" type="hidden" value={orgQueryValue} />
        ) : null}
        <input name="tab" type="hidden" value={filters.tab} />
        <FilterField htmlFor="plans-category" label="Category">
          <Select
            defaultValue={filters.recordTypeCategory}
            name="recordTypeCategory"
          >
            <SelectTrigger id="plans-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="xero_leave">Leave types</SelectItem>
              <SelectItem value="local_only">Availability</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField htmlFor="plans-source" label="Source">
          <Select
            defaultValue={filters.sourceType?.[0] ?? "all"}
            name="sourceType"
          >
            <SelectTrigger id="plans-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="team_calendar_leave">Xero</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField htmlFor="plans-status" label="Status">
          <Select
            defaultValue={filters.approvalStatus?.[0] ?? "all"}
            name="approvalStatus"
          >
            <SelectTrigger id="plans-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="xero_sync_failed">Xero sync failed</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField htmlFor="plans-date-from" label="From">
          <Input
            defaultValue={filters.dateFrom}
            id="plans-date-from"
            name="dateFrom"
            type="date"
          />
        </FilterField>
        <FilterField htmlFor="plans-date-to" label="To">
          <Input
            defaultValue={filters.dateTo}
            id="plans-date-to"
            name="dateTo"
            type="date"
          />
        </FilterField>
        <div className="flex items-end">
          <Button className="w-full" type="submit" variant="secondary">
            Apply filters
          </Button>
        </div>
      </form>

      <ActiveFilters filters={filters} orgQueryValue={orgQueryValue} />

      {records.length > 0 && (
        <div className="rounded-2xl bg-muted p-3 xl:p-0">
          <table className="block w-full text-sm xl:table">
            <thead className="sr-only xl:table-header-group">
              <tr>
                {filters.tab === "team" && (
                  <th className="p-3 text-left">Person</th>
                )}
                <th className="p-3 text-left">Plan</th>
                <th className="p-3 text-left">Dates</th>
                <th className="p-3 text-left">Duration</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Balance</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block space-y-3 xl:table-row-group xl:space-y-0">
              {records.map((record) => {
                const status = planStatusForRecord(record);
                const rowPending = pendingRecordId === record.id;
                return (
                  <tr
                    aria-busy={rowPending}
                    className={`grid gap-4 rounded-2xl bg-background p-4 xl:table-row xl:rounded-none xl:bg-transparent xl:p-0 ${status.rowClassName}`}
                    key={record.id}
                  >
                    {filters.tab === "team" && (
                      <td className="xl:p-3">
                        <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
                          Person
                        </span>
                        {record.personName}
                      </td>
                    )}
                    <td className="xl:p-3">
                      <div className="flex flex-col gap-2">
                        <span className="font-medium">
                          {recordTypeLabels[record.recordType] ??
                            getAvailabilityRecordLabel(record.recordType)}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <CategoryBadge recordType={record.recordType} />
                          <SourceBadge sourceType={record.sourceType} />
                        </div>
                      </div>
                    </td>
                    <td className="xl:p-3">
                      <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
                        Dates
                      </span>
                      {formatDateRange(record.startsAt, record.endsAt)}
                    </td>
                    <td className="hidden xl:table-cell xl:p-3">
                      {record.workingDays === null
                        ? (record.workingDaysError ?? "Unavailable")
                        : `${record.workingDays} working days`}
                    </td>
                    <td className="xl:p-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusBadge status={status} />
                        <span className="hidden xl:inline">
                          <StatusCue status={status} />
                        </span>
                      </div>
                    </td>
                    <td className="xl:p-3">
                      <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
                        Balance
                      </span>
                      {renderBalance(record) || "Not applicable"}
                    </td>
                    <td className="xl:p-3">
                      <RowActions
                        disabled={rowPending}
                        onRunAction={runAction}
                        orgQueryValue={orgQueryValue}
                        record={record}
                      />
                      {rowPending ? (
                        <p
                          className="mt-2 text-right text-muted-foreground text-xs"
                          role="status"
                        >
                          Updating this plan…
                        </p>
                      ) : null}
                      <details className="mt-3 rounded-xl bg-muted p-3 xl:hidden">
                        <summary className="cursor-pointer font-medium">
                          Plan details
                        </summary>
                        <dl className="mt-3 grid gap-2">
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              Duration
                            </dt>
                            <dd>
                              {record.workingDays === null
                                ? (record.workingDaysError ?? "Unavailable")
                                : `${record.workingDays} working days`}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">
                              Status detail
                            </dt>
                            <dd>
                              {statusCueForTone(status.tone) ??
                                "No further action is needed."}
                            </dd>
                          </div>
                        </dl>
                      </details>
                      {inlineError[record.id] ? (
                        <div
                          className={`mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm ${statusToneClasses.failed}`}
                          role="alert"
                        >
                          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                          <span>{inlineError[record.id]}</span>
                        </div>
                      ) : null}
                      {record.approvalStatus === "xero_sync_failed" &&
                        record.xeroWriteError && (
                          <div className="mt-3">
                            <XeroSyncFailedState
                              failedAction={normalisePlanFailedAction(
                                record.failedAction
                              )}
                              message={record.xeroWriteError}
                              retrySlot={
                                record.failedAction === "submit" ? (
                                  <Button
                                    disabled={rowPending}
                                    onClick={() =>
                                      setSubmissionModal({
                                        mode: "retry",
                                        record,
                                      })
                                    }
                                    size="sm"
                                    type="button"
                                  >
                                    Retry submission
                                  </Button>
                                ) : undefined
                              }
                              revertSlot={
                                record.failedAction === "submit" ? (
                                  <Button
                                    disabled={rowPending}
                                    onClick={() =>
                                      runAction(record.id, "revert_to_draft")
                                    }
                                    size="sm"
                                    type="button"
                                    variant="secondary"
                                  >
                                    Revert to draft
                                  </Button>
                                ) : undefined
                              }
                            />
                          </div>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!hasActiveXeroConnection && (
        <p className="text-muted-foreground text-sm">
          Xero is disconnected, so new leave records save locally as approved
          calendar entries. They will not be submitted to payroll until Xero is
          connected.
        </p>
      )}

      {submissionModal ? (
        <SubmitConfirmationModal
          mode={submissionModal.mode}
          onClose={() => setSubmissionModal(null)}
          onSuccess={() => {
            setSubmissionModal(null);
            toast.success("Leave sent to Xero for approval.");
            router.refresh();
          }}
          record={{
            balanceAvailable:
              submissionModal.record.balanceChip?.balanceAvailable ?? null,
            balanceCurrencyCode:
              submissionModal.record.balanceChip?.currencyCode ?? null,
            balanceUnit: submissionModal.record.balanceChip?.unit ?? null,
            endsAt: submissionModal.record.endsAt,
            id: submissionModal.record.id,
            organisationId,
            recordType: submissionModal.record.recordType,
            startsAt: submissionModal.record.startsAt,
            workingDays: submissionModal.record.workingDays,
          }}
        />
      ) : null}

      {confirmationAction ? (
        <ConfirmActionDialog
          action={confirmationAction.action}
          disabled={isPending}
          onCancel={() => setConfirmationAction(null)}
          onConfirm={() =>
            executeAction(
              confirmationAction.record.id,
              confirmationAction.action
            )
          }
        />
      ) : null}
    </section>
  );
}

function FilterField({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function TabLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Button asChild variant={active ? "default" : "secondary"}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function ActiveFilters({
  filters,
  orgQueryValue,
}: {
  filters: PlansFilterInput;
  orgQueryValue: string | null;
}) {
  const labels = activeFilterLabels(filters);
  if (labels.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">Active filters</legend>
      <span className="text-muted-foreground text-sm">
        {labels.length === 1
          ? "1 filter active"
          : `${labels.length} filters active`}
      </span>
      {labels.map((label) => (
        <Badge key={label} variant="secondary">
          {label}
        </Badge>
      ))}
      <Button asChild size="sm" variant="ghost">
        <Link href={tabHref(filters.tab, orgQueryValue)}>Clear filters</Link>
      </Button>
    </fieldset>
  );
}

function tabHref(tab: "my" | "team", orgQueryValue: string | null): string {
  return withOrg(`/plans?tab=${tab}`, orgQueryValue);
}

function RowActions({
  disabled,
  onRunAction,
  orgQueryValue,
  record,
}: {
  disabled: boolean;
  onRunAction: (recordId: string, action: RunnableAction) => void;
  orgQueryValue: string | null;
  record: PlansClientRecord;
}) {
  const actions = renderableActions(record.editableActions);
  const primaryAction = primaryActionForRecord(actions);
  const secondaryActions = actions.filter((action) => action !== primaryAction);

  if (!primaryAction && secondaryActions.length === 0) {
    return (
      <p className="text-right text-muted-foreground text-sm">No action</p>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {primaryAction && (
        <ActionButton
          action={primaryAction}
          disabled={disabled}
          onRunAction={onRunAction}
          orgQueryValue={orgQueryValue}
          record={record}
        />
      )}
      {secondaryActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`More actions for ${recordTypeLabel(record.recordType)}`}
              disabled={disabled}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {secondaryActions.map((action) => (
              <ActionMenuItem
                action={action}
                disabled={disabled}
                key={action}
                onRunAction={onRunAction}
                orgQueryValue={orgQueryValue}
                record={record}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function ActionButton({
  action,
  disabled,
  onRunAction,
  orgQueryValue,
  record,
}: {
  action: RowAction;
  disabled: boolean;
  onRunAction: (recordId: string, action: RunnableAction) => void;
  orgQueryValue: string | null;
  record: PlansClientRecord;
}) {
  if (action === "edit") {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href={withOrg(`/plans/${record.id}/edit`, orgQueryValue)}>
          Edit
        </Link>
      </Button>
    );
  }

  return (
    <Button
      disabled={disabled}
      onClick={() => onRunAction(record.id, action)}
      size="sm"
      type="button"
      variant={buttonVariantForAction(action)}
    >
      {actionLabel(action)}
    </Button>
  );
}

function ActionMenuItem({
  action,
  disabled,
  onRunAction,
  orgQueryValue,
  record,
}: {
  action: RowAction;
  disabled: boolean;
  onRunAction: (recordId: string, action: RunnableAction) => void;
  orgQueryValue: string | null;
  record: PlansClientRecord;
}) {
  if (action === "edit") {
    return (
      <DropdownMenuItem asChild>
        <Link href={withOrg(`/plans/${record.id}/edit`, orgQueryValue)}>
          Edit
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() => onRunAction(record.id, action)}
      variant={isDestructiveAction(action) ? "destructive" : "default"}
    >
      {actionLabel(action)}
    </DropdownMenuItem>
  );
}

function StatusOverview({ records }: { records: PlansClientRecord[] }) {
  const summary = planStatusLegend.map((item) => ({
    ...item,
    count: countRecordsForLegend(records, item.tone),
    style: planStatusStyle(item.tone),
  }));

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-muted p-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="font-medium text-sm">Current view</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Review pending or failed plans first; approved plans need no action.
        </p>
      </div>
      <ul aria-label="Plan status summary" className="flex flex-wrap gap-2">
        {summary.map((item) => (
          <li
            className={`flex items-center gap-2 rounded-xl px-3 py-2 ${item.style.badgeClassName}`}
            key={item.label}
            title={item.description}
          >
            <span
              aria-hidden="true"
              className={`${item.style.dotClassName} size-2 rounded-full`}
            />
            <span className="font-medium text-xs">{item.label}</span>
            <span className="font-semibold text-sm">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryBadge({ recordType }: { recordType: string }) {
  return (
    <Badge variant="secondary">
      {leaveRecordTypes.has(recordType) ? "Leave" : "Availability"}
    </Badge>
  );
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  const isManual = sourceType === "manual";
  return (
    <Badge
      className={
        isManual
          ? "border-transparent bg-accent-container text-on-accent-container ring-1 ring-on-accent-container/15"
          : "border-transparent bg-secondary text-secondary-foreground ring-1 ring-secondary/60"
      }
      variant="secondary"
    >
      {isManual ? (
        <PencilIcon className="size-3" />
      ) : (
        <LeafIcon className="size-3" />
      )}
      {isManual ? "Manual" : "Xero"}
    </Badge>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof planStatusForRecord>;
}) {
  const Icon = iconForPlanStatus(status.tone);
  return (
    <Badge className={status.badgeClassName} variant="secondary">
      <Icon className="size-3" />
      {status.label}
    </Badge>
  );
}

function renderBalance(record: PlansClientRecord): string {
  if (!record.balanceChip) {
    return "";
  }
  if (record.balanceChip.balanceAvailable === null) {
    return balanceUnavailableCopy(record.balanceChip.balanceUnavailableReason);
  }
  const unit = record.balanceChip.unit ?? "days";
  if (unit === "days") {
    const remaining =
      record.workingDays === null
        ? record.balanceChip.balanceAvailable
        : record.balanceChip.balanceAvailable - record.workingDays;
    return `${formatLeaveBalance({ amount: remaining, unit: "days" })} left if approved`;
  }
  return `${formatLeaveBalance({
    amount: record.balanceChip.balanceAvailable,
    currencyCode: record.balanceChip.currencyCode,
    unit,
  })} available`;
}

function balanceUnavailableCopy(
  reason: BalanceChip["balanceUnavailableReason"]
) {
  switch (reason) {
    case "local_only":
    case "not_xero_leave":
      return "No payroll balance needed";
    case "not_synced":
      return "Balance not synced yet";
    default:
      return "Balance not available";
  }
}

function formatDateRange(startsAt: string, endsAt: string): string {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);
  return start === end ? start : `${start} to ${end}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function activeFilterLabels(filters: PlansFilterInput): string[] {
  const labels: string[] = [];
  if (filters.recordTypeCategory === "xero_leave") {
    labels.push("Category: Leave");
  } else if (filters.recordTypeCategory === "local_only") {
    labels.push("Category: Availability");
  }
  const sourceType = filters.sourceType?.[0];
  if (sourceType) {
    labels.push(`Source: ${sourceType === "manual" ? "Manual" : "Xero"}`);
  }
  const approvalStatus = filters.approvalStatus?.[0];
  if (approvalStatus) {
    labels.push(`Status: ${approvalStatus.replaceAll("_", " ")}`);
  }
  if (filters.dateFrom) {
    labels.push(`From: ${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    labels.push(`To: ${filters.dateTo}`);
  }
  if (filters.includeArchived) {
    labels.push("Archived included");
  }
  if (filters.recordType?.[0]) {
    labels.push(`Type: ${recordTypeLabel(filters.recordType[0])}`);
  }
  if (filters.personId?.length) {
    labels.push("People filtered");
  }
  return labels;
}

function normalisePlanFailedAction(
  value: PlansClientRecord["failedAction"]
): XeroFailedAction | null {
  return value === "submit" || value === "withdraw" ? value : null;
}

function actionLabel(action: EditableAction): string {
  switch (action) {
    case "archive":
      return "Archive";
    case "delete_draft":
      return "Delete draft";
    case "restore":
      return "Restore";
    case "retry_submission":
      return "Retry";
    case "revert_to_draft":
      return "Revert to draft";
    case "submit_for_approval":
      return "Submit for approval";
    case "withdraw":
      return "Withdraw";
    case "edit":
      return "Edit";
    case "view":
      return "View";
    default:
      return action;
  }
}

function countRecordsForLegend(
  records: PlansClientRecord[],
  tone: PlanStatusTone
): number {
  return records.filter((record) => {
    const recordTone = planStatusToneForRecord(record);
    if (tone === "xero_sync_failed") {
      return recordTone === "xero_sync_failed" || recordTone === "declined";
    }
    if (tone === "draft") {
      return (
        recordTone === "draft" ||
        recordTone === "archived" ||
        recordTone === "withdrawn"
      );
    }
    return recordTone === tone;
  }).length;
}

function iconForPlanStatus(tone: PlanStatusTone) {
  switch (tone) {
    case "approved":
      return CheckCircle2Icon;
    case "archived":
      return ArchiveIcon;
    case "declined":
      return XCircleIcon;
    case "pending":
      return Clock3Icon;
    case "withdrawn":
      return RotateCcwIcon;
    case "xero_sync_failed":
      return AlertTriangleIcon;
    default:
      return CircleDashedIcon;
  }
}

function StatusCue({
  status,
}: {
  status: ReturnType<typeof planStatusForRecord>;
}) {
  const cue = statusCueForTone(status.tone);
  if (!cue) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs leading-tight">{cue}</span>
  );
}

function statusCueForTone(tone: PlanStatusTone): string | null {
  switch (tone) {
    case "pending":
      return "Sent to Xero, waiting on approval";
    case "declined":
      return "Declined in Xero, edit before retrying";
    case "xero_sync_failed":
      return "Xero did not accept it, retry or revert";
    default:
      return null;
  }
}

function renderableActions(actions: EditableAction[]): RowAction[] {
  return actions.filter((action): action is RowAction => action !== "view");
}

function primaryActionForRecord(actions: RowAction[]): RowAction | null {
  for (const action of primaryActionOrder) {
    if (actions.includes(action)) {
      return action;
    }
  }
  return actions[0] ?? null;
}

function isDestructiveAction(action: RowAction): boolean {
  return action === "delete_draft" || action === "withdraw";
}

function buttonVariantForAction(
  action: RowAction
): "default" | "destructive" | "secondary" {
  if (action === "retry_submission" || action === "submit_for_approval") {
    return "default";
  }
  if (isDestructiveAction(action)) {
    return "destructive";
  }
  return "secondary";
}

function recordTypeLabel(recordType: string): string {
  return recordTypeLabels[recordType] ?? getAvailabilityRecordLabel(recordType);
}

function ConfirmActionDialog({
  action,
  disabled,
  onCancel,
  onConfirm,
}: {
  action: "revert_to_draft" | "withdraw";
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isWithdraw = action === "withdraw";
  const title = isWithdraw ? "Withdraw submission?" : "Revert to draft?";
  const description = isWithdraw
    ? "This removes the pending request from Xero. Team Calendar will keep the local record as withdrawn."
    : "This clears the failed Xero sync state and keeps the record editable. It will not be sent again until you submit.";
  const cancelLabel = isWithdraw ? "Keep submitted" : "Keep failed state";
  const confirmLabel = isWithdraw ? "Withdraw from Xero" : "Revert to draft";

  const handleOpenChange = (open: boolean) => {
    if (!(open || disabled)) {
      onCancel();
    }
  };

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={true}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disabled}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              isWithdraw
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

async function runRecordAction(
  action: RunnableAction,
  input: { organisationId: string; recordId: string }
) {
  switch (action) {
    case "archive":
      return await archiveRecordAction(input);
    case "delete_draft":
      return await deleteDraftAction(input);
    case "restore":
      return await restoreRecordAction(input);
    case "submit_for_approval":
      return await submitForApprovalAction(input);
    case "withdraw":
      return await withdrawSubmissionAction(input);
    case "retry_submission":
      return await retrySubmissionAction(input);
    case "revert_to_draft":
      return await revertToDraftAction(input);
    default:
      return await revertToDraftAction(input);
  }
}
