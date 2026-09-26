import "server-only";
import {
  getOldestUnknownXeroCleanupUpdatedAt,
  listDueXeroCleanupAttempts,
} from "@repo/database/queries/xero-cleanup";
import { log } from "@repo/observability/log";
import { emitXeroMetric, processXeroCleanupAttempt } from "@repo/xero";
import { inngest } from "../client";

export async function reconcileXeroConnections(): Promise<{
  processed: number;
  failed: number;
}> {
  const attempts = await listDueXeroCleanupAttempts({
    limit: 50,
    now: new Date(),
  });
  let processed = 0;
  let failed = 0;
  for (const attempt of attempts) {
    try {
      await processXeroCleanupAttempt(attempt);
      processed += 1;
    } catch {
      failed += 1;
      log.error("Xero connection cleanup attempt failed.", {
        attemptId: attempt.attemptId,
        clerkOrgId: attempt.clerkOrgId,
        organisationId: attempt.organisationId,
      });
    }
  }
  await recordUnknownCleanupAge();
  return { failed, processed };
}
export const reconcileXeroConnectionsFunction = inngest.createFunction(
  {
    id: "reconcile-xero-connections",
    retries: 0,
    triggers: { cron: "*/15 * * * *" },
  },
  async ({ step }) => {
    const attempts = await step.run("list-due-xero-cleanup", () =>
      listDueXeroCleanupAttempts({ limit: 50, now: new Date() })
    );
    let processed = 0;
    let failed = 0;
    for (const attempt of attempts) {
      try {
        await step.run(`cleanup-${attempt.attemptId}`, () =>
          processXeroCleanupAttempt(attempt)
        );
        processed += 1;
      } catch {
        failed += 1;
        log.error("Xero connection cleanup attempt failed.", {
          attemptId: attempt.attemptId,
          clerkOrgId: attempt.clerkOrgId,
          organisationId: attempt.organisationId,
        });
      }
    }
    await step.run("record-unknown-cleanup-age", recordUnknownCleanupAge);
    return { failed, processed };
  }
);

async function recordUnknownCleanupAge(): Promise<void> {
  try {
    const oldest = await getOldestUnknownXeroCleanupUpdatedAt();
    emitXeroMetric(
      "xero.cleanup.unknown_oldest_age_hours",
      oldest ? Math.max(0, (Date.now() - oldest.getTime()) / 3_600_000) : 0
    );
  } catch {
    /* Health instrumentation must not alter cleanup processing. */
  }
}
