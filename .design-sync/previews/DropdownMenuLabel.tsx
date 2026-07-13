import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Button } from "@repo/design-system/components/ui/button";

export const Default = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">My account</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-48">
      <DropdownMenuLabel>Hilton Brown</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem>My leave requests</DropdownMenuItem>
      <DropdownMenuItem>Notification settings</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
