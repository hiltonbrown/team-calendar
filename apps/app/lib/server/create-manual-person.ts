import "server-only";

import { withinLimit } from "@repo/auth/server";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { lockPlanLimitMutations, tenantTransaction } from "@repo/database";

export type CreateManualPersonError =
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

// Shared by People > Add person and the setup wizard: creates a manual person
// within the plan's seat limit, serialised with other plan-limited changes.
export async function createManualPerson(input: {
  clerkOrgId: ClerkOrgId;
  email: string;
  employmentType: "contractor" | "director" | "employee" | "offshore";
  firstName: string;
  jobTitle?: string;
  lastName: string;
  organisationId: OrganisationId;
}): Promise<Result<{ personId: string }, CreateManualPersonError>> {
  try {
    return await tenantTransaction(input.clerkOrgId, async (tx) => {
      await lockPlanLimitMutations(tx, input.clerkOrgId);
      const entitlement = await withinLimit(
        input.clerkOrgId,
        input.organisationId,
        "seats",
        tx
      );
      if (!entitlement.ok) {
        return {
          error: {
            code: "unknown_error" as const,
            message: entitlement.error.message,
          },
          ok: false as const,
        };
      }
      if (!entitlement.value.allowed) {
        return {
          error: {
            code: "validation_error" as const,
            message: "Your current plan has reached its active people limit.",
          },
          ok: false as const,
        };
      }
      const person = await tx.person.create({
        data: {
          clerk_org_id: input.clerkOrgId,
          email: input.email.toLowerCase(),
          employment_type: input.employmentType,
          first_name: input.firstName,
          job_title: input.jobTitle ?? null,
          last_name: input.lastName,
          organisation_id: input.organisationId,
          source_system: "MANUAL",
        },
        select: { id: true },
      });
      return { ok: true as const, value: { personId: person.id } };
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
}
