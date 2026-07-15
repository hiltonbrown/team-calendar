import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/design-system/components/ui/input-group";
import { MapPinIcon } from "lucide-react";

export const Default = () => (
  <InputGroup className="w-72">
    <InputGroupAddon>
      <MapPinIcon />
    </InputGroupAddon>
    <InputGroupInput placeholder="Client site address" />
  </InputGroup>
);
