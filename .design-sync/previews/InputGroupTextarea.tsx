import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@repo/design-system/components/ui/input-group";

export const Default = () => (
  <InputGroup className="w-80">
    <InputGroupTextarea placeholder="Describe the WFH arrangement" />
    <InputGroupAddon align="block-end">
      <InputGroupText>Shared with your team lead</InputGroupText>
    </InputGroupAddon>
  </InputGroup>
);
