import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";

export const Default = () => (
  <InputGroup className="w-72">
    <InputGroupInput placeholder="Search public holidays" />
    <InputGroupAddon align="inline-end">
      <InputGroupButton>Search</InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
);
