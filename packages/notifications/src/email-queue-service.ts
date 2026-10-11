import "server-only";

import type { Result } from "@repo/core";
import { type Database, tenantDatabase } from "@repo/database";
import { notification_type as notificationTypes } from "@repo/database/generated/enums";
import { sendNotificationEmail } from "@repo/email";
import { log } from "@repo/observability/log";
import { z } from "zod";

export type EmailQueueServiceError =
  | { code: "configuration_error"; message: string }
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
  providedClient?: EmailQueueDatabase
): Promise<
  Result<{ queued: boolean; queueId: string }, EmailQueueServiceError>
> {
  const parsed = QueueSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  const client = providedClient ?? tenantDatabase(parsed.data.clerkOrgId);
  if (!isNotificationType(parsed.data.notificationType)) {
    return validationErrorMessage("Invalid notification type.");
  }

  try {
    const unsubscribeUrl = preferencesUrl(parsed.data.notificationType);
    const row = await client.notificationEmailQueue.create({
      data: {
        action_url: parsed.data.actionUrl ?? null,
        body: parsed.data.body,
        clerk_org_id: parsed.data.clerkOrgId,
        email_template: parsed.data.emailTemplate,
        merge_data: {
          actionUrl: parsed.data.actionUrl ?? null,
          unsubscribeUrl,
        },
        notification_id: parsed.data.notificationId ?? null,
        notification_type: parsed.data.notificationType,
        organisation_id: parsed.data.organisationId,
        recipient_email: parsed.data.recipientEmail,
        recipient_user_id: parsed.data.recipientUserId,
        title: parsed.data.title,
        unsubscribe_url: unsubscribeUrl,
      },
      select: { id: true },
    });
    return { ok: true, value: { queued: true, queueId: row.id } };
  } catch {
    return unknownError("Failed to queue notification email.");
  }
}

export async function sendQueuedNotificationEmails(
  clerkOrgId: string,
  client: EmailQueueDrainDatabase = tenantDatabase(clerkOrgId)
): Promise<
  Result<SendQueuedNotificationEmailsSummary, EmailQueueServiceError>
> {
  if (!hasConfiguredEmailTransport()) {
    return {
      error: {
        code: "configuration_error",
        message: "Notification email transport is not configured.",
      },
      ok: false,
    };
  }

  try {
    const rows = await client.notificationEmailQueue.findMany({
      orderBy: { queued_at: "asc" },
      take: 50,
      where: { clerk_org_id: clerkOrgId, status: "queued" },
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
            where: { clerk_org_id: clerkOrgId, id: row.id },
          });
          summary.sent += 1;
          continue;
        }

        summary.failed += 1;
        await updateFailedEmail(
          clerkOrgId,
          row.id,
          row.attempts,
          result.error,
          client
        );
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
        await updateFailedEmail(
          clerkOrgId,
          row.id,
          row.attempts,
          message,
          client
        );
      }
    }

    return { ok: true, value: summary };
  } catch {
    return unknownError("Failed to drain notification email queue.");
  }
}

function hasConfiguredEmailTransport(): boolean {
  const token = process.env.RESEND_TOKEN?.trim();
  const sender = process.env.RESEND_FROM?.trim();

  return Boolean(
    token?.startsWith("re_") &&
      sender &&
      z.string().email().safeParse(sender).success
  );
}

async function updateFailedEmail(
  clerkOrgId: string,
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
    where: { clerk_org_id: clerkOrgId, id },
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
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid email queue request.",
    },
    ok: false,
  };
}

function validationErrorMessage(
  message: string
): Result<never, EmailQueueServiceError> {
  return { error: { code: "validation_error", message }, ok: false };
}

function unknownError(message: string): Result<never, EmailQueueServiceError> {
  return { error: { code: "unknown_error", message }, ok: false };
}

function isNotificationType(
  value: string
): value is (typeof notificationTypes)[keyof typeof notificationTypes] {
  return Object.values(notificationTypes).some((type) => type === value);
}
