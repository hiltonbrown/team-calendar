"use server";

import { getCurrentUser, getSession } from "@repo/auth/server";
import { updateSettings } from "@repo/availability";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import { afterTenantCommit, withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ActionSchema = z.object({
  organisationId: z.string().uuid(),
  patch: z
    .object({
      defaultFeedPrivacyMode: z.enum(["masked", "named", "private"]).optional(),
      feedsIncludePublicHolidaysDefault: z.boolean().optional(),
    })
    .strict(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function updateFeedDefaultsAction(input: {
  organisationId: string;
  patch: {
    defaultFeedPrivacyMode?: "masked" | "named" | "private";
    feedsIncludePublicHolidaysDefault?: boolean;
  };
}): Promise<ActionResult<{ updated: true }>> {
  assertNoTenantTransaction("updateFeedDefaultsAction");
  const parsed = ActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const [{ accountId: sessionAccountId, role: sessionRole }, user] =
    await Promise.all([
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
  let role: "admin" | "owner" | null = null;
  if (sessionRole === "owner") {
    role = "owner";
  } else if (sessionRole === "admin") {
    role = "admin";
  }
  if (!(sessionAccountId && role && user)) {
    return notAuthorised();
  }

  const accountId = sessionAccountId as AccountId;
  try {
    return await withTenantResult(
      accountId,
      async (db): ReturnType<typeof updateFeedDefaultsAction> => {
        const company = await getOrganisationById(
          accountId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return notAuthorised();
        }
        const result = await updateSettings(
          {
            accountId,
            actingRole: role,
            actingUserId: user.id,
            organisationId: company.value.id,
            patch: parsed.data.patch,
          },
          db
        );
        if (!result.ok) {
          return unknownError(result.error.message);
        }

        afterTenantCommit(db, () => {
          revalidatePath("/settings/feeds");

          return Promise.resolve();
        });
        afterTenantCommit(db, () => {
          revalidatePath("/feeds");

          return Promise.resolve();
        });

        return { ok: true, value: { updated: true } };
      }
    );
  } catch {
    return unknownError("Failed to save feed defaults.");
  }
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage feed defaults.",
    },
    ok: false,
  };
}

function unknownError(message: string): ActionResult<never> {
  return {
    error: {
      code: "unknown_error",
      message,
    },
    ok: false,
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid feed defaults request.",
    },
    ok: false,
  };
}
