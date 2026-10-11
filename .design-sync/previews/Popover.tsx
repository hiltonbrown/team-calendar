import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system";
import { CalendarDays, Clock, MapPin } from "lucide-react";

export const CalendarEvent = () => (
  <div style={{ height: 420 }}>
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="secondary">Priya Shah, annual leave</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-title-md font-semibold">Annual leave</span>
            <Badge variant="secondary">Approved</Badge>
          </div>
          <div className="text-muted-foreground flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4" />
              Mon 14 Oct to Fri 18 Oct
            </span>
            <span className="flex items-center gap-2">
              <Clock className="size-4" />
              38 hours, synced from Xero
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4" />
              Sydney CBD
            </span>
          </div>
          <Button size="sm" variant="outline">
            Open request
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);

export const QuickNote = () => (
  <div style={{ height: 300 }}>
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="outline">Feed privacy</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Masked details</span>
          <span className="text-muted-foreground">
            Subscribers see "Away" instead of the leave type. The feed URL itself
            is unchanged.
          </span>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);
