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
    return { error: "Not authenticated", ok: false };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return { error: "You do not have permission to manage members", ok: false };
  }

  const parsed = UpdateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      ok: false,
    };
  }

  // Owner assignment is ownership-sensitive: only owners may grant the owner
  // role, otherwise an admin could escalate themselves (or others) to owner.
  if (parsed.data.role === "org:owner" && orgRole !== "org:owner") {
    return {
      error: "Only owners can assign the owner role",
      ok: false,
    };
  }

  try {
    const clerk = await clerkClient();
    const memberships = await clerk.organizations.getOrganizationMembershipList(
      {
        organizationId: orgId,
        userId: [parsed.data.membershipId],
      }
    );

    if (memberships.data.length !== 1) {
      return { error: "Member not found", ok: false };
    }

    if (memberships.data[0]?.role === "org:owner" && orgRole !== "org:owner") {
      return {
        error: "Only owners can change another owner's role",
        ok: false,
      };
    }

    await clerk.organizations.updateOrganizationMembership({
      organizationId: orgId,
      role: parsed.data.role,
      userId: parsed.data.membershipId,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update role";
    return { error: message, ok: false };
  }
};
