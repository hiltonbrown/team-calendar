import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@repo/design-system";
import { Info, MoreHorizontal, RefreshCw, Undo2, XCircle } from "lucide-react";

export const RowActions = () => (
  <div className="flex justify-end" style={{ height: 320, width: 360 }}>
    <DropdownMenu modal={false} open>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary">
          <MoreHorizontal />
          More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Request actions</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Info />
            Request more information
          </DropdownMenuItem>
          <DropdownMenuItem>
            <RefreshCw />
            Retry approval
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Undo2 />
            Revert to pending
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <XCircle />
          Decline
          <DropdownMenuShortcut>D</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export const ColumnToggles = () => (
  <div style={{ height: 260 }}>
    <DropdownMenu modal={false} open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Columns</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Leave type</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Balance</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Location</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Submitted</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
