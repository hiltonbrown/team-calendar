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
    const runs = await database.syncRun.findMany({
      orderBy: { completed_at: "asc" },
      select: { completed_at: true, run_type: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        completed_at: { not: null },
        organisation_id: input.organisationId,
        run_type: { in: INITIAL_RUN_TYPES },
        status: "succeeded",
      },
    });
    const firstByType = new Map<string, Date>();
    for (const run of runs) {
      if (run.completed_at && !firstByType.has(run.run_type)) {
        firstByType.set(run.run_type, run.completed_at);
      }
    }
    if (firstByType.size !== INITIAL_RUN_TYPES.length) {
      return;
    }
    const occurredAt = new Date(
      Math.max(...Array.from(firstByType.values(), (date) => date.getTime()))
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
