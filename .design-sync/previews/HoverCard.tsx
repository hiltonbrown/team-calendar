import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@repo/design-system";

export const PersonQuickView = () => (
  <div style={{ height: 320 }}>
    <HoverCard open>
      <HoverCardTrigger asChild>
        <Button variant="link">Grace Walker</Button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <div className="flex gap-3">
          <Avatar className="size-10">
            <AvatarFallback>GW</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Grace Walker</span>
            <span className="text-muted-foreground text-sm">
              Venue manager, Front of house
            </span>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="secondary">Long service</Badge>
              <span className="text-muted-foreground text-xs">
                Back Mon 4 Nov
              </span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  </div>
);

export const Available = () => (
  <div style={{ height: 260 }}>
    <HoverCard open>
      <HoverCardTrigger asChild>
        <Button variant="link">Tom Nguyen</Button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarFallback>TN</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Tom Nguyen</span>
            <span className="text-muted-foreground text-sm">
              Working from home today
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  </div>
);
