import { Button } from "@repo/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

export const RetrySyncAction = () => (
  <Tooltip defaultOpen>
    <TooltipTrigger asChild>
      <Button size="icon" variant="outline">
        <RefreshCwIcon className="size-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Retry sending this leave request to Xero</TooltipContent>
  </Tooltip>
);

export const XeroSyncFailedIcon = () => (
  <Tooltip defaultOpen>
    <TooltipTrigger asChild>
      <AlertTriangleIcon className="size-4 text-destructive" />
    </TooltipTrigger>
    <TooltipContent>
      Xero rejected this request. Retry or revert to draft.
    </TooltipContent>
  </Tooltip>
);
