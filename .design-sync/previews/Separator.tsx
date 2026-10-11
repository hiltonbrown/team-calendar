import { Separator } from "@repo/design-system";
import { PanelLeft } from "lucide-react";

export const Horizontal = () => (
  <div style={{ width: 360 }}>
    <div className="flex flex-col gap-1">
      <h4 className="font-medium text-sm">Priya Shah</h4>
      <p className="text-muted-foreground text-sm">
        Senior designer, Sydney office
      </p>
    </div>
    <Separator style={{ marginTop: 16, marginBottom: 16 }} />
    <div className="flex h-5 items-center gap-4 text-sm">
      <span>Profile</span>
      <Separator orientation="vertical" />
      <span>Leave</span>
      <Separator orientation="vertical" />
      <span>Availability</span>
    </div>
  </div>
);

export const InHeader = () => (
  <div className="flex h-14 w-[420px] items-center gap-3 border-border border-b bg-background px-4">
    <PanelLeft className="size-4 text-muted-foreground" />
    <Separator className="h-4" orientation="vertical" />
    <h1 className="font-semibold text-title-md">Team calendar</h1>
  </div>
);
