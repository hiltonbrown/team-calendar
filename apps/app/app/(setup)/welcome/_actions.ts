"use server";

import { getCurrentUser, getSession } from "@repo/auth/server";
import { completeMemberWelcome } from "@repo/availability";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import { withTenantResult } from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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
  assertNoTenantTransaction("completeWelcomeAction");
  const parsed = CompleteWelcomeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: { code: "validation_error", message: "Invalid request." },
      ok: false,
    };
  }
  const [{ accountId: sessionAccountId, role: sessionRole }, user] =
    await Promise.all([
      getSession().then(
        (currentSession) =>
          currentSession ?? {
            accountId: null,
            role: null,
            sessionId: null,
            userId: null,
          }
      ),
      getCurrentUser(),
    ]);
  if (!(sessionAccountId && user && sessionRole)) {
    return {
      error: { code: "not_authorised", message: "Sign in to continue." },
      ok: false,
    };
  }
  const accountId = sessionAccountId as AccountId;
  let completed: Result<void, WelcomeActionError>;
  try {
    completed = await withTenantResult(
      accountId,
      async (db): Promise<Result<void, WelcomeActionError>> => {
        const company = await getOrganisationById(
          accountId,
          parsed.data.organisationId as OrganisationId,
          db
        );
        if (!company.ok) {
          return {
            error: {
              code: "not_authorised",
              message: "Organisation not found.",
            },
            ok: false,
          };
        }
        const saved = await completeMemberWelcome(
          {
            accountId,
            actingRole: sessionRole,
            organisationId: company.value.id,
            userId: user.id,
          },
          db
        );
        return saved.ok ? { ok: true, value: undefined } : welcomeSaveError();
      }
    );
  } catch {
    return welcomeSaveError();
  }
  if (!completed.ok) {
    return completed;
  }
  await captureOnboardingEvent({
    distinctId: user.id,
    event: "Member Welcome Completed",
    properties: { skipped: parsed.data.skipped },
  });
  revalidatePath("/", "layout");
  return { ok: true, value: { redirectTo: "/" } };
}

function welcomeSaveError(): Result<never, WelcomeActionError> {
  return {
    error: { code: "unknown_error", message: "Could not save. Try again." },
    ok: false,
  };
}
