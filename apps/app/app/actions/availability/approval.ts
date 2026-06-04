"use server";

import { currentUser } from "@repo/auth/server";
import { updateAvailabilityApprovalStatus } from "@repo/availability";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const ApprovalActionSchema = z.object({
  approvalStatus: z.enum(["approved", "declined"]),
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

export type ApprovalActionResult = { ok: true } | { ok: false; error: string };

export async function updateAvailabilityApprovalAction(
  input: z.infer<typeof ApprovalActionSchema>
): Promise<ApprovalActionResult> {
  const parsed = ApprovalActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid approval request" };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { ok: false, error: contextResult.error.message };
  }

  const user = await currentUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  const result = await updateAvailabilityApprovalStatus(
    contextResult.value,
    parsed.data.recordId,
    parsed.data.approvalStatus,
    user.id
  );

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  for (const path of ["/", "/leave-approvals", "/calendar", "/people"]) {
    revalidatePath(path);
  }

  return { ok: true };
}
