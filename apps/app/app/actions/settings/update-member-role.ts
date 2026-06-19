"use server";

import { auth, clerkClient } from "@repo/auth/server";
import { z } from "zod";

const UpdateRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["org:owner", "org:admin", "org:manager", "org:viewer"]),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const updateMemberRole = async (
  input: unknown
): Promise<Result<void>> => {
  const { orgId, orgRole } = await auth();

  if (!orgId) {
    return { ok: false, error: "Not authenticated" };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return { ok: false, error: "You do not have permission to manage members" };
  }

  const parsed = UpdateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // Owner assignment is ownership-sensitive: only owners may grant the owner
  // role, otherwise an admin could escalate themselves (or others) to owner.
  if (parsed.data.role === "org:owner" && orgRole !== "org:owner") {
    return {
      ok: false,
      error: "Only owners can assign the owner role",
    };
  }

  try {
    const clerk = await clerkClient();
    await clerk.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId: parsed.data.membershipId,
      role: parsed.data.role,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update role";
    return { ok: false, error: message };
  }
};
