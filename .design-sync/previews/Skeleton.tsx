import { Skeleton } from "@repo/design-system/components/ui/skeleton";

export const Default = () => (
  <div className="flex items-center gap-3 w-80">
    <Skeleton className="size-9 rounded-full" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
);

export const LeaveRequestRows = () => (
  <div className="w-96 space-y-3">
    <Skeleton className="h-10 w-full rounded-md" />
    <Skeleton className="h-10 w-full rounded-md" />
    <Skeleton className="h-10 w-2/3 rounded-md" />
  </div>
);
