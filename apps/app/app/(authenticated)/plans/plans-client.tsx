"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
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
import { AlertCircleIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
            Save leave and availability records before they appear in calendars,
            feeds and dashboards.
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
        <div className="overflow-hidden rounded-2xl bg-muted">
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
              {records.map((record) => (
                <TableRow key={record.id}>
                  {filters.tab === "team" && (
                    <TableCell>{record.personName}</TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        {recordTypeLabels[record.recordType] ??
                          record.recordType}
                      </span>
                      <Badge variant="secondary">
                        {record.sourceType === "manual"
                          ? "Availability"
                          : "Leave"}
                      </Badge>
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
                    <StatusBadge record={record} />
                  </TableCell>
                  <TableCell>{renderBalance(record)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {record.editableActions.map((action) => {
                        if (action === "view") {
                          return (
                            <Button
                              disabled
                              key={action}
                              size="sm"
                              variant="ghost"
                            >
                              View
                            </Button>
                          );
                        }
                        if (action === "edit") {
                          return (
                            <Button
                              asChild
                              key={action}
                              size="sm"
                              variant="secondary"
                            >
                              <Link
                                href={withOrg(
                                  `/plans/${record.id}/edit`,
                                  orgQueryValue
                                )}
                              >
                                Edit
                              </Link>
                            </Button>
                          );
                        }
                        return (
                          <Button
                            disabled={isPending}
                            key={action}
                            onClick={() => runAction(record.id, action)}
                            size="sm"
                            type="button"
                            variant={
                              action === "submit_for_approval"
                                ? "secondary"
                                : "ghost"
                            }
                          >
                            {actionLabel(action)}
                          </Button>
                        );
                      })}
                    </div>
                    {inlineError[record.id] && (
                      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-background p-3 text-muted-foreground text-sm">
                        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!hasActiveXeroConnection && (
        <p className="text-muted-foreground text-sm">
          Leave records are saved as approved while Xero is disconnected.
        </p>
      )}

      {submissionModal && (
        <SubmitConfirmationModal
          mode={submissionModal.mode}
          onClose={() => setSubmissionModal(null)}
          onSuccess={() => {
            setSubmissionModal(null);
            toast.success("Leave submitted for approval.");
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

function StatusBadge({ record }: { record: PlansClientRecord }) {
  let label = "Archived";
  if (record.archivedAt === null) {
    label =
      record.approvalStatus === "xero_sync_failed"
        ? "Xero sync failed"
        : record.approvalStatus.charAt(0).toUpperCase() +
          record.approvalStatus.slice(1).replaceAll("_", " ");
  }

  return <Badge variant="secondary">{label}</Badge>;
}

function renderBalance(record: PlansClientRecord): string {
  if (!record.balanceChip) {
    return "";
  }
  if (record.balanceChip.balanceAvailable === null) {
    return "Balance unavailable";
  }
  const remaining =
    record.workingDays === null
      ? record.balanceChip.balanceAvailable
      : record.balanceChip.balanceAvailable - record.workingDays;
  return `${remaining} days remaining after this`;
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
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <section className="w-full max-w-[400px] rounded-2xl bg-background p-6 shadow-sm">
        <h2 className="font-semibold text-xl">
          {isWithdraw ? "Withdraw submission?" : "Revert to draft?"}
        </h2>
        <p className="mt-3 text-muted-foreground text-sm">
          {isWithdraw
            ? "This will withdraw the submitted leave record in Xero."
            : "This will clear the Xero sync error so you can edit before retrying."}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button
            disabled={disabled}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button disabled={disabled} onClick={onConfirm} type="button">
            {isWithdraw ? "Withdraw" : "Revert to draft"}
          </Button>
        </div>
      </section>
    </div>
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
