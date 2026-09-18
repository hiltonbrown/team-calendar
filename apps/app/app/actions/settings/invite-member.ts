"use server";

import { auth, clerkClient } from "@repo/auth/server";
import { z } from "zod";

const InviteMemberSchema = z.object({
  emailAddress: z.string().email("Invalid email address"),
  role: z.enum(["org:owner", "org:admin", "org:manager", "org:viewer"]),
});

type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const inviteMember = async (input: unknown): Promise<Result<void>> => {
  const { orgId, orgRole, userId } = await auth();

  if (!(orgId && userId)) {
    return { error: "Not authenticated", ok: false };
  }
  if (orgRole !== "org:owner" && orgRole !== "org:admin") {
    return { error: "You do not have permission to manage members", ok: false };
  }

  const parsed = InviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      ok: false,
    };
  }
  if (parsed.data.role === "org:owner" && orgRole !== "org:owner") {
    return { error: "Only owners can invite another owner", ok: false };
  }

  try {
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      emailAddress: parsed.data.emailAddress,
      inviterUserId: userId,
      organizationId: orgId,
      role: parsed.data.role,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send invitation";
    return { error: message, ok: false };
  }
};
