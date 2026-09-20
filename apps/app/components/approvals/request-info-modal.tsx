"use client";

import { getAvailabilityRecordLabel } from "@repo/core";

import { Button } from "@repo/design-system/components/ui/button";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { requestMoreInfoAction } from "@/app/(authenticated)/leave-approvals/_actions";
import type { ApprovalModalRecord } from "@/components/approvals/approve-confirmation-modal";
import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";

interface RequestInfoModalProps {
  onClose: () => void;
  onSuccess: () => void;
  record: ApprovalModalRecord;
}

export function RequestInfoModal({
  onClose,
  onSuccess,
  record,
}: RequestInfoModalProps) {
  const [question, setQuestion] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmedQuestion = useMemo(() => question.trim(), [question]);
  const canSubmit =
    trimmedQuestion.length >= 3 && trimmedQuestion.length <= 1000;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setIsPending(true);
    setMessage(null);
    try {
      const result = await requestMoreInfoAction({
        organisationId: record.organisationId,
        question: trimmedQuestion,
        recordId: record.id,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      toast.success("Request sent");
      onSuccess();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <InterceptingModalShell
      closeDisabled={isPending}
      onClose={onClose}
      size="narrow"
      title="Request more information"
    >
      <div className="space-y-5">
        <p className="text-body-sm text-muted-foreground">
          {record.employeeName}, {getAvailabilityRecordLabel(record.recordType)}
          , {formatDateRange(record.startsAt, record.endsAt)}
        </p>
        <div className="space-y-2">
          <label className="font-medium text-label-lg" htmlFor="info-question">
            Question
          </label>
          <Textarea
            disabled={isPending}
            id="info-question"
            maxLength={1000}
            onChange={(event) => setQuestion(event.target.value)}
            value={question}
          />
          <p className="text-label-md text-muted-foreground">
            {trimmedQuestion.length}/1000 characters
          </p>
        </div>
        <p className="text-body-sm text-muted-foreground">
          The employee will receive a notification with your question. They can
          withdraw and edit their request if needed.
        </p>
        {message ? (
          <p className="text-body-sm text-destructive" role="alert">
            {message}
          </p>
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
          >
            {isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            Send request
          </Button>
        </div>
      </div>
    </InterceptingModalShell>
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
