"use server";

import { auth } from "@repo/auth/server";
import { revokeAllFeedTokens } from "@repo/feeds";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const RevokeTokensSchema = z.object({
  organisationId: z.string().uuid(),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const revokeAllTokens = async (
  input: z.infer<typeof RevokeTokensSchema>
): Promise<Result<{ revokedCount: number }>> => {
  const parsed = RevokeTokensSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Invalid organisation" };
  }

  const { orgId, orgRole } = await auth();
  if (!orgId) {
    return { ok: false, error: "Not authenticated" };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return {
      ok: false,
      error: "You do not have permission to revoke feed tokens",
    };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { ok: false, error: contextResult.error.message };
  }

  const result = await revokeAllFeedTokens(contextResult.value);
  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  for (const path of ["/", "/feeds", "/calendar", "/settings/feeds"]) {
    revalidatePath(path);
  }

  return { ok: true, value: result.value };
};
