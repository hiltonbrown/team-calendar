import { CalendarDaysIcon } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
} from "@repo/design-system/components/ui/avatar";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@repo/design-system/components/ui/item";

export const LeaveRequestRow = () => (
  <Item className="w-[26rem]" variant="outline">
    <ItemMedia>
      <Avatar className="size-8">
        <AvatarFallback>PN</AvatarFallback>
      </Avatar>
    </ItemMedia>
    <ItemContent>
      <ItemTitle>Priya Nair &middot; Annual leave</ItemTitle>
      <ItemDescription>12 Jan 2026 &ndash; 16 Jan 2026 &middot; 5 days</ItemDescription>
    </ItemContent>
    <ItemActions>
      <Badge variant="secondary">Pending</Badge>
    </ItemActions>
  </Item>
);

export const LeaveRequestList = () => (
  <ItemGroup className="w-[26rem] rounded-lg border">
    <Item size="sm">
      <ItemMedia variant="icon">
        <CalendarDaysIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Sick leave &middot; James Whitmore</ItemTitle>
        <ItemDescription>3 Feb 2026 &middot; 1 day</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge>Approved</Badge>
      </ItemActions>
    </Item>
    <ItemSeparator />
    <Item size="sm">
      <ItemMedia variant="icon">
        <CalendarDaysIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Parental leave &middot; Sarah Kim</ItemTitle>
        <ItemDescription>16 Feb 2026 &ndash; 15 Aug 2026</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button size="sm" variant="outline">
          Review
        </Button>
      </ItemActions>
    </Item>
  </ItemGroup>
);
