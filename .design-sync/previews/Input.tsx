import { Input, Label } from "@repo/design-system";

export const Default = () => (
  <div className="flex w-[380px] flex-col gap-2">
    <Label htmlFor="feed-name">Feed name</Label>
    <Input id="feed-name" placeholder="Melbourne office leave" />
  </div>
);

export const Types = () => (
  <div className="flex w-[380px] flex-col gap-3">
    <Input defaultValue="Priya Shah" />
    <Input placeholder="priya.shah@acme.com.au" type="email" />
    <Input defaultValue="2026-10-14" type="date" />
  </div>
);

export const States = () => (
  <div className="flex w-[380px] flex-col gap-3">
    <Input defaultValue="Annual leave, 14 to 18 Oct" />
    <Input defaultValue="Synced from Xero" disabled />
    <Input aria-invalid="true" defaultValue="priya.shah@" type="email" />
  </div>
);
