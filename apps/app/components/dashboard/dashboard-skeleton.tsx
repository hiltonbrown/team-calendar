import { DashboardGrid } from "./dashboard-grid";

function Block({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-muted motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Streaming fallback for the dashboard body. Mirrors the real asymmetric
 * lead/rail layout (via DashboardGrid) so content streams in without the page
 * jumping, instead of an all-or-nothing route-level block.
 */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <span className="sr-only">Loading dashboard</span>
      <div className="space-y-2">
        <Block className="h-8 w-44" />
        <Block className="h-4 w-60" />
      </div>
      <DashboardGrid
        lead={
          <>
            <Block className="h-56 rounded-2xl" />
            <Block className="h-44 rounded-2xl" />
            <Block className="h-44 rounded-2xl" />
          </>
        }
        rail={
          <>
            <Block className="h-36 rounded-2xl" />
            <Block className="h-36 rounded-2xl" />
            <Block className="h-36 rounded-2xl" />
          </>
        }
      />
    </div>
  );
}
