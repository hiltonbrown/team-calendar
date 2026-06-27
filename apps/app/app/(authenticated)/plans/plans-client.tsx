"use client";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
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
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";
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
  leaveBalanceUpdatedAt: string | Date | null;
}

export interface PlansClientRecord {
  allDay: boolean;
  approvalStatus: string;
  archivedAt: string | null;
  balanceChip: BalanceChip | null;
  editableActions: EditableAction[];
  endsAt: string;
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
    startTransition(async () => {
      setInlineError((current) => ({ ...current, [recordId]: "" }));
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
        {canViewTeam && (
          <TabLink
            active={filters.tab === "team"}
            href={tabHref("team", orgQueryValue)}
          >
            Team records
          </TabLink>
        )}
      </div>

      {records.length > 0 && <StatusOverview records={records} />}

      <form
        className="grid gap-4 rounded-2xl bg-muted p-5 md:grid-cols-5"
        method="get"
      >
        {orgQueryValue && (
          <input name="org" type="hidden" value={orgQueryValue} />
        )}
        <input name="tab" type="hidden" value={filters.tab} />
        <FilterField label="Category">
          <Select
            defaultValue={filters.recordTypeCategory}
            name="recordTypeCategory"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="xero_leave">Leave types</SelectItem>
              <SelectItem value="local_only">Availability</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select
            defaultValue={filters.approvalStatus?.[0] ?? "all"}
            name="approvalStatus"
          >
            <SelectTrigger>
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
        <FilterField label="From">
          <Input defaultValue={filters.dateFrom} name="dateFrom" type="date" />
        </FilterField>
        <FilterField label="To">
          <Input defaultValue={filters.dateTo} name="dateTo" type="date" />
        </FilterField>
        <div className="flex items-end">
          <Button className="w-full" type="submit" variant="secondary">
            Apply filters
          </Button>
        </div>
      </form>

      {records.length > 0 && (
        <div className="rounded-2xl bg-muted">
          <Table>
            <TableHeader>
              <TableRow>
                {filters.tab === "team" && <TableHead>Person</TableHead>}
                <TableHead>Plan</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => {
                const status = planStatusForRecord(record);
                return (
                  <TableRow className={status.rowClassName} key={record.id}>
                    {filters.tab === "team" && (
                      <TableCell>{record.personName}</TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {recordTypeLabels[record.recordType] ??
                            record.recordType}
                        </span>
                        <SourceBadge sourceType={record.sourceType} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDateRange(record.startsAt, record.endsAt)}
                    </TableCell>
                    <TableCell>
                      {record.workingDays === null
                        ? (record.workingDaysError ?? "Unavailable")
                        : `${record.workingDays} working days`}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5">
                        <StatusBadge status={status} />
                        <StatusCue status={status} />
                      </div>
                    </TableCell>
                    <TableCell>{renderBalance(record)}</TableCell>
                    <TableCell>
                      <RowActions
                        disabled={isPending}
                        onRunAction={runAction}
                        orgQueryValue={orgQueryValue}
                        record={record}
                      />
                      {inlineError[record.id] && (
                        <div
                          className={`mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm ${statusToneClasses.failed}`}
                          role="alert"
                        >
                          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                          <span>{inlineError[record.id]}</span>
                        </div>
                      )}
                      {record.approvalStatus === "xero_sync_failed" &&
                        record.xeroWriteError && (
                          <div className="mt-3">
                            <XeroSyncFailedState
                              message={record.xeroWriteError}
                              retrySlot={
                                <Button
                                  disabled={isPending}
                                  onClick={() =>
                                    setSubmissionModal({
                                      mode: "retry",
                                      record,
                                    })
                                  }
                                  size="sm"
                                  type="button"
                                >
                                  Retry
                                </Button>
                              }
                              revertSlot={
                                <Button
                                  disabled={isPending}
                                  onClick={() =>
                                    runAction(record.id, "revert_to_draft")
                                  }
                                  size="sm"
                                  type="button"
                                  variant="secondary"
                                >
                                  Revert to draft
                                </Button>
                              }
                            />
                          </div>
                        )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!hasActiveXeroConnection && (
        <p className="text-muted-foreground text-sm">
          Xero is disconnected, so new leave records save locally as approved
          calendar entries. They will not be submitted to payroll until Xero is
          connected.
        </p>
      )}

      {submissionModal && (
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
            endsAt: submissionModal.record.endsAt,
            id: submissionModal.record.id,
            organisationId,
            recordType: submissionModal.record.recordType,
            startsAt: submissionModal.record.startsAt,
            workingDays: submissionModal.record.workingDays,
          }}
        />
      )}

      {confirmationAction && (
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
      )}
    </section>
  );
}

function FilterField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
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
    <div className="grid gap-3 md:grid-cols-4">
      {summary.map((item) => (
        <div
          className={`rounded-2xl p-4 ${item.style.badgeClassName}`}
          key={item.label}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-medium text-sm">
              <span
                aria-hidden="true"
                className={`${item.style.dotClassName} size-2 rounded-full`}
              />
              {item.label}
            </span>
            <span className="font-semibold text-lg leading-none">
              {item.count}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed opacity-80">
            {item.description}
          </p>
        </div>
      ))}
    </div>
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
      {isManual ? "Availability" : "Leave"}
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
  const remaining =
    record.workingDays === null
      ? record.balanceChip.balanceAvailable
      : record.balanceChip.balanceAvailable - record.workingDays;
  return `${remaining} days left if approved`;
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
  return recordTypeLabels[recordType] ?? recordType;
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
