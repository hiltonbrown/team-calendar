import { Button } from "@repo/design-system/components/ui/button";
import { CalendarPlus, Trash2 } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="default">Submit leave request</Button>
    <Button variant="secondary">Save as draft</Button>
    <Button variant="outline">Cancel</Button>
    <Button variant="destructive">Withdraw request</Button>
    <Button variant="ghost">Skip</Button>
    <Button variant="link">View leave policy</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
    <Button aria-label="Add leave" size="icon">
      <CalendarPlus />
    </Button>
  </div>
);

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>
      <CalendarPlus />
      New leave request
    </Button>
    <Button variant="destructive">
      <Trash2 />
      Delete
    </Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Approve</Button>
    <Button disabled variant="outline">
      Decline
    </Button>
  </div>
);
