import { Label, Textarea } from "@repo/design-system";

export const Default = () => (
  <div className="flex w-[380px] flex-col gap-2">
    <Label htmlFor="feed-description">Description</Label>
    <Textarea
      id="feed-description"
      placeholder="Approved leave for the Sydney support team"
    />
  </div>
);

export const Filled = () => (
  <Textarea
    className="w-[380px]"
    defaultValue="Family wedding in Perth. I will have my laptop for urgent payroll questions on the Monday."
  />
);

export const States = () => (
  <div className="flex w-[380px] flex-col gap-3">
    <Textarea defaultValue="Imported from Xero Payroll" disabled />
    <Textarea aria-invalid="true" placeholder="A reason is required to decline" />
  </div>
);
