import { Badge } from "@repo/design-system/components/ui/badge";
import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { statusToneClasses } from "@/components/availability/availability-status";

interface XeroSyncFailedStateProps {
  readonly message: string;
  readonly retrySlot?: ReactNode;
  readonly revertSlot?: ReactNode;
}

export const XeroSyncFailedState = ({
  message,
  retrySlot,
  revertSlot,
}: XeroSyncFailedStateProps) => (
  <div
    className={`flex flex-col gap-3 rounded-2xl p-4 ${statusToneClasses.failed}`}
  >
    <div className="flex items-center gap-2">
      <Badge
        className="gap-1 border-transparent bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90"
        variant="destructive"
      >
        <AlertTriangleIcon className="size-3" />
        Xero sync failed
      </Badge>
    </div>
    <p className="text-muted-foreground text-sm">{message}</p>
    {(retrySlot || revertSlot) && (
      <div className="mt-1 flex items-center gap-2">
        {retrySlot}
        {revertSlot}
      </div>
    )}
  </div>
);
