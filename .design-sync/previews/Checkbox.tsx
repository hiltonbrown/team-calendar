import { Checkbox, Label } from "@repo/design-system";

export const States = () => (
  <div className="flex items-center gap-6">
    <Checkbox aria-label="Unchecked" />
    <Checkbox aria-label="Checked" defaultChecked />
    <Checkbox aria-label="Disabled" disabled />
    <Checkbox aria-label="Disabled checked" defaultChecked disabled />
    <Checkbox aria-invalid="true" aria-label="Invalid" />
  </div>
);

export const WithLabel = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Checkbox defaultChecked id="leave-annual" />
      <Label htmlFor="leave-annual">Annual leave</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox defaultChecked id="leave-personal" />
      <Label htmlFor="leave-personal">Personal leave</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="leave-wfh" />
      <Label htmlFor="leave-wfh">Working from home</Label>
    </div>
  </div>
);

export const WithDescription = () => (
  <div className="flex w-[380px] items-start gap-3">
    <Checkbox className="mt-0.5" defaultChecked id="include-holidays" />
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="include-holidays">Include public holidays</Label>
      <p className="text-muted-foreground text-sm">
        Add Victorian public holidays to this feed alongside approved leave.
      </p>
    </div>
  </div>
);
