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
  for (const account of accounts) {
    const result = await sendQueuedNotificationEmails(account.clerk_org_id);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    summary.failed += result.value.failed;
    summary.processed += result.value.processed;
    summary.sent += result.value.sent;
  }
  return summary;
}
