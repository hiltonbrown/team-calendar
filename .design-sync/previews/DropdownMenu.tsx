import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  DownloadIcon,
  MoreHorizontalIcon,
  PrinterIcon,
} from "lucide-react";

export const LeaveRequestActions = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger asChild>
      <Button aria-label="More actions for Priya Nair" size="icon" variant="ghost">
        <MoreHorizontalIcon className="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      <DropdownMenuItem>View details</DropdownMenuItem>
      <DropdownMenuItem>Approve</DropdownMenuItem>
      <DropdownMenuItem variant="destructive">Decline</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Withdraw request</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const TeamCalendarFilters = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Filters</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Display</DropdownMenuLabel>
      <DropdownMenuCheckboxItem checked>Show weekends</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem>Show public holidays</DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>View</DropdownMenuLabel>
      <DropdownMenuRadioGroup value="month">
        <DropdownMenuRadioItem value="week">Week</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="month">Month</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="year">Year</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const ExportWithSubmenu = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Report options</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuItem>
        <PrinterIcon />
        Print roster
        <DropdownMenuShortcut>&#8984;P</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSub defaultOpen>
        <DropdownMenuSubTrigger>
          <DownloadIcon />
          Export leave report
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem>Export as CSV</DropdownMenuItem>
          <DropdownMenuItem>Export as PDF</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
);
