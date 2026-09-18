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
    return { error: "Not authenticated", ok: false };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return { error: "You do not have permission to manage members", ok: false };
  }

  const parsed = RemoveMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      ok: false,
    };
  }

  try {
    const clerk = await clerkClient();
    const memberships = await clerk.organizations.getOrganizationMembershipList(
      {
        organizationId: orgId,
        userId: [parsed.data.userId],
      }
    );

    if (memberships.data.length !== 1) {
      return { error: "Member not found", ok: false };
    }

    if (memberships.data[0]?.role === "org:owner" && orgRole !== "org:owner") {
      return {
        error: "Only owners can remove another owner",
        ok: false,
      };
    }

    await clerk.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId: parsed.data.userId,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove member";
    return { error: message, ok: false };
  }
};
