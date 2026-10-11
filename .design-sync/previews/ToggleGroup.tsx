import { ToggleGroup, ToggleGroupItem } from "@repo/design-system";
import { CalendarDays, CalendarRange, List } from "lucide-react";

export const PlanIntent = () => (
  <ToggleGroup
    aria-label="Plan type"
    className="grid w-[420px] grid-cols-2"
    defaultValue="leave"
    type="single"
    variant="outline"
  >
    <ToggleGroupItem value="leave">Request leave</ToggleGroupItem>
    <ToggleGroupItem value="availability">Log availability</ToggleGroupItem>
  </ToggleGroup>
);

export const CalendarView = () => (
  <ToggleGroup aria-label="Calendar view" defaultValue="month" type="single">
    <ToggleGroupItem aria-label="Week" value="week">
      <CalendarRange />
      Week
    </ToggleGroupItem>
    <ToggleGroupItem aria-label="Month" value="month">
      <CalendarDays />
      Month
    </ToggleGroupItem>
    <ToggleGroupItem aria-label="List" value="list">
      <List />
      List
    </ToggleGroupItem>
  </ToggleGroup>
);

export const Multiple = () => (
  <ToggleGroup
    aria-label="Record types"
    defaultValue={["leave", "wfh"]}
    type="multiple"
    variant="outline"
  >
    <ToggleGroupItem value="leave">Leave</ToggleGroupItem>
    <ToggleGroupItem value="wfh">WFH</ToggleGroupItem>
    <ToggleGroupItem value="travel">Travelling</ToggleGroupItem>
    <ToggleGroupItem value="training">Training</ToggleGroupItem>
  </ToggleGroup>
);

export const Sizes = () => (
  <div className="flex flex-col items-start gap-3">
    {(["sm", "default", "lg"] as const).map((size) => (
      <ToggleGroup defaultValue="au" key={size} size={size} type="single" variant="outline">
        <ToggleGroupItem value="au">Australia</ToggleGroupItem>
        <ToggleGroupItem disabled value="nz">
          New Zealand
        </ToggleGroupItem>
        <ToggleGroupItem disabled value="uk">
          United Kingdom
        </ToggleGroupItem>
      </ToggleGroup>
    ))}
  </div>
);
