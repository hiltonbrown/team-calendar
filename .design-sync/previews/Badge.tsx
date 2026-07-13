import { Badge } from "@repo/design-system/components/ui/badge";

export const Default = () => <Badge>Approved</Badge>;

export const Secondary = () => <Badge variant="secondary">Pending</Badge>;

export const Destructive = () => <Badge variant="destructive">Declined</Badge>;

export const Outline = () => <Badge variant="outline">Connected</Badge>;

export const StatusRow = () => (
  <div className="flex items-center gap-2">
    <Badge>Approved</Badge>
    <Badge variant="secondary">Awaiting approval</Badge>
    <Badge variant="destructive">Declined</Badge>
    <Badge variant="outline">Withdrawn</Badge>
  </div>
);
