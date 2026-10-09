"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  advanceWizard,
  finishWizard,
  isOnboardingAdmin,
  type WizardActor,
  type WizardError,
  type WizardSnapshot,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { setXeroSetupSkipped } from "@repo/database/queries/onboarding";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateOrganisationAction } from "@/app/(authenticated)/settings/general/_actions";
import { connectXeroAction } from "@/app/(authenticated)/settings/integrations/xero/_actions";
import { AU_TIMEZONE_VALUES } from "@/lib/onboarding/au-timezones";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
import { captureOnboardingEvent } from "@/lib/server/onboarding-analytics";

type ActionError = WizardError | { code: "validation_error"; message: string };

export type OnboardingActionResult<T> = Result<T, ActionError>;

const OrganisationInput = z.object({ organisationId: z.string().uuid() });
const StepSchema = z.enum(["details", "xero", "people", "invites", "finish"]);

const DetailsSchema = OrganisationInput.extend({
  name: z.string().trim().min(1, "Enter your organisation name.").max(128),
  timezone: z.enum(AU_TIMEZONE_VALUES, {
    message: "Choose an Australian timezone.",
  }),
});

export async function saveDetailsAction(
  input: z.input<typeof DetailsSchema>
): Promise<OnboardingActionResult<WizardSnapshot>> {
  const parsed = DetailsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveWizardActor(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  // Reuses the General settings path so the change is validated and audited
  // the same way.
  const saved = await updateOrganisationAction({
    name: parsed.data.name,
    organisationId: parsed.data.organisationId,
    timezone: parsed.data.timezone,
  });
  if (!saved.ok) {
    return { error: saved.error, ok: false };
  }
  return await advance(actor.value, "details");
}

export async function startXeroFromOnboardingAction(
  input: z.input<typeof OrganisationInput>
): Promise<OnboardingActionResult<{ redirectUrl: string }>> {
  const parsed = OrganisationInput.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardActor(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const result = await connectXeroAction({
    organisationId: parsed.data.organisationId,
    returnTo: "/onboarding",
  });
  return result.ok ? result : { error: result.error, ok: false };
}

export async function skipXeroAction(
  input: z.input<typeof OrganisationInput>
): Promise<OnboardingActionResult<WizardSnapshot>> {
  const parsed = OrganisationInput.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardActor(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const skipped = await setXeroSetupSkipped(
    actor.value.clerkOrgId,
    actor.value.organisationId,
    true
  );
  if (!skipped.ok) {
    return unknownError(skipped.error.message);
  }
  return await advance(actor.value, "xero");
}

const AdvanceSchema = OrganisationInput.extend({ from: StepSchema });

export async function advanceStepAction(
  input: z.input<typeof AdvanceSchema>
): Promise<OnboardingActionResult<WizardSnapshot>> {
  const parsed = AdvanceSchema.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardActor(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  return await advance(actor.value, parsed.data.from);
}

const FinishSchema = OrganisationInput.extend({ force: z.boolean() });

export async function finishAction(
  input: z.input<typeof FinishSchema>
): Promise<OnboardingActionResult<{ redirectTo: "/calendar" }>> {
  const parsed = FinishSchema.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardActor(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const result = await finishWizard(actor.value, { force: parsed.data.force });
  if (!result.ok) {
    return result;
  }
  await captureOnboardingEvent({
    distinctId: actor.value.userId,
    event: "Onboarding Completed",
    properties: {
      forced: parsed.data.force,
      mode: result.value.snapshot.mode,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, value: { redirectTo: result.value.redirectTo } };
}

async function advance(
  actor: WizardActor,
  from: z.infer<typeof StepSchema>
): Promise<OnboardingActionResult<WizardSnapshot>> {
  const result = await advanceWizard(actor, from);
  if (!result.ok) {
    return result;
  }
  await captureOnboardingEvent({
    distinctId: actor.userId,
    event: "Onboarding Step Completed",
    properties: { mode: result.value.mode, step: from },
  });
  revalidatePath("/onboarding");
  return result;
}

async function resolveWizardActor(
  organisationId: string
): Promise<OnboardingActionResult<WizardActor>> {
  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
  ]);
  if (!(user && context.ok && isOnboardingAdmin(orgRole))) {
    return {
      error: {
        code: "not_authorised",
        message: "Only owners and admins can set up the organisation.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: {
      actingRole: orgRole,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      userId: user.id,
    },
  };
}

function validationError(message?: string): OnboardingActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Check the details and try again.",
    },
    ok: false,
  };
}

function unknownError(message: string): OnboardingActionResult<never> {
  return { error: { code: "unknown_error", message }, ok: false };
}
