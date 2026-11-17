import type { TenantDb } from "@repo/database";
import "server-only";

import { withinLimit } from "@repo/auth/server";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import { assertTenantDb, lockPlanLimitMutations } from "@repo/database";

export type CreateManualPersonError =
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

// Shared by People > Add person and the setup wizard: creates a manual person
// within the plan's seat limit, serialised with other plan-limited changes.
export async function createManualPerson(
  input: {
    accountId: AccountId;
    email: string;
    employmentType: "contractor" | "director" | "employee" | "offshore";
    firstName: string;
    jobTitle?: string;
    lastName: string;
    organisationId: OrganisationId;
  },
  db: TenantDb
): Promise<Result<{ personId: string }, CreateManualPersonError>> {
  assertTenantDb(db, input.accountId);
  const run = async (tx: TenantDb): ReturnType<typeof createManualPerson> => {
    const company = await tx.organisation.findFirst({
      select: { id: true },
      where: {
        account_id: input.accountId,
        archived_at: null,
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
    await lockPlanLimitMutations(input.accountId, tx);
    const entitlement = await withinLimit(
      input.accountId,
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
        account_id: input.accountId,
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
    assertTenantDb(db, input.accountId);
    return await run(db);
  })();
}
