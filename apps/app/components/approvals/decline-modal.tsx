"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  declineAction,
  retryDeclineAction,
  revertApprovalAttemptAction,
} from "@/app/(authenticated)/leave-approvals/_actions";
import {
  type ApprovalModalRecord,
  SummaryBlock,
} from "@/components/approvals/approve-confirmation-modal";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { XeroSyncFailedState } from "@/components/states/xero-sync-failed-state";

interface DeclineModalProps {
  onClose: () => void;
  onSuccess: () => void;
  record: ApprovalModalRecord;
}

export function DeclineModal({
  onClose,
  onSuccess,
  record,
}: DeclineModalProps) {
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmedReason = useMemo(() => reason.trim(), [reason]);
  const canSubmit = trimmedReason.length >= 3 && trimmedReason.length <= 1000;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setIsPending(true);
    setMessage(null);
    try {
      const result = await declineAction({
        organisationId: record.organisationId,
        reason: trimmedReason,
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
      toast.success("Leave declined in Xero");
      onSuccess();
    } finally {
      setIsPending(false);
    }
  };

  const retry = async () => {
    setIsPending(true);
    setMessage(null);
    try {
      const result = await retryDeclineAction({
        organisationId: record.organisationId,
        recordId: record.id,
      });
      if (!result.ok) {
        if (result.error.code === "missing_preserved_reason") {
          setReason("");
        }
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
      toast.success("Leave declined in Xero");
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
      title="Decline this leave?"
    >
      <div className="space-y-5">
        <SummaryBlock record={record} />
        <div className="space-y-2">
          <label className="font-medium text-sm" htmlFor="decline-reason">
            Reason
          </label>
          <Textarea
            disabled={isPending}
            id="decline-reason"
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this is being declined so the employee can adjust their plans."
            value={reason}
          />
          <p className="text-muted-foreground text-xs">
            {trimmedReason.length}/1000 characters
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          The reason will be visible to the employee and sent to Xero Payroll.
        </p>
        {message ? (
          <XeroSyncFailedState
            failedAction="decline"
            message={message}
            retrySlot={
              <Button
                disabled={isPending}
                onClick={retry}
                size="sm"
                type="button"
              >
                Retry decline
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
            disabled={isPending || !canSubmit}
            onClick={submit}
            type="button"
            variant="destructive"
          >
            {isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            Confirm decline
          </Button>
        </div>
      </div>
    </InterceptingModalShell>
  );
}
