import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";

export const NotificationPreference = () => (
  <div className="flex items-center gap-2">
    <Switch defaultChecked id="notify-approved" />
    <Label htmlFor="notify-approved">Email me when my leave is approved</Label>
  </div>
);

export const StateSweep = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center gap-2">
      <Switch id="switch-off" />
      <Label htmlFor="switch-off">Notify my manager on submission</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch defaultChecked id="switch-on" />
      <Label htmlFor="switch-on">Show on shared team calendar</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch disabled id="switch-disabled-off" />
      <Label htmlFor="switch-disabled-off">
        Sync leave balances nightly (locked)
      </Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch defaultChecked disabled id="switch-disabled-on" />
      <Label htmlFor="switch-disabled-on">
        Xero write-back enabled (locked)
      </Label>
    </div>
  </div>
);
