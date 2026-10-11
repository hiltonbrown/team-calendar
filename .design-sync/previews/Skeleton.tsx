import { Card, Skeleton } from "@repo/design-system";

export const PersonRow = () => (
  <div className="flex w-[380px] items-center gap-3">
    <Skeleton className="size-10 rounded-full" />
    <div className="flex flex-1 flex-col gap-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);

export const CardLoading = () => (
  <Card className="w-[380px] gap-4 p-6">
    <Skeleton className="h-5 w-36" />
    <Skeleton className="h-3 w-52" />
    <Skeleton className="h-24 w-full rounded-xl" />
    <div className="flex gap-2">
      <Skeleton className="h-9 w-24" />
      <Skeleton className="h-9 w-20" />
    </div>
  </Card>
);

export const TableRows = () => (
  <div className="flex w-[420px] flex-col gap-3">
    {[0, 1, 2].map((row) => (
      <div className="flex items-center gap-4" key={row}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    ))}
  </div>
);
