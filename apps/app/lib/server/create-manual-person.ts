import type { TenantDb } from "@repo/database";
import "server-only";

import { withinLimit } from "@repo/auth/server";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { assertTenantDb, lockPlanLimitMutations } from "@repo/database";

export type CreateManualPersonError =
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

// Shared by People > Add person and the setup wizard: creates a manual person
// within the plan's seat limit, serialised with other plan-limited changes.
export async function createManualPerson(
  input: {
    clerkOrgId: ClerkOrgId;
    email: string;
    employmentType: "contractor" | "director" | "employee" | "offshore";
    firstName: string;
    jobTitle?: string;
    lastName: string;
    organisationId: OrganisationId;
  },
  db: TenantDb
): Promise<Result<{ personId: string }, CreateManualPersonError>> {
  assertTenantDb(db, input.clerkOrgId);
  const run = async (tx: TenantDb): ReturnType<typeof createManualPerson> => {
    const company = await tx.organisation.findFirst({
      select: { id: true },
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        id: input.organisationId,
      },
    });
    if (!company) {
      return {
        error: {
          code: "validation_error",
          message: "Company is unavailable.",
        },
        ok: false,
      };
    }
    await lockPlanLimitMutations(input.clerkOrgId, tx);
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
  };
  return await (async () => {
    assertTenantDb(db, input.clerkOrgId);
    return await run(db);
  })();
}
