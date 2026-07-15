import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { CalendarIcon } from "lucide-react";

export const LeaveDetails = () => (
  <Popover defaultOpen>
    <PopoverTrigger asChild>
      <Button variant="outline">
        <CalendarIcon className="size-4" />
        12&ndash;16 Jan
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">Priya Nair</p>
          <p className="text-muted-foreground text-sm">Annual leave</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Status
          </dt>
          <dd className="mt-0.5 text-foreground">Pending</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            When
          </dt>
          <dd className="mt-0.5 text-foreground">
            12 January 2026 to 16 January 2026
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="secondary">
          View plan
        </Button>
      </div>
    </PopoverContent>
  </Popover>
);

export const DateRangePicker = () => (
  <Popover defaultOpen>
    <PopoverTrigger asChild>
      <Button variant="outline">
        <CalendarIcon className="size-4" />
        Choose dates
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-3">
      <div className="grid gap-2 text-sm">
        <p className="font-medium text-foreground">Select leave dates</p>
        <p className="text-muted-foreground text-xs">
          Working days are calculated automatically from your roster.
        </p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs">Start</p>
            <p className="font-medium">12 Jan 2026</p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs">End</p>
            <p className="font-medium">16 Jan 2026</p>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
);
