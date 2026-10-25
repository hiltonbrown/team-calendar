"use server";

import { inviteAccountMember } from "@repo/auth/accounts";
import { hasPermission as can } from "@repo/auth/permissions";

import { getSession } from "@repo/auth/server";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";

const InviteMemberSchema = z.object({
  emailAddress: z.string().email("Invalid email address"),
  role: z.enum(["owner", "admin", "manager", "viewer"]),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const inviteMember = async (input: unknown): Promise<Result<void>> => {
  assertNoTenantTransaction("inviteMember");
  const {
    accountId: sessionAccountId,
    role: sessionRole,
    userId,
  } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };

  if (!(sessionAccountId && userId)) {
    return { error: "Not authenticated", ok: false };
  }
  if (!can(sessionRole, { invitation: ["create"] })) {
    return { error: "You do not have permission to manage members", ok: false };
  }

  const parsed = InviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      ok: false,
    };
  }
  if (
    parsed.data.role === "owner" &&
    !can(sessionRole, { ownership: ["manage"] })
  ) {
    return { error: "Only owners can invite another owner", ok: false };
  }

  try {
    await inviteAccountMember({
      accountId: sessionAccountId,
      email: parsed.data.emailAddress,
      inviterUserId: userId,
      role: parsed.data.role,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send invitation";
    return { error: message, ok: false };
  }
};
