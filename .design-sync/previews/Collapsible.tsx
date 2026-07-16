import { Button } from "@repo/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/design-system/components/ui/collapsible";
import { ChevronsUpDownIcon } from "lucide-react";

export const XeroSyncDetails = () => (
  <Collapsible className="max-w-sm rounded-xl border p-4" defaultOpen>
    <div className="flex items-center justify-between">
      <p className="font-medium text-sm">Xero sync details</p>
      <CollapsibleTrigger asChild>
        <Button size="icon" variant="ghost">
          <ChevronsUpDownIcon className="size-4" />
          <span className="sr-only">Toggle sync details</span>
        </Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent className="flex flex-col gap-2 pt-3 text-muted-foreground text-sm">
      <p>Last synced: 7 July 2026, 9:14am</p>
      <p>Tenant: Acme Restaurants (AU)</p>
      <p>Records processed: 214</p>
    </CollapsibleContent>
  </Collapsible>
);

export const ClosedByDefault = () => (
  <Collapsible className="max-w-sm rounded-xl border p-4">
    <div className="flex items-center justify-between">
      <p className="font-medium text-sm">Decline reason</p>
      <CollapsibleTrigger asChild>
        <Button size="icon" variant="ghost">
          <ChevronsUpDownIcon className="size-4" />
          <span className="sr-only">Toggle decline reason</span>
        </Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent className="pt-3 text-muted-foreground text-sm">
      Declined by Sarah Chen: "Team is already short-staffed that week, please
      resubmit for the following week."
    </CollapsibleContent>
  </Collapsible>
);
