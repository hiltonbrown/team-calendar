import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system";
import { CalendarPlus, CalendarX, Link2, Users } from "lucide-react";

export const NoLeaveRequests = () => (
  <Empty className="w-[420px] border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <CalendarX />
      </EmptyMedia>
      <EmptyTitle>No leave requests yet</EmptyTitle>
      <EmptyDescription>
        Requests you submit appear here once they are sent for approval.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button>
        <CalendarPlus />
        Request leave
      </Button>
    </EmptyContent>
  </Empty>
);

export const ConnectXero = () => (
  <Empty className="w-[420px] border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Users />
      </EmptyMedia>
      <EmptyTitle>No people synced</EmptyTitle>
      <EmptyDescription>
        Connect Xero Payroll to import your employees and their leave.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <div className="flex gap-2">
        <Button>
          <Link2 />
          Connect Xero
        </Button>
        <Button variant="outline">Learn more</Button>
      </div>
    </EmptyContent>
  </Empty>
);

export const DescriptionOnly = () => (
  <Empty className="bg-surface-container w-[420px]">
    <EmptyHeader>
      <EmptyDescription>Nobody is away today.</EmptyDescription>
    </EmptyHeader>
  </Empty>
);
