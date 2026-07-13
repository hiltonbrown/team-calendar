import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { SlidersHorizontalIcon } from "lucide-react";

export const CalendarFilters = () => (
  <Sheet defaultOpen>
    <SheetTrigger asChild>
      <Button variant="secondary">
        <SlidersHorizontalIcon className="size-4" />
        Filters
      </Button>
    </SheetTrigger>
    <SheetContent className="gap-6 p-6">
      <SheetHeader className="p-0">
        <SheetTitle>Calendar filters</SheetTitle>
      </SheetHeader>
      <div className="grid gap-4">
        <div className="grid gap-2 text-sm">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Record category
          </span>
          <Select defaultValue="all">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All records</SelectItem>
              <SelectItem value="xero_leave">Leave</SelectItem>
              <SelectItem value="local_only">Availability</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 text-sm">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Approval status
          </span>
          <Select defaultValue="all">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Default statuses</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="submitted">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <SheetClose asChild>
          <Button variant="ghost">Clear filters</Button>
        </SheetClose>
      </div>
    </SheetContent>
  </Sheet>
);

export const LeaveRequestDetails = () => (
  <Sheet defaultOpen>
    <SheetTrigger asChild>
      <Button variant="outline">View request</Button>
    </SheetTrigger>
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>Annual leave &middot; Priya Nair</SheetTitle>
      </SheetHeader>
      <div className="grid gap-4 px-4 text-sm">
        <div>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Dates
          </p>
          <p className="mt-0.5 text-foreground">
            12 January 2026 to 16 January 2026 &middot; 5 working days
          </p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Status
          </p>
          <p className="mt-0.5 text-foreground">Pending approval</p>
        </div>
      </div>
    </SheetContent>
  </Sheet>
);
