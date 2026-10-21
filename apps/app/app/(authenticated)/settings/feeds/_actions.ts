"use server";

import { auth, currentUser } from "@repo/auth/server";
import { updateSettings } from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
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

  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  let role: "admin" | "owner" | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  }
  if (!(orgId && role && user)) {
    return notAuthorised();
  }

  const clerkOrgId = orgId as ClerkOrgId;
  try {
    return await withTenantResult(
      clerkOrgId,
      async (db): ReturnType<typeof updateFeedDefaultsAction> => {
        const company = await getOrganisationById(
          clerkOrgId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return notAuthorised();
        }
        const result = await updateSettings(
          {
            actingRole: role,
            actingUserId: user.id,
            clerkOrgId,
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
