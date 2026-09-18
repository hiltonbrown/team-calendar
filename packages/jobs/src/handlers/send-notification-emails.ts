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
  const result = await sendQueuedNotificationEmails();
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
