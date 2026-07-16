import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { CalendarX2Icon, InboxIcon } from "lucide-react";

export const NoLeaveRequests = () => (
  <Empty className="w-96 border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <CalendarX2Icon />
      </EmptyMedia>
      <EmptyTitle>No leave requests yet</EmptyTitle>
      <EmptyDescription>
        Once your team submits leave requests, they will appear here for
        approval.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button size="sm">New leave request</Button>
    </EmptyContent>
  </Empty>
);

export const NoNotifications = () => (
  <Empty className="w-96 border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <InboxIcon />
      </EmptyMedia>
      <EmptyTitle>You&apos;re all caught up</EmptyTitle>
      <EmptyDescription>
        No new notifications. Approvals, declines and Xero sync updates will
        show up here.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);
