import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Label } from "@repo/design-system/components/ui/label";

export const States = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center gap-2">
      <Checkbox id="cb-unchecked" />
      <Label htmlFor="cb-unchecked">Notify my manager</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox defaultChecked id="cb-checked" />
      <Label htmlFor="cb-checked">Add to shared team calendar</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox disabled id="cb-disabled" />
      <Label htmlFor="cb-disabled">Recurring leave (unavailable)</Label>
    </div>
  </div>
);
