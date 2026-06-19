"use server";

import { auth, clerkClient } from "@repo/auth/server";
import { z } from "zod";

const RemoveMemberSchema = z.object({
  userId: z.string().min(1),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const removeMember = async (input: unknown): Promise<Result<void>> => {
  const { orgId, orgRole } = await auth();

  if (!orgId) {
    return { ok: false, error: "Not authenticated" };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return { ok: false, error: "You do not have permission to manage members" };
  }

  const parsed = RemoveMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const clerk = await clerkClient();
    await clerk.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId: parsed.data.userId,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove member";
    return { ok: false, error: message };
  }
};
