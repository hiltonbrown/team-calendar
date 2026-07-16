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
      <Input defaultValue="2026-08-03" id="input-date" type="date" />
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="input-email">Manager email</Label>
      <Input
        defaultValue="priya.nair@acmehotels.com"
        id="input-email"
        type="email"
      />
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="input-number">Days requested</Label>
      <Input defaultValue={5} id="input-number" min={0} type="number" />
    </div>
  </div>
);

export const Invalid = () => (
  <div className="flex w-72 flex-col gap-2">
    <Label htmlFor="input-invalid">Start date</Label>
    <Input aria-invalid defaultValue="not a date" id="input-invalid" />
    <p className="text-destructive text-sm">Enter a valid date.</p>
  </div>
);

export const Disabled = () => (
  <div className="flex w-72 flex-col gap-2">
    <Label htmlFor="input-disabled">Employee ID</Label>
    <Input defaultValue="EMP-04821" disabled id="input-disabled" />
  </div>
);
