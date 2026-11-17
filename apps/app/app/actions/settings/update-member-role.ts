"use server";

import {
  listAccountMembers,
  updateAccountMemberRole,
} from "@repo/auth/accounts";
import { hasPermission as can, isAuthRole } from "@repo/auth/permissions";

import { getSession } from "@repo/auth/server";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";

const UpdateRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["owner", "admin", "manager", "viewer"]),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const updateMemberRole = async (
  input: unknown
): Promise<Result<void>> => {
  assertNoTenantTransaction("updateMemberRole");
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
  if (!can(sessionRole, { member: ["update"] })) {
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
  if (
    parsed.data.role === "owner" &&
    !can(sessionRole, { ownership: ["manage"] })
  ) {
    return {
      error: "Only owners can assign the owner role",
      ok: false,
    };
  }

  try {
    const memberships = await listAccountMembers({
      accountId: sessionAccountId,
      userIds: [parsed.data.membershipId],
    });

    if (memberships.data.length !== 1) {
      return { error: "Member not found", ok: false };
    }

    if (!isAuthRole(memberships.data[0]?.role)) {
      return { error: "Member role could not be verified", ok: false };
    }

    if (
      memberships.data[0]?.role === "owner" &&
      !can(sessionRole, { ownership: ["manage"] })
    ) {
      return {
        error: "Only owners can change another owner's role",
        ok: false,
      };
    }

    await updateAccountMemberRole({
      accountId: sessionAccountId,
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
