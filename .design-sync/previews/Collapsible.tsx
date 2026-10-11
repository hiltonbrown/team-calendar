import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/design-system";
import { ChevronsUpDown } from "lucide-react";

export const Open = () => (
  <Collapsible className="flex flex-col gap-2" style={{ width: 360 }} defaultOpen>
    <div className="flex items-center justify-between gap-4">
      <span className="font-semibold text-sm">Away this week, 4 people</span>
      <CollapsibleTrigger asChild>
        <Button aria-label="Toggle list" size="icon" variant="ghost">
          <ChevronsUpDown />
        </Button>
      </CollapsibleTrigger>
    </div>
    <div className="rounded-md bg-surface-container px-4 py-2 text-sm">
      Priya Shah, Annual leave
    </div>
    <CollapsibleContent className="flex flex-col gap-2">
      <div className="rounded-md bg-surface-container px-4 py-2 text-sm">
        Tom Nguyen, Personal leave
      </div>
      <div className="rounded-md bg-surface-container px-4 py-2 text-sm">
        Grace Walker, Long service leave
      </div>
      <div className="rounded-md bg-surface-container px-4 py-2 text-sm">
        Liam O'Brien, Training
      </div>
    </CollapsibleContent>
  </Collapsible>
);

export const Closed = () => (
  <Collapsible className="flex flex-col gap-2" style={{ width: 360 }}>
    <div className="flex items-center justify-between gap-4">
      <span className="font-semibold text-sm">Away this week, 4 people</span>
      <CollapsibleTrigger asChild>
        <Button aria-label="Toggle list" size="icon" variant="ghost">
          <ChevronsUpDown />
        </Button>
      </CollapsibleTrigger>
    </div>
    <div className="rounded-md bg-surface-container px-4 py-2 text-sm">
      Priya Shah, Annual leave
    </div>
    <CollapsibleContent>
      <div className="rounded-md bg-surface-container px-4 py-2 text-sm">
        Tom Nguyen, Personal leave
      </div>
    </CollapsibleContent>
  </Collapsible>
);
