"use server";

import { hasPermission as can } from "@repo/auth/permissions";

import { getSession } from "@repo/auth/server";
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

  const { accountId: sessionAccountId, role: sessionRole } =
    (await getSession()) ?? {
      accountId: null,
      role: null,
      sessionId: null,
      userId: null,
    };
  if (!sessionAccountId) {
    return { error: "Not authenticated", ok: false };
  }
  if (!can(sessionRole, { settings: ["update"] })) {
    return {
      error: "You do not have permission to revoke feed tokens",
      ok: false,
    };
  }

  return withTenantResult(
    sessionAccountId,
    async (db): Promise<Result<{ revokedCount: number }>> => {
      const company = await db.organisation.findFirst({
        select: { id: true },
        where: { account_id: sessionAccountId, id: parsed.data.organisationId },
      });
      if (!company) {
        return {
          error: "Organisation not found or not accessible in your context",
          ok: false,
        };
      }
      const result = await revokeAllFeedTokens(
        {
          accountId: sessionAccountId,
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
