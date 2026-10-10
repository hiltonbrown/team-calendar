"use server";

import { auth, currentUser } from "@repo/auth/server";
import { completeMemberWelcome } from "@repo/availability";
import type { Result } from "@repo/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
import { captureOnboardingEvent } from "@/lib/server/onboarding-analytics";

const CompleteWelcomeSchema = z.object({
  organisationId: z.string().uuid(),
  skipped: z.boolean(),
});

type WelcomeActionError =
  | { code: "not_authorised"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

// Marks the member welcome as seen, whether finished or skipped, so it is
// shown once only.
export async function completeWelcomeAction(
  input: z.input<typeof CompleteWelcomeSchema>
): Promise<Result<{ redirectTo: "/" }, WelcomeActionError>> {
  const parsed = CompleteWelcomeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: { code: "validation_error", message: "Invalid request." },
      ok: false,
    };
  }
  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(parsed.data.organisationId),
  ]);
  if (!(user && orgRole && context.ok)) {
    return {
      error: { code: "not_authorised", message: "Sign in to continue." },
      ok: false,
    };
  }
  const completed = await completeMemberWelcome({
    actingRole: orgRole,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
    userId: user.id,
  });
  if (!completed.ok) {
    return {
      error: { code: "unknown_error", message: "Could not save. Try again." },
      ok: false,
    };
  }
  await captureOnboardingEvent({
    distinctId: user.id,
    event: "Member Welcome Completed",
    properties: { skipped: parsed.data.skipped },
  });
  revalidatePath("/", "layout");
  return { ok: true, value: { redirectTo: "/" } };
}
