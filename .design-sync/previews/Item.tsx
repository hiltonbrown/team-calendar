import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@repo/design-system";
import { CalendarCheck, ChevronRight, RefreshCw } from "lucide-react";

export const Variants = () => (
  <div className="flex w-[420px] flex-col gap-3">
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>Annual leave, 14 to 18 Oct</ItemTitle>
        <ItemDescription>38.0 hours, approved by Sam Taylor</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge variant="secondary">Approved</Badge>
      </ItemActions>
    </Item>
    <Item variant="muted">
      <ItemMedia variant="icon">
        <RefreshCw />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Xero sync completed</ItemTitle>
        <ItemDescription>42 people and 118 leave records updated</ItemDescription>
      </ItemContent>
    </Item>
  </div>
);

const people = [
  { initials: "PS", name: "Priya Shah", role: "Finance, Sydney" },
  { initials: "TN", name: "Tom Nguyen", role: "Engineering, Brisbane" },
  { initials: "GW", name: "Grace Walker", role: "Operations, Melbourne" },
];

export const PeopleList = () => (
  <ItemGroup className="w-[420px]">
    {people.map((p, i) => (
      <div key={p.name}>
        {i > 0 ? <ItemSeparator /> : null}
        <Item size="sm">
          <ItemMedia>
            <Avatar>
              <AvatarFallback>{p.initials}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{p.name}</ItemTitle>
            <ItemDescription>{p.role}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <ChevronRight className="text-muted-foreground size-4" />
          </ItemActions>
        </Item>
      </div>
    ))}
  </ItemGroup>
);

export const WithActions = () => (
  <Item className="w-[420px]" variant="outline">
    <ItemMedia variant="icon">
      <CalendarCheck />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>Tom Nguyen</ItemTitle>
      <ItemDescription>Personal leave, 21 Oct</ItemDescription>
    </ItemContent>
    <ItemActions>
      <Button size="sm" variant="outline">
        Decline
      </Button>
      <Button size="sm">Approve</Button>
    </ItemActions>
  </Item>
);
