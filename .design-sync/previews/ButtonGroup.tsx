import { Calendar, List, Rows3 } from "lucide-react";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@repo/design-system/components/ui/button-group";

export const Default = () => (
  <ButtonGroup>
    <Button variant="outline">
      <List />
      List
    </Button>
    <Button variant="outline">
      <Rows3 />
      Team
    </Button>
    <Button variant="outline">
      <Calendar />
      Calendar
    </Button>
  </ButtonGroup>
);

export const WithLabel = () => (
  <ButtonGroup>
    <ButtonGroupText>Leave type</ButtonGroupText>
    <Button variant="outline">Annual</Button>
    <Button variant="outline">Sick</Button>
    <Button variant="outline">Parental</Button>
  </ButtonGroup>
);

export const WithSeparator = () => (
  <ButtonGroup>
    <Button variant="outline">Approve</Button>
    <ButtonGroupSeparator />
    <Button variant="outline">Decline</Button>
  </ButtonGroup>
);

export const Vertical = () => (
  <ButtonGroup orientation="vertical" className="w-40">
    <Button variant="outline">This week</Button>
    <Button variant="outline">This month</Button>
    <Button variant="outline">This year</Button>
  </ButtonGroup>
);
