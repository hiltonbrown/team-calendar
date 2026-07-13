import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";

export const Default = () => (
  <div className="flex flex-col gap-2">
    <Label htmlFor="label-name">Full name</Label>
    <Input id="label-name" defaultValue="Priya Nair" />
  </div>
);

export const WithCheckbox = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="label-recurring" defaultChecked />
    <Label htmlFor="label-recurring">Recurs annually</Label>
  </div>
);

export const Disabled = () => (
  <div className="group flex items-center gap-2" data-disabled="true">
    <Checkbox id="label-disabled" disabled />
    <Label htmlFor="label-disabled">Approve on behalf of manager</Label>
  </div>
);
