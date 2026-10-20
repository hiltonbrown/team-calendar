"use server";

import { auth } from "@repo/auth/server";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { afterTenantCommit, withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createManualPerson } from "@/lib/server/create-manual-person";

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
  assertNoTenantTransaction("createManualPersonAction");
  const parsed = CreatePersonSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }

  const { orgId, orgRole } = await auth();
  if (!orgId || (orgRole !== "org:admin" && orgRole !== "org:owner")) {
    return notAuthorised();
  }

  // Trusted Clerk account, and company UUID validated in the same SQL scope.
  const clerkOrgId = orgId as ClerkOrgId;
  let created: ActionResult<{ personId: string }>;
  try {
    created = await withTenantResult(clerkOrgId, async (db) => {
      const company = await getOrganisationById(
        clerkOrgId,
        parsed.data.organisationId as OrganisationId,
        db
      );
      if (!company.ok) {
        return notAuthorised();
      }
      const result = await createManualPerson(
        {
          ...parsed.data,
          clerkOrgId,
          organisationId: company.value.id as OrganisationId,
        },
        db
      );
      if (result.ok) {
        afterTenantCommit(db, async () => revalidatePath("/people"));
      }
      return result;
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to create person. Please try again.",
      },
      ok: false,
    };
  }
  if (!created.ok) {
    return { error: created.error, ok: false };
  }
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
