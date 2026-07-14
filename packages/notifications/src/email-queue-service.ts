import "server-only";

import type { Result } from "@repo/core";
import { type Database, database } from "@repo/database";
import { notification_type as notificationTypes } from "@repo/database/generated/enums";
import { sendNotificationEmail } from "@repo/email";
import { log } from "@repo/observability/log";
import { z } from "zod";

export type EmailQueueServiceError =
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

export interface EmailQueueDatabase {
  notificationEmailQueue: Pick<Database["notificationEmailQueue"], "create">;
}

export interface EmailQueueDrainDatabase {
  notificationEmailQueue: Pick<
    Database["notificationEmailQueue"],
    "findMany" | "update"
  >;
}

export interface SendQueuedNotificationEmailsSummary {
  readonly failed: number;
  readonly processed: number;
  readonly sent: number;
}

const QueueSchema = z.object({
  actionUrl: z.string().nullable().optional(),
  body: z.string().min(1),
  clerkOrgId: z.string().min(1),
  emailTemplate: z.string().min(1),
  notificationId: z.string().uuid().nullable().optional(),
  notificationType: z.string().min(1),
  organisationId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientUserId: z.string().min(1),
  title: z.string().min(1),
});

export async function enqueueNotificationEmail(
  input: z.input<typeof QueueSchema>,
  client: EmailQueueDatabase = database
): Promise<
  Result<{ queued: boolean; queueId: string }, EmailQueueServiceError>
> {
  const parsed = QueueSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  if (!isNotificationType(parsed.data.notificationType)) {
    return validationErrorMessage("Invalid notification type.");
  }

  try {
    const unsubscribeUrl = preferencesUrl(parsed.data.notificationType);
    const row = await client.notificationEmailQueue.create({
      data: {
        clerk_org_id: parsed.data.clerkOrgId,
        organisation_id: parsed.data.organisationId,
        notification_id: parsed.data.notificationId ?? null,
        recipient_user_id: parsed.data.recipientUserId,
        notification_type: parsed.data.notificationType,
        email_template: parsed.data.emailTemplate,
        recipient_email: parsed.data.recipientEmail,
        title: parsed.data.title,
        body: parsed.data.body,
        action_url: parsed.data.actionUrl ?? null,
        unsubscribe_url: unsubscribeUrl,
        merge_data: {
          actionUrl: parsed.data.actionUrl ?? null,
          unsubscribeUrl,
        },
      },
      select: { id: true },
    });
    return { ok: true, value: { queued: true, queueId: row.id } };
  } catch {
    return unknownError("Failed to queue notification email.");
  }
}

export async function sendQueuedNotificationEmails(
  client: EmailQueueDrainDatabase = database
): Promise<
  Result<SendQueuedNotificationEmailsSummary, EmailQueueServiceError>
> {
  try {
    const rows = await client.notificationEmailQueue.findMany({
      orderBy: { queued_at: "asc" },
      take: 50,
      where: { status: "queued" },
    });
    const summary = { failed: 0, processed: rows.length, sent: 0 };

    for (const row of rows) {
      try {
        const result = await sendNotificationEmail({
          actionUrl: row.action_url,
          body: row.body,
          idempotencyKey: row.id,
          title: row.title,
          to: row.recipient_email,
          unsubscribeUrl: row.unsubscribe_url,
        });

        if (result.ok) {
          await client.notificationEmailQueue.update({
            data: {
              attempts: { increment: 1 },
              sent_at: new Date(),
              status: "sent",
            },
            where: { id: row.id },
          });
          summary.sent += 1;
          continue;
        }

        summary.failed += 1;
        if (result.error === "Resend transport is not configured") {
          log.error("Notification email transport is not configured", {
            queueId: row.id,
          });
          continue;
        }

        await updateFailedEmail(row.id, row.attempts, result.error, client);
      } catch (error) {
        summary.failed += 1;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to send notification email";
        log.error("Failed to send notification email", {
          error,
          queueId: row.id,
        });
        await updateFailedEmail(row.id, row.attempts, message, client);
      }
    }

    return { ok: true, value: summary };
  } catch {
    return unknownError("Failed to drain notification email queue.");
  }
}

async function updateFailedEmail(
  id: string,
  attempts: number,
  error: string,
  client: EmailQueueDrainDatabase
): Promise<void> {
  const nextAttempts = attempts + 1;
  await client.notificationEmailQueue.update({
    data: {
      attempts: { increment: 1 },
      last_error: error,
      status: nextAttempts >= 5 ? "failed" : "queued",
    },
    where: { id },
  });
}

export function preferencesUrl(notificationType: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/notifications", baseUrl);
  url.searchParams.set("tab", "preferences");
  url.searchParams.set("focus", notificationType);
  return url.toString();
}

function validationError(
  error: z.ZodError
): Result<never, EmailQueueServiceError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid email queue request.",
    },
  };
}

function validationErrorMessage(
  message: string
): Result<never, EmailQueueServiceError> {
  return { ok: false, error: { code: "validation_error", message } };
}

function unknownError(message: string): Result<never, EmailQueueServiceError> {
  return { ok: false, error: { code: "unknown_error", message } };
}

function isNotificationType(
  value: string
): value is (typeof notificationTypes)[keyof typeof notificationTypes] {
  return Object.values(notificationTypes).some((type) => type === value);
}
