"use client";

import { getAvailabilityRecordLabel } from "@repo/core";

import { Button } from "@repo/design-system/components/ui/button";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import {
  approveAction,
  retryApprovalAction,
  revertApprovalAttemptAction,
} from "@/app/(authenticated)/leave-approvals/_actions";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";
import { formatLeaveBalance } from "@/lib/format-leave-balance";

export interface ApprovalModalRecord {
  balanceAvailable?: number | null;
  balanceCurrencyCode?: string | null;
  balanceRemainingAfterApproval: number | null;
  balanceUnit?: string | null;
  durationWorkingDays: number | null;
  employeeName: string;
  endsAt: string | Date;
  id: string;
  organisationId: string;
  recordType: string;
  startsAt: string | Date;
}

interface ApproveConfirmationModalProps {
  onClose: () => void;
  onSuccess: () => void;
  record: ApprovalModalRecord;
}

export function ApproveConfirmationModal({
  onClose,
  onSuccess,
  record,
}: ApproveConfirmationModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (retry = false) => {
    setIsPending(true);
    setMessage(null);
    try {
      const action = retry ? retryApprovalAction : approveAction;
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
            "Something went wrong when sending this to Xero. Try again or contact support if the issue continues."
        );
        return;
      }
      toast.success("Leave approved in Xero");
      onSuccess();
    } finally {
      setIsPending(false);
    }
  };

  const revert = async () => {
    setIsPending(true);
    try {
      const result = await revertApprovalAttemptAction({
        organisationId: record.organisationId,
        recordId: record.id,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      toast.success("Leave returned to pending");
      onClose();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <InterceptingModalShell
      closeDisabled={isPending}
      onClose={onClose}
      size="narrow"
      title="Approve this leave?"
    >
      <div className="space-y-5">
        <SummaryBlock record={record} />
        <p className="text-muted-foreground text-sm">
          This will send approval to Xero Payroll and notify the employee.
        </p>
        {message ? (
          <XeroSyncFailedState
            failedAction="approve"
            message={message}
            retrySlot={
              <Button
                disabled={isPending}
                onClick={() => submit(true)}
                size="sm"
                type="button"
              >
                Retry approval
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
                Revert to pending
              </Button>
            }
          />
        ) : null}
        <div className="flex justify-end gap-3">
          <Button
            disabled={isPending}
            onClick={onClose}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={isPending}
            onClick={() => submit(false)}
            type="button"
          >
            {isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            Confirm and approve
          </Button>
        </div>
      </div>
    </InterceptingModalShell>
  );
}

export function SummaryBlock({ record }: { record: ApprovalModalRecord }) {
  return (
    <div className="rounded-2xl bg-muted p-4 text-sm">
      <dl className="grid gap-3">
        <SummaryRow label="Employee">{record.employeeName}</SummaryRow>
        <SummaryRow label="Leave type">
          {getAvailabilityRecordLabel(record.recordType)}
        </SummaryRow>
        <SummaryRow label="Dates">
          {formatDateRange(record.startsAt, record.endsAt)}
        </SummaryRow>
        <SummaryRow label="Duration">
          {record.durationWorkingDays === null
            ? "Duration unavailable"
            : `${record.durationWorkingDays} working days`}
        </SummaryRow>
        <SummaryRow label="Balance impact">{balanceImpact(record)}</SummaryRow>
      </dl>
    </div>
  );
}

function balanceImpact(record: ApprovalModalRecord): string {
  if (record.balanceRemainingAfterApproval !== null) {
    return `${formatLeaveBalance({ amount: record.balanceRemainingAfterApproval, unit: "days" })} remaining after approval`;
  }
  if (
    record.balanceAvailable !== null &&
    record.balanceAvailable !== undefined
  ) {
    return `${formatLeaveBalance({
      amount: record.balanceAvailable,
      currencyCode: record.balanceCurrencyCode,
      unit: record.balanceUnit,
    })} available`;
  }
  return "Balance unavailable";
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

function formatDateRange(startsAt: string | Date, endsAt: string | Date) {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);
  return start === end ? start : `${start} to ${end}`;
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
