import { Button, ButtonGroup, ButtonGroupSeparator, ButtonGroupText, Input } from "@repo/design-system";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const DateNavigation = () => (
  <ButtonGroup>
    <Button aria-label="Previous month" size="icon" variant="outline">
      <ChevronLeft />
    </Button>
    <Button variant="outline">Today</Button>
    <Button aria-label="Next month" size="icon" variant="outline">
      <ChevronRight />
    </Button>
  </ButtonGroup>
);

export const ApprovalActions = () => (
  <ButtonGroup>
    <Button>Approve</Button>
    <ButtonGroupSeparator />
    <Button>Approve and next</Button>
  </ButtonGroup>
);

export const WithText = () => (
  <ButtonGroup>
    <ButtonGroupText>Hours per day</ButtonGroupText>
    <Input aria-label="Hours per day" className="w-24" defaultValue="7.6" />
  </ButtonGroup>
);

export const Vertical = () => (
  <ButtonGroup orientation="vertical">
    <Button variant="outline">Week</Button>
    <Button variant="outline">Month</Button>
    <Button variant="outline">Quarter</Button>
  </ButtonGroup>
);
