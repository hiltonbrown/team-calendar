import "server-only";

import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { database } from "@repo/database";
import type { sync_run_type } from "@repo/database/generated/enums";
import { log } from "@repo/observability/log";

const INITIAL_RUN_TYPES = [
  "people",
  "leave_records",
  "leave_balances",
] satisfies sync_run_type[];

export async function captureInitialSyncCompleted(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<void> {
  try {
    const runs = await Promise.all(
      INITIAL_RUN_TYPES.map((runType) =>
        database.syncRun.findFirst({
          orderBy: { completed_at: "asc" },
          select: { completed_at: true },
          where: {
            clerk_org_id: input.clerkOrgId,
            completed_at: { not: null },
            organisation_id: input.organisationId,
            run_type: runType,
            status: "succeeded",
          },
        })
      )
    );
    if (runs.some((run) => !run?.completed_at)) {
      return;
    }
    const occurredAt = new Date(
      Math.max(...runs.map((run) => run?.completed_at?.getTime() ?? 0))
    );
    const event = createActivationEvent({
      deduplicationKey: `${input.clerkOrgId}:${input.organisationId}`,
      name: "Initial Sync Completed",
      occurredAt,
      subjectId: input.clerkOrgId,
    });
    analytics?.capture({ ...event });
    await analytics?.flush();
  } catch (error) {
    log.warn("Initial sync activation capture failed", {
      clerkOrgId: input.clerkOrgId,
      error,
      organisationId: input.organisationId,
    });
  }
}
