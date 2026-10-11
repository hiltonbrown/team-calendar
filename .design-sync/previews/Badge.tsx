import { Badge } from "@repo/design-system";
import { Check, Clock, RefreshCw, X } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Premium</Badge>
    <Badge variant="secondary">Sync paused</Badge>
    <Badge variant="destructive">Sync failed</Badge>
    <Badge variant="outline">Archived</Badge>
  </div>
);

export const LeaveStatus = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">
      <Check />
      Approved
    </Badge>
    <Badge variant="outline">
      <Clock />
      Submitted
    </Badge>
    <Badge variant="destructive">
      <X />
      Declined
    </Badge>
    <Badge className="text-muted-foreground" variant="outline">
      Withdrawn
    </Badge>
  </div>
);

export const StatusTones = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge className="bg-secondary text-secondary-foreground ring-secondary-foreground/30 border-0 ring-1">
      <Check />
      Approved
    </Badge>
    <Badge className="bg-surface-container-high text-on-surface-variant ring-on-surface-variant/30 border-0 ring-1">
      <Clock />
      Submitted
    </Badge>
    <Badge className="bg-error-container text-destructive ring-destructive/30 border-0 ring-1">
      <X />
      Declined
    </Badge>
    <Badge className="bg-accent-container text-on-accent-container ring-on-accent-container/30 border-0 ring-1">
      <RefreshCw />
      From Xero
    </Badge>
  </div>
);
