import { Separator } from "@repo/design-system/components/ui/separator";

export const Horizontal = () => (
  <div className="w-80">
    <div className="space-y-1">
      <h4 className="font-medium text-sm">Priya Nair</h4>
      <p className="text-muted-foreground text-sm">Front of house &middot; Sydney</p>
    </div>
    <Separator className="my-4" />
    <div className="space-y-1">
      <h4 className="font-medium text-sm">Leave balance</h4>
      <p className="text-muted-foreground text-sm">14.5 days annual leave remaining</p>
    </div>
  </div>
);

export const Vertical = () => (
  <div className="flex h-8 items-center gap-3 text-sm">
    <span>Dashboard</span>
    <Separator orientation="vertical" />
    <span>Leave approvals</span>
    <Separator orientation="vertical" />
    <span>Team calendar</span>
  </div>
);
