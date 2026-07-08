import { Progress } from "@repo/design-system/components/ui/progress";

export const AnnualLeaveUsed = () => (
  <div className="flex w-72 flex-col gap-2">
    <div className="flex items-center justify-between text-sm">
      <span>Annual leave used</span>
      <span className="text-muted-foreground">13 of 20 days</span>
    </div>
    <Progress value={65} />
  </div>
);

export const ProgressSweep = () => (
  <div className="flex w-72 flex-col gap-4">
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Sync just started</p>
      <Progress value={10} />
    </div>
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Sync halfway</p>
      <Progress value={50} />
    </div>
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Sync nearly complete</p>
      <Progress value={90} />
    </div>
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Sync complete</p>
      <Progress value={100} />
    </div>
  </div>
);
