"use server";

import { auth, currentUser } from "@repo/auth/server";
import { updateSettings } from "@repo/availability";
import type { Result } from "@repo/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

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
  const parsed = ActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(parsed.data.organisationId),
  ]);
  let role: "admin" | "owner" | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  }
  if (!(role && user && context.ok)) {
    return notAuthorised();
  }

  const result = await updateSettings({
    actingRole: role,
    actingUserId: user.id,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
    patch: parsed.data.patch,
  });
  if (!result.ok) {
    return unknownError(result.error.message);
  }

  revalidatePath("/settings/feeds");
  revalidatePath("/feeds");

  return { ok: true, value: { updated: true } };
}

function notAuthorised(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage feed defaults.",
    },
  };
}

function unknownError(message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message,
    },
  };
}

function validationError(message?: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid feed defaults request.",
    },
  };
}
