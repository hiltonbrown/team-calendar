import { DashboardGrid } from "./dashboard-grid";

const TIMELINE_ROW_COUNT = 6;

function Block({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-muted motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Streaming fallback for the dashboard body. Mirrors the header band, the
 * team timeline and the 2:1 lead and rail grid so content streams in without
 * the page jumping.
 */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <span className="sr-only">Loading dashboard</span>
      <div className="-mx-4 space-y-2 bg-surface-container-low px-4 py-6 sm:-mx-6 sm:px-6">
        <Block className="h-4 w-64" />
        <Block className="h-8 w-44" />
        <Block className="h-4 w-52" />
      </div>
      <div className="space-y-3 rounded-xl bg-surface-container-low p-6">
        <div className="flex items-center gap-2.5">
          <Block className="size-11 rounded-md" />
          <Block className="size-11 rounded-md" />
          <Block className="h-11 w-20 rounded-md" />
          <Block className="h-8 w-40" />
        </div>
        {Array.from({ length: TIMELINE_ROW_COUNT }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Placeholder rows have no identity.
          <Block className="h-16 rounded-lg" key={index} />
        ))}
      </div>
      <DashboardGrid
        lead={
          <>
            <Block className="h-56" />
            <Block className="h-44" />
          </>
        }
        rail={
          <>
            <Block className="h-56" />
            <Block className="h-36" />
          </>
        }
      />
    </div>
  );
}
