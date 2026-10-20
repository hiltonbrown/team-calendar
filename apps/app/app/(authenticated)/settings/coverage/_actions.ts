"use server";

import { auth, currentUser } from "@repo/auth/server";
import { updateTeamCoverageMinimum } from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { afterTenantCommit, withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  assertNoTenantTransaction("updateTeamCoverageMinimumAction");
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

  try {
    return await withTenantResult(
      context.value.clerkOrgId,
      async (db): ReturnType<typeof updateTeamCoverageMinimumAction> => {
        const company = await getOrganisationById(
          context.value.clerkOrgId as ClerkOrgId,
          context.value.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return {
            error: { code: "not_authorised", message: "Company not found." },
            ok: false,
          };
        }
        const result = await updateTeamCoverageMinimum(
          {
            actingRole: context.value.role,
            actingUserId: context.value.actingUserId,
            clerkOrgId: context.value.clerkOrgId,
            minimum: parsed.data.minimum,
            organisationId: context.value.organisationId,
            teamId: parsed.data.teamId,
          },
          db
        );
        if (!result.ok) {
          return { error: result.error, ok: false };
        }

        afterTenantCommit(db, () => {
          revalidatePath("/settings/coverage");

          return Promise.resolve();
        });
        afterTenantCommit(db, () => {
          revalidatePath("/");

          return Promise.resolve();
        });
        return {
          ok: true,
          value: {
            message: coverageReceipt(
              result.value.teamName,
              result.value.minimum
            ),
            minimum: result.value.minimum,
          },
        };
      }
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to update team coverage.",
      },
      ok: false,
    };
  }
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
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  let role: "admin" | "owner" | null = null;
  if (orgRole === "org:owner") {
    role = "owner";
  } else if (orgRole === "org:admin") {
    role = "admin";
  }
  if (!(orgId && user && role)) {
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
      clerkOrgId: orgId,
      organisationId,
      role,
    },
  };
}
