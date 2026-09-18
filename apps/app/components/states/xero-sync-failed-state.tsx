import { Badge } from "@repo/design-system/components/ui/badge";
import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { statusToneClasses } from "@/components/availability/availability-status";

export type XeroFailedAction =
  | "approve"
  | "decline"
  | "submit"
  | "withdraw"
  | "sync";

const actionLabel: Record<XeroFailedAction, string> = {
  approve: "Approval",
  decline: "Decline",
  submit: "Submission",
  sync: "Sync",
  withdraw: "Withdrawal",
};

interface XeroSyncFailedStateProps {
  readonly failedAction?: XeroFailedAction | null;
  readonly message: string;
  readonly retrySlot?: ReactNode;
  readonly revertSlot?: ReactNode;
}

export const XeroSyncFailedState = ({
  failedAction,
  message,
  retrySlot,
  revertSlot,
}: XeroSyncFailedStateProps) => {
  const badgeText = failedAction
    ? `${actionLabel[failedAction]} failed`
    : "Xero sync failed";
  const displayMessage = failedAction
    ? `${actionLabel[failedAction]} failed in Xero: ${message}`
    : message;
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl p-4 ${statusToneClasses.failed}`}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <Badge
          className="gap-1 border-transparent bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90"
          variant="destructive"
        >
          <AlertTriangleIcon className="size-3" />
          {badgeText}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">{displayMessage}</p>
      {retrySlot || revertSlot ? (
        <div className="mt-1 flex items-center gap-2">
          {retrySlot}
          {revertSlot}
        </div>
      ) : null}
    </div>
  );
};
