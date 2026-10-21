"use server";

import { auth } from "@repo/auth/server";
import { afterTenantCommit, withTenantResult } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revokeAllFeedTokens } from "@repo/feeds";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const RevokeTokensSchema = z.object({
  organisationId: z.string().uuid(),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const revokeAllTokens = async (
  input: z.infer<typeof RevokeTokensSchema>
): Promise<Result<{ revokedCount: number }>> => {
  assertNoTenantTransaction("revokeAllTokens");
  const parsed = RevokeTokensSchema.safeParse(input);

  if (!parsed.success) {
    return { error: "Invalid organisation", ok: false };
  }

  const { orgId, orgRole } = await auth();
  if (!orgId) {
    return { error: "Not authenticated", ok: false };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return {
      error: "You do not have permission to revoke feed tokens",
      ok: false,
    };
  }

  return withTenantResult(
    orgId,
    async (db): Promise<Result<{ revokedCount: number }>> => {
      const company = await db.organisation.findFirst({
        select: { id: true },
        where: { clerk_org_id: orgId, id: parsed.data.organisationId },
      });
      if (!company) {
        return {
          error: "Organisation not found or not accessible in your context",
          ok: false,
        };
      }
      const result = await revokeAllFeedTokens(
        {
          clerkOrgId: orgId,
          organisationId: company.id,
        },
        db
      );
      if (!result.ok) {
        return { error: result.error.message, ok: false };
      }
      afterTenantCommit(db, () => {
        for (const path of ["/", "/feeds", "/calendar", "/settings/feeds"]) {
          revalidatePath(path);
        }

        return Promise.resolve();
      });
      return { ok: true, value: result.value };
    }
  );
};
