"use server";

import { getCurrentUser, getSession } from "@repo/auth/server";
import type { Result } from "@repo/core";
import {
  afterTenantCommit,
  type TenantDb,
  withTenantResult,
} from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import {
  getUnreadCount,
  isKnownNotificationType,
  listRecentUnread,
  markAllAsRead,
  markAsRead,
  type NotificationListItem,
  type NotificationPreferenceRow,
  type NotificationServiceError,
  type PreferencesServiceError,
  upsertPreference,
} from "@repo/notifications";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPagePermission } from "@/lib/auth/require-page-permission";

type ActionError =
  | NotificationServiceError
  | PreferencesServiceError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string };
interface NotificationActor {
  accountId: string;
  userId: string;
}
const MarkReadSchema = z.object({ notificationId: z.string().uuid() });
const PreferenceSchema = z.object({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  notificationType: z
    .string()
    .refine(isKnownNotificationType, "Unknown notification type."),
  organisationId: z.string().uuid(),
});

export async function markAsReadAction(input: {
  notificationId: string;
}): Promise<
  Result<
    { notification: NotificationListItem; unreadCount: number },
    ActionError
  >
> {
  assertNoTenantTransaction("markAsReadAction");
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) {
    return await validationError("Invalid notification.");
  }
  return await runAccountNotification(
    (actor, db) =>
      markAsRead({ ...actor, notificationId: parsed.data.notificationId }, db),
    true
  );
}
export async function markAllAsReadAction(): Promise<
  Result<{ markedCount: number; unreadCount: 0 }, ActionError>
> {
  assertNoTenantTransaction("markAllAsReadAction");
  return await runAccountNotification(
    (actor, db) => markAllAsRead(actor, db),
    true
  );
}
export async function refreshUnreadCountAction(): Promise<
  Result<number, ActionError>
> {
  assertNoTenantTransaction("refreshUnreadCountAction");
  return await runAccountNotification((actor, db) => getUnreadCount(actor, db));
}
export async function listRecentUnreadAction(): Promise<
  Result<NotificationListItem[], ActionError>
> {
  assertNoTenantTransaction("listRecentUnreadAction");
  return await runAccountNotification((actor, db) =>
    listRecentUnread({ ...actor, limit: 3 }, db)
  );
}
export async function updatePreferenceAction(input: {
  organisationId: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  notificationType: string;
}): Promise<Result<NotificationPreferenceRow, ActionError>> {
  assertNoTenantTransaction("updatePreferenceAction");
  const parsed = PreferenceSchema.safeParse(input);
  if (!parsed.success) {
    return await validationError(
      parsed.error.issues[0]?.message ?? "Invalid notification preference."
    );
  }
  return await runAccountNotification(async (actor, db) => {
    const company = await db.organisation.findFirst({
      select: { id: true },
      where: { account_id: actor.accountId, id: parsed.data.organisationId },
    });
    if (!company) {
      return {
        error: {
          code: "not_authorised",
          message: "Organisation not found or not accessible in your context.",
        },
        ok: false,
      };
    }
    return upsertPreference({ ...actor, ...parsed.data }, db);
  }, true);
}

async function notificationActor(): Promise<
  Result<NotificationActor, ActionError>
> {
  const [authObject, user] = await Promise.all([
    getSession().then(
      (currentSession) =>
        currentSession ?? {
          accountId: null,
          role: null,
          sessionId: null,
          userId: null,
        }
    ),
    getCurrentUser(),
  ]);
  if (!(authObject.userId && authObject.accountId && user)) {
    return {
      error: { code: "not_authorised", message: "You need to sign in again." },
      ok: false,
    };
  }
  if (!(await hasPagePermission({ notifications: ["read"] }))) {
    return {
      error: {
        code: "not_authorised",
        message: "You do not have permission to access notifications.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: { accountId: authObject.accountId, userId: user.id },
  };
}
async function runAccountNotification<T>(
  operation: (
    actor: NotificationActor,
    db: TenantDb
  ) => Promise<Result<T, ActionError>>,
  invalidate = false
): Promise<Result<T, ActionError>> {
  const actor = await notificationActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(actor.value.accountId, async (db) => {
      const result = await operation(actor.value, db);
      if (result.ok && invalidate) {
        afterTenantCommit(db, () => {
          revalidatePath("/notifications");

          return Promise.resolve();
        });
      }
      return result;
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to update or load notifications. Try again shortly.",
      },
      ok: false,
    };
  }
}
function validationError(message: string): Result<never, ActionError> {
  return { error: { code: "validation_error", message }, ok: false };
}
