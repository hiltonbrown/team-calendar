"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import {
  retrySubmissionAction,
  revertToDraftAction,
  submitForApprovalAction,
} from "@/app/(authenticated)/plans/_actions";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";

interface SubmitConfirmationRecord {
  balanceAvailable: number | null;
  endsAt: string;
  id: string;
  organisationId: string;
  recordType: string;
  startsAt: string;
  workingDays: number | null;
}

interface SubmitConfirmationModalProps {
  mode: "retry" | "submit";
  onClose: () => void;
  onSuccess: () => void;
  record: SubmitConfirmationRecord;
}

const recordTypeLabels: Record<string, string> = {
  annual_leave: "Annual leave",
  holiday: "Holiday",
  long_service_leave: "Long service leave",
  personal_leave: "Personal leave",
  sick_leave: "Sick leave",
  unpaid_leave: "Unpaid leave",
};

export function SubmitConfirmationModal({
  mode,
  onClose,
  onSuccess,
  record,
}: SubmitConfirmationModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const title =
    mode === "retry" ? "Retry Xero submission?" : "Send leave to Xero?";
  const description =
    mode === "retry"
      ? "This will send the leave request to Xero again. If Xero accepts it, the request moves back into the manager approval queue."
      : "This sends the leave request to Xero Payroll and puts it in the manager approval queue. It is not approved until Xero accepts it.";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!(nextOpen || isPending)) {
      onClose();
    }
  };

  const submit = async () => {
    setIsPending(true);
    try {
      setMessage(null);
      const action =
        mode === "retry" ? retrySubmissionAction : submitForApprovalAction;
      const result = await action({
        organisationId: record.organisationId,
        recordId: record.id,
      });

      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }

      if (result.value.approvalStatus === "xero_sync_failed") {
        setMessage(
          result.value.xeroWriteError ??
            "We could not send this leave to Xero. Try again, or save it as a draft if you need to edit the dates or leave type."
        );
        return;
      }

      onSuccess();
    } finally {
      setIsPending(false);
    }
  };

  const revert = async () => {
    setIsPending(true);
    try {
      const result = await revertToDraftAction({
        organisationId: record.organisationId,
        recordId: record.id,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      onClose();
    } finally {
      setIsPending(false);
    }
  };

  const content = (
    <div className="space-y-5">
      <div className="rounded-2xl bg-muted p-4 text-sm">
        <dl className="grid gap-3">
          <SummaryRow label="Leave type">
            {recordTypeLabels[record.recordType] ??
              labelForType(record.recordType)}
          </SummaryRow>
          <SummaryRow label="Dates">
            {formatDateRange(record.startsAt, record.endsAt)}
          </SummaryRow>
          <SummaryRow label="Duration">
            {record.workingDays === null
              ? "Duration unavailable"
              : `${record.workingDays} working days`}
          </SummaryRow>
          <SummaryRow label="Balance impact">
            {balanceImpact(record.balanceAvailable, record.workingDays)}
          </SummaryRow>
        </dl>
      </div>

      {message && (
        <XeroSyncFailedState
          message={message}
          retrySlot={
            <Button
              disabled={isPending}
              onClick={submit}
              size="sm"
              type="button"
            >
              Try again
            </Button>
          }
          revertSlot={
            <Button
              disabled={isPending}
              onClick={revert}
              size="sm"
              type="button"
              variant="secondary"
            >
              Revert to draft
            </Button>
          }
        />
      )}

      <DialogFooter>
        <Button
          disabled={isPending}
          onClick={onClose}
          type="button"
          variant="secondary"
        >
          Cancel
        </Button>
        <Button disabled={isPending} onClick={submit} type="button">
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {mode === "retry" ? "Retry Xero sync" : "Send to Xero"}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={true}>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-[400px]"
        showCloseButton={!isPending}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1">
      <dt className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
        {label}
      </dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function balanceImpact(
  balanceAvailable: number | null,
  workingDays: number | null
) {
  if (balanceAvailable === null || workingDays === null) {
    return "Balance unavailable";
  }
  return `${balanceAvailable - workingDays} days remaining after this submission`;
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

function labelForType(recordType: string): string {
  return recordType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
