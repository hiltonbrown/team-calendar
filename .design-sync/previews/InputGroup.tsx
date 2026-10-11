import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@repo/design-system";
import { Copy, Search } from "lucide-react";

export const WithSearchIcon = () => (
  <InputGroup className="w-[380px]">
    <InputGroupInput placeholder="Search people" />
    <InputGroupAddon>
      <Search />
    </InputGroupAddon>
  </InputGroup>
);

export const WithSuffix = () => (
  <div className="flex w-[380px] flex-col gap-3">
    <InputGroup>
      <InputGroupInput defaultValue="7.6" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>hours per day</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>@</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="acme.com.au" />
    </InputGroup>
  </div>
);

export const WithButton = () => (
  <InputGroup className="w-[380px]">
    <InputGroupInput
      defaultValue="https://cal.acme.com.au/ical/k7Qm2.ics"
      readOnly
    />
    <InputGroupAddon align="inline-end">
      <InputGroupButton aria-label="Copy feed URL" size="icon-xs">
        <Copy />
      </InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
);

export const WithTextarea = () => (
  <InputGroup className="w-[380px]">
    <InputGroupTextarea placeholder="Add a reason for declining this request" />
    <InputGroupAddon align="block-end">
      <InputGroupText>Shared with the employee</InputGroupText>
      <InputGroupButton className="ml-auto" size="sm" variant="default">
        Decline
      </InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
);
