import { Button } from "@repo/design-system";
import { CalendarPlus, Check, Plus, Trash2 } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Request leave</Button>
    <Button variant="secondary">Save draft</Button>
    <Button variant="outline">Export report</Button>
    <Button variant="ghost">View all</Button>
    <Button variant="destructive">Withdraw request</Button>
    <Button variant="link">Leave policy</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Small</Button>
    <Button>Default</Button>
    <Button size="lg">Large</Button>
    <Button aria-label="Add person" size="icon" variant="outline">
      <Plus />
    </Button>
  </div>
);

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>
      <CalendarPlus />
      New request
    </Button>
    <Button variant="secondary">
      <Check />
      Approve
    </Button>
    <Button variant="outline">
      <Trash2 />
      Delete entry
    </Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Submit request</Button>
    <Button disabled variant="outline">
      Export report
    </Button>
  </div>
);
