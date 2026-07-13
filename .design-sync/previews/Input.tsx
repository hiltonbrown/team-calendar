import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";

export const Default = () => (
  <div className="flex w-72 flex-col gap-2">
    <Label htmlFor="input-default">Leave reason</Label>
    <Input id="input-default" placeholder="e.g. Family holiday" />
  </div>
);

export const Types = () => (
  <div className="flex w-72 flex-col gap-4">
    <div className="flex flex-col gap-2">
      <Label htmlFor="input-date">Start date</Label>
      <Input id="input-date" type="date" defaultValue="2026-08-03" />
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="input-email">Manager email</Label>
      <Input
        id="input-email"
        type="email"
        defaultValue="priya.nair@acmehotels.com"
      />
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="input-number">Days requested</Label>
      <Input id="input-number" type="number" defaultValue={5} min={0} />
    </div>
  </div>
);

export const Invalid = () => (
  <div className="flex w-72 flex-col gap-2">
    <Label htmlFor="input-invalid">Start date</Label>
    <Input
      id="input-invalid"
      aria-invalid
      defaultValue="not a date"
    />
    <p className="text-destructive text-sm">Enter a valid date.</p>
  </div>
);

export const Disabled = () => (
  <div className="flex w-72 flex-col gap-2">
    <Label htmlFor="input-disabled">Employee ID</Label>
    <Input id="input-disabled" disabled defaultValue="EMP-04821" />
  </div>
);
