import "server-only";
import { listDueXeroCleanupAttempts } from "@repo/database/queries/xero-cleanup";
import { log } from "@repo/observability/log";
import { processXeroCleanupAttempt } from "@repo/xero";
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
    return { failed, processed };
  }
);
