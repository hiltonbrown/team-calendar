import { UserIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";

export const Default = () => (
  <InputGroup className="w-72">
    <InputGroupAddon>
      <UserIcon />
    </InputGroupAddon>
    <InputGroupInput placeholder="Assign to team member" />
  </InputGroup>
);
