import { Label, Slider } from "@repo/design-system";

export const Default = () => (
  <div className="flex w-[380px] flex-col gap-3">
    <div className="flex items-center justify-between">
      <Label>Hours per day</Label>
      <span className="text-muted-foreground text-sm">7.6 hours</span>
    </div>
    <Slider defaultValue={[76]} max={100} />
  </div>
);

export const Range = () => (
  <div className="flex w-[380px] flex-col gap-3">
    <div className="flex items-center justify-between">
      <Label>Working hours</Label>
      <span className="text-muted-foreground text-sm">9 am to 5 pm</span>
    </div>
    <Slider defaultValue={[9, 17]} max={24} min={0} />
  </div>
);

export const Disabled = () => (
  <div className="flex w-[380px] flex-col gap-3">
    <Label>Sync interval (managed by Xero)</Label>
    <Slider defaultValue={[30]} disabled />
  </div>
);
