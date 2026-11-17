"use server";

import { listAccountMembers, removeAccountMember } from "@repo/auth/accounts";
import { hasPermission as can, isAuthRole } from "@repo/auth/permissions";

import { getSession } from "@repo/auth/server";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";

const RemoveMemberSchema = z.object({
  userId: z.string().min(1),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const removeMember = async (input: unknown): Promise<Result<void>> => {
  assertNoTenantTransaction("removeMember");
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
  if (!can(sessionRole, { member: ["delete"] })) {
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
    const memberships = await listAccountMembers({
      accountId: sessionAccountId,
      userIds: [parsed.data.userId],
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
        error: "Only owners can remove another owner",
        ok: false,
      };
    }

    await removeAccountMember({
      accountId: sessionAccountId,
      userId: parsed.data.userId,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove member";
    return { error: message, ok: false };
  }
};
