import { Checkbox, Input, Label } from "@repo/design-system";

export const WithInput = () => (
  <div className="flex w-[380px] flex-col gap-2">
    <Label htmlFor="first-name">First name</Label>
    <Input defaultValue="Grace" id="first-name" />
  </div>
);

export const WithCheckbox = () => (
  <div className="flex items-center gap-2">
    <Checkbox defaultChecked id="notify-manager" />
    <Label htmlFor="notify-manager">Notify my manager</Label>
  </div>
);

export const Disabled = () => (
  <div className="flex items-center gap-2">
    <Checkbox disabled id="xero-owned" />
    <Label htmlFor="xero-owned">Edit Xero-owned fields</Label>
  </div>
);
