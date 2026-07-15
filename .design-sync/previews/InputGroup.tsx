import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@repo/design-system/components/ui/input-group";
import { CalendarIcon, SearchIcon } from "lucide-react";

export const Default = () => (
  <InputGroup className="w-80">
    <InputGroupAddon>
      <SearchIcon />
    </InputGroupAddon>
    <InputGroupInput placeholder="Search team members" />
  </InputGroup>
);

export const WithTrailingButton = () => (
  <InputGroup className="w-80">
    <InputGroupAddon>
      <CalendarIcon />
    </InputGroupAddon>
    <InputGroupInput placeholder="Select a date range" readOnly />
    <InputGroupAddon align="inline-end">
      <InputGroupButton>Clear</InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
);

export const WithText = () => (
  <InputGroup className="w-80">
    <InputGroupInput defaultValue="5" placeholder="5" />
    <InputGroupAddon align="inline-end">
      <InputGroupText>days requested</InputGroupText>
    </InputGroupAddon>
  </InputGroup>
);

export const Textarea = () => (
  <InputGroup className="w-80">
    <InputGroupTextarea placeholder="Reason for the leave request" />
    <InputGroupAddon align="block-end">
      <InputGroupText>Visible to your manager only</InputGroupText>
    </InputGroupAddon>
  </InputGroup>
);
