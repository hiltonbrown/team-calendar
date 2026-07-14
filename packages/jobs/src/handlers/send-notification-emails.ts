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
      await step.run("send-notification-emails", async () =>
        sendQueuedNotificationEmails()
      )
  );
