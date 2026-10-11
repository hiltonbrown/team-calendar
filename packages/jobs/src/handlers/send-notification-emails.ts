import { systemDatabase } from "@repo/database";
import { sendQueuedNotificationEmails } from "@repo/notifications";
import type { InngestFunction } from "inngest";
import { inngest } from "../client";

export const sendNotificationEmailsFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      concurrency: 1,
      id: "send-notification-emails",
      triggers: { cron: "*/2 * * * *" },
    },
    async ({ step }) =>
      await step.run("send-notification-emails", drainNotificationEmailQueue)
  );

export async function drainNotificationEmailQueue(): Promise<{
  failed: number;
  processed: number;
  sent: number;
}> {
  const accounts = await systemDatabase.notificationEmailQueue.findMany({
    distinct: ["clerk_org_id"],
    select: { clerk_org_id: true },
    where: { status: "queued" },
  });
  const summary = { failed: 0, processed: 0, sent: 0 };
  const accountFailures = new Set<string>();
  // One account's failure must not hold back every later account's email.
  for (const account of accounts) {
    const result = await sendQueuedNotificationEmails(account.clerk_org_id);
    if (!result.ok) {
      accountFailures.add(result.error.message);
      continue;
    }
    summary.failed += result.value.failed;
    summary.processed += result.value.processed;
    summary.sent += result.value.sent;
  }
  if (accountFailures.size > 0) {
    throw new Error([...accountFailures].join(" "));
  }
  return summary;
}
