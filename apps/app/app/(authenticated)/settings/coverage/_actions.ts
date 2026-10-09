"use server";

import { auth, currentUser } from "@repo/auth/server";
import { updateTeamCoverageMinimum } from "@repo/availability";
import type { Result } from "@repo/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const UpdateSchema = z.object({
  minimum: z.number().nullable(),
  organisationId: z.string().uuid(),
  teamId: z.string().uuid(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "not_found"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export interface CoverageMinimumReceipt {
  message: string;
  minimum: number | null;
}

export async function updateTeamCoverageMinimumAction(input: {
  minimum: number | null;
  organisationId: string;
  teamId: string;
}): Promise<ActionResult<CoverageMinimumReceipt>> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message: "Enter a whole number of people, or leave it blank.",
      },
      ok: false,
    };
  }

  const context = await resolveAdminContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const result = await updateTeamCoverageMinimum({
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    minimum: parsed.data.minimum,
    organisationId: context.value.organisationId,
    teamId: parsed.data.teamId,
  });
  if (!result.ok) {
    return { error: result.error, ok: false };
  }

  revalidatePath("/settings/coverage");
  revalidatePath("/");
  return {
    ok: true,
    value: {
      message: coverageReceipt(result.value.teamName, result.value.minimum),
      minimum: result.value.minimum,
    },
  };
}

function coverageReceipt(teamName: string, minimum: number | null): string {
  if (minimum === null) {
    return `${teamName} minimum cleared.`;
  }
  return `${teamName} minimum set to ${minimum} ${minimum === 1 ? "person" : "people"}.`;
}

async function resolveAdminContext(organisationId: string): Promise<
  ActionResult<{
    actingUserId: string;
    clerkOrgId: string;
    organisationId: string;
    role: "admin" | "owner";
  }>
> {
  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
  ]);

  let role: "admin" | "owner" | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  }
  if (!(user && role && context.ok)) {
    return {
      error: {
        code: "not_authorised",
        message: "You do not have permission to manage coverage.",
      },
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      actingUserId: user.id,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      role,
    },
  };
}
