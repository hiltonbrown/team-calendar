import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@repo/design-system";
import { RefreshCw, Rss } from "lucide-react";

export const IconAction = () => (
  <div className="flex items-center" style={{ height: 160, paddingTop: 48 }}>
    <Tooltip open>
      <TooltipTrigger asChild>
        <Button aria-label="Sync now" size="icon" variant="outline">
          <RefreshCw />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Sync with Xero now</TooltipContent>
    </Tooltip>
  </div>
);

export const Sides = () => (
  <div className="flex items-center gap-3" style={{ height: 160, paddingLeft: 140 }}>
    <Tooltip open>
      <TooltipTrigger asChild>
        <Button aria-label="Copy feed URL" size="icon" variant="outline">
          <Rss />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Copy feed URL</TooltipContent>
    </Tooltip>
    <Tooltip open>
      <TooltipTrigger asChild>
        <Button variant="secondary">Last synced 9:40 am</Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Next scheduled sync at 10:40 am</TooltipContent>
    </Tooltip>
  </div>
);
