"use server";

import { auth, withinLimit } from "@repo/auth/server";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, lockPlanLimitMutations } from "@repo/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const CreatePersonSchema = z.object({
  email: z.string().trim().email().max(256),
  employmentType: z.enum(["employee", "contractor", "director", "offshore"]),
  firstName: z.string().trim().min(1).max(128),
  jobTitle: z.string().trim().max(128).optional(),
  lastName: z.string().trim().min(1).max(128),
  organisationId: z.string().uuid(),
});

type ActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

type ActionResult<T> = Result<T, ActionError>;

export async function createManualPersonAction(input: {
  email: string;
  employmentType: string;
  firstName: string;
  jobTitle?: string;
  lastName: string;
  organisationId: string;
}): Promise<ActionResult<never>> {
  const parsed = CreatePersonSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const { orgRole } = await auth();
  if (orgRole !== "org:admin" && orgRole !== "org:owner") {
    return notAuthorised();
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return notAuthorised();
  }

  const { clerkOrgId, organisationId } = contextResult.value;

  try {
    const result = await database.$transaction(async (tx) => {
      await lockPlanLimitMutations(tx, clerkOrgId);
      const entitlement = await withinLimit(
        clerkOrgId,
        organisationId,
        "seats",
        tx
      );
      if (!entitlement.ok) {
        return unknownError(entitlement.error.message);
      }
      if (!entitlement.value.allowed) {
        return validationError(
          "Your current plan has reached its active people limit."
        );
      }

      await tx.person.create({
        data: {
          clerk_org_id: clerkOrgId as ClerkOrgId,
          email: parsed.data.email.toLowerCase(),
          employment_type: parsed.data.employmentType,
          first_name: parsed.data.firstName,
          job_title: parsed.data.jobTitle ?? null,
          last_name: parsed.data.lastName,
          organisation_id: organisationId as OrganisationId,
          source_system: "MANUAL",
        },
        select: { id: true },
      });
      return creationAllowed();
    });

    if (!result.ok) {
      return result;
    }
  } catch {
    return unknownError("Failed to create person. Please try again.");
  }

  revalidatePath("/people");
  redirect("/people");
}

function notAuthorised(): ActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to add people.",
    },
    ok: false,
  };
}

function unknownError(message: string): ActionResult<never> {
  return { error: { code: "unknown_error", message }, ok: false };
}

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid input.",
    },
    ok: false,
  };
}

function creationAllowed(): { ok: true } {
  return { ok: true };
}
