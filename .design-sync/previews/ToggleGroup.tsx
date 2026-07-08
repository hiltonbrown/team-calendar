import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";

export const PlanIntent = () => (
  <ToggleGroup
    aria-label="Plan intent"
    defaultValue="leave"
    type="single"
    variant="outline"
  >
    <ToggleGroupItem
      className="h-auto items-start justify-start gap-1 rounded-xl px-4 py-3 text-left"
      value="leave"
    >
      <span className="flex flex-col items-start gap-1">
        <span>Leave</span>
        <span className="font-normal text-muted-foreground text-xs">
          Payroll leave sent to Xero
        </span>
      </span>
    </ToggleGroupItem>
    <ToggleGroupItem
      className="h-auto items-start justify-start gap-1 rounded-xl px-4 py-3 text-left"
      value="availability"
    >
      <span className="flex flex-col items-start gap-1">
        <span>Availability</span>
        <span className="font-normal text-muted-foreground text-xs">
          Calendar-only work status
        </span>
      </span>
    </ToggleGroupItem>
  </ToggleGroup>
);

export const WeekdaySelectionMultiple = () => (
  <ToggleGroup
    aria-label="Working days"
    defaultValue={["mon", "tue", "wed", "thu", "fri"]}
    type="multiple"
    variant="outline"
  >
    <ToggleGroupItem value="mon">Mon</ToggleGroupItem>
    <ToggleGroupItem value="tue">Tue</ToggleGroupItem>
    <ToggleGroupItem value="wed">Wed</ToggleGroupItem>
    <ToggleGroupItem value="thu">Thu</ToggleGroupItem>
    <ToggleGroupItem value="fri">Fri</ToggleGroupItem>
    <ToggleGroupItem value="sat">Sat</ToggleGroupItem>
    <ToggleGroupItem value="sun">Sun</ToggleGroupItem>
  </ToggleGroup>
);

export const DisabledState = () => (
  <ToggleGroup
    aria-label="Plan intent (locked)"
    defaultValue="leave"
    disabled
    type="single"
    variant="outline"
  >
    <ToggleGroupItem value="leave">Leave</ToggleGroupItem>
    <ToggleGroupItem value="availability">Availability</ToggleGroupItem>
  </ToggleGroup>
);
