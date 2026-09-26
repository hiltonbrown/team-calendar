import type {
  XeroConnectionDisplayState,
  XeroRecoveryReason,
} from "@repo/core";
import { xeroRecoveryMessage } from "@repo/core";
import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";

interface XeroRecoveryNoticeProps {
  now?: Date;
  reason: XeroRecoveryReason | XeroConnectionDisplayState;
  retryAfterMs?: number;
}
export function XeroRecoveryNotice({
  reason,
  retryAfterMs,
  now,
}: XeroRecoveryNoticeProps) {
  return (
    <Alert
      className="rounded-[20px] border-0 bg-surface-container"
      role="status"
    >
      <AlertDescription>
        {xeroRecoveryMessage(reason, { now, retryAfterMs })}
      </AlertDescription>
    </Alert>
  );
}
