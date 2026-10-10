"use server";

import { auth } from "@repo/auth/server";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createManualPerson } from "@/lib/server/create-manual-person";
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
  const created = await createManualPerson({
    clerkOrgId: clerkOrgId as ClerkOrgId,
    email: parsed.data.email,
    employmentType: parsed.data.employmentType,
    firstName: parsed.data.firstName,
    jobTitle: parsed.data.jobTitle,
    lastName: parsed.data.lastName,
    organisationId: organisationId as OrganisationId,
  });
  if (!created.ok) {
    return { error: created.error, ok: false };
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

function validationError(message?: string): ActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid input.",
    },
    ok: false,
  };
}
