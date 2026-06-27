import type { ReactNode } from "react";

interface DashboardGridProps {
  lead: ReactNode;
  rail: ReactNode;
}

/**
 * Asymmetric 2:1 dashboard layout (DESIGN.md Layout Principle 1). The wider lead
 * column carries the role's primary "needs you" content; the narrower rail holds
 * summaries, reference, and shortcuts. Collapses to a single column below 1024px.
 */
export function DashboardGrid({ lead, rail }: DashboardGridProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_clamp(18rem,26%,23rem)]">
      <div className="flex min-w-0 flex-col gap-6">{lead}</div>
      <aside className="flex min-w-0 flex-col gap-6">{rail}</aside>
    </div>
  );
}
