import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";

export const LeaveDurationDays = () => (
  <div className="flex w-72 flex-col gap-3">
    <Label htmlFor="leave-duration">Leave duration (days)</Label>
    <Slider
      defaultValue={[5]}
      id="leave-duration"
      max={20}
      min={1}
      step={1}
    />
  </div>
);

export const AdvanceNoticeThreshold = () => (
  <div className="flex w-72 flex-col gap-3">
    <Label htmlFor="advance-notice">Minimum advance notice (days)</Label>
    <Slider
      defaultValue={[65]}
      id="advance-notice"
      max={100}
      min={0}
      step={5}
    />
  </div>
);

export const DisabledState = () => (
  <div className="flex w-72 flex-col gap-3">
    <Label htmlFor="locked-threshold">Approval threshold (locked)</Label>
    <Slider defaultValue={[40]} disabled id="locked-threshold" />
  </div>
);
