import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@repo/design-system/components/ui/hover-card";

export const ColleagueAvailability = () => (
  <HoverCard defaultOpen openDelay={0}>
    <HoverCardTrigger className="font-medium text-foreground underline underline-offset-4">
      Marcus Lee
    </HoverCardTrigger>
    <HoverCardContent className="w-64">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-foreground">Marcus Lee</p>
        <p className="text-muted-foreground text-sm">
          Front of house &middot; Sydney
        </p>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Today
          </dt>
          <dd className="mt-0.5 text-foreground">
            On annual leave until 16 Jan
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Leave balance
          </dt>
          <dd className="mt-0.5 text-foreground">9 days remaining</dd>
        </div>
      </dl>
    </HoverCardContent>
  </HoverCard>
);

export const PublicHolidayPreview = () => (
  <HoverCard defaultOpen openDelay={0}>
    <HoverCardTrigger className="font-medium text-foreground underline underline-offset-4">
      Australia Day
    </HoverCardTrigger>
    <HoverCardContent className="w-64">
      <p className="font-semibold text-foreground">Australia Day</p>
      <p className="mt-1 text-muted-foreground text-sm">
        26 January 2026 &middot; Public holiday
      </p>
      <p className="mt-3 text-foreground text-sm">
        Automatically applied to all Sydney-based staff. No leave balance is
        used.
      </p>
    </HoverCardContent>
  </HoverCard>
);
