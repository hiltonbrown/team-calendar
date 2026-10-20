/**
 * Entry points allowed to open independent tenant read transactions.
 *
 * Approval requires a Stage 0 measurement showing the parallel loader is faster
 * than the serial request transaction. Neon measurements are currently pending,
 * so no loader is approved. Candidates below are evidence targets, not permission
 * to fan out. Add the measured comparison beside any future approved entry.
 */
export const TENANT_FAN_OUT_ENTRY_POINTS: readonly string[] = [];

export const TENANT_FAN_OUT_CANDIDATES = [
  {
    entryPoints: ["apps/app/app/(authenticated)/leave-approvals/page.tsx"],
    services: ["getApprovalSummaryCounts"],
  },
  {
    entryPoints: ["apps/app/app/(authenticated)/dashboard-body.tsx"],
    services: ["dashboard-service", "current-status", "plan-service"],
  },
  {
    entryPoints: [
      "apps/app/app/(authenticated)/sync/page.tsx",
      "apps/app/app/(authenticated)/sync/[runId]/page.tsx",
    ],
    services: ["sync-monitor-service"],
  },
  {
    entryPoints: [
      "apps/app/app/(authenticated)/settings/general/page.tsx",
      "apps/app/app/(authenticated)/settings/billing/page.tsx",
    ],
    services: ["settings summaries"],
  },
  {
    entryPoints: [
      "apps/app/app/(authenticated)/feeds/page.tsx",
      "apps/app/app/(authenticated)/feeds/[feedId]/page.tsx",
      "apps/app/app/(authenticated)/feeds/new/page.tsx",
      "apps/app/app/(authenticated)/settings/feeds/page.tsx",
    ],
    services: ["feed-scope", "feed-service", "getFeedOversightCounts"],
  },
  {
    entryPoints: ["packages/jobs/src/handlers/recount-usage.ts"],
    services: ["recountUsage"],
  },
] as const;
