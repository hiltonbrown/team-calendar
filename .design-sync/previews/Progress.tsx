import { Progress } from "@repo/design-system";

export const Values = () => (
  <div className="flex w-[380px] flex-col gap-4">
    <Progress aria-label="Not started" value={0} />
    <Progress aria-label="One third" value={33} />
    <Progress aria-label="Two thirds" value={66} />
    <Progress aria-label="Complete" value={100} />
  </div>
);

export const InitialImport = () => (
  <div className="flex w-[380px] flex-col gap-2">
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium">Importing from Xero</span>
      <span className="text-muted-foreground">84 of 120 people</span>
    </div>
    <Progress aria-label="Import progress" value={70} />
    <p className="text-muted-foreground text-xs">Leave records and balances follow next.</p>
  </div>
);

export const LeaveUsed = () => (
  <div className="flex w-[380px] flex-col gap-2">
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium">Annual leave used</span>
      <span className="text-muted-foreground">39.6 of 152.0 hours</span>
    </div>
    <Progress aria-label="Annual leave used" value={26} />
  </div>
);
