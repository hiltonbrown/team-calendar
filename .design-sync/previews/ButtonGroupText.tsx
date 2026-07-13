import { Button } from "@repo/design-system/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@repo/design-system/components/ui/button-group";

export const Default = () => (
  <ButtonGroup>
    <ButtonGroupText>Leave type</ButtonGroupText>
    <Button variant="outline">Annual</Button>
    <Button variant="outline">Sick</Button>
  </ButtonGroup>
);
