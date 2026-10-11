import type { Result } from "@repo/core";
import { appError } from "@repo/core";
import { tenantDatabase } from "../tenant-client";

export type OnboardingStep =
  | "details"
  | "finish"
  | "invites"
  | "people"
  | "xero";

export const ONBOARDING_STEPS = [
  "details",
  "xero",
  "people",
  "invites",
  "finish",
] as const satisfies readonly OnboardingStep[];

export interface OnboardingRecord {
  completedAt: Date | null;
  step: OnboardingStep;
  xeroSkippedAt: Date | null;
}

const scope = (clerkOrgId: string, organisationId: string) => ({
  archived_at: null,
  clerk_org_id: clerkOrgId,
  id: organisationId,
});

const notFound = <T>(): Result<T> => ({
  error: appError("not_found", "Organisation not found."),
  ok: false,
});

const internal = <T>(message: string): Result<T> => ({
  error: appError("internal", message),
  ok: false,
});

export async function getOnboardingRecord(
  clerkOrgId: string,
  organisationId: string
): Promise<Result<OnboardingRecord>> {
  try {
    const organisation = await tenantDatabase(
      clerkOrgId
    ).organisation.findFirst({
      select: {
        onboarding_completed_at: true,
        onboarding_step: true,
        xero_setup_skipped_at: true,
      },
      where: scope(clerkOrgId, organisationId),
    });
    if (!organisation) {
      return notFound();
    }
    return {
      ok: true,
      value: {
        completedAt: organisation.onboarding_completed_at,
        step: organisation.onboarding_step,
        xeroSkippedAt: organisation.xero_setup_skipped_at,
      },
    };
  } catch {
    return internal("Failed to load onboarding progress.");
  }
}

// Conditional on the stored step, so two tabs or admins advancing at once
// move the wizard forward exactly once.
export async function advanceOnboardingStep(
  clerkOrgId: string,
  organisationId: string,
  from: OnboardingStep,
  to: OnboardingStep
): Promise<Result<{ advanced: boolean }>> {
  try {
    const updated = await tenantDatabase(clerkOrgId).organisation.updateMany({
      data: { onboarding_step: to },
      where: { ...scope(clerkOrgId, organisationId), onboarding_step: from },
    });
    return { ok: true, value: { advanced: updated.count > 0 } };
  } catch {
    return internal("Failed to save onboarding progress.");
  }
}

export async function setXeroSetupSkipped(
  clerkOrgId: string,
  organisationId: string,
  skipped: boolean
): Promise<Result<void>> {
  try {
    await tenantDatabase(clerkOrgId).organisation.updateMany({
      data: { xero_setup_skipped_at: skipped ? new Date() : null },
      where: scope(clerkOrgId, organisationId),
    });
    return { ok: true, value: undefined };
  } catch {
    return internal("Failed to save the Xero setup choice.");
  }
}

export async function completeOnboarding(
  clerkOrgId: string,
  organisationId: string
): Promise<Result<{ completedAt: Date }>> {
  try {
    await tenantDatabase(clerkOrgId).organisation.updateMany({
      data: { onboarding_completed_at: new Date(), onboarding_step: "finish" },
      where: {
        ...scope(clerkOrgId, organisationId),
        onboarding_completed_at: null,
      },
    });
    const record = await getOnboardingRecord(clerkOrgId, organisationId);
    if (!record.ok) {
      return record;
    }
    if (!record.value.completedAt) {
      return internal("Failed to complete onboarding.");
    }
    return { ok: true, value: { completedAt: record.value.completedAt } };
  } catch {
    return internal("Failed to complete onboarding.");
  }
}

export async function getWelcomeState(
  clerkOrgId: string,
  organisationId: string,
  clerkUserId: string
): Promise<Result<{ completedAt: Date | null; personId: string } | null>> {
  try {
    const person = await tenantDatabase(clerkOrgId).person.findFirst({
      select: { id: true, welcome_completed_at: true },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        clerk_user_id: clerkUserId,
        organisation_id: organisationId,
      },
    });
    return {
      ok: true,
      value: person
        ? { completedAt: person.welcome_completed_at, personId: person.id }
        : null,
    };
  } catch {
    return internal("Failed to load the welcome state.");
  }
}

export async function completeWelcome(
  clerkOrgId: string,
  organisationId: string,
  personId: string,
  clerkUserId: string
): Promise<Result<void>> {
  try {
    const updated = await tenantDatabase(clerkOrgId).person.updateMany({
      data: { welcome_completed_at: new Date() },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        clerk_user_id: clerkUserId,
        id: personId,
        organisation_id: organisationId,
        welcome_completed_at: null,
      },
    });
    if (updated.count > 0) {
      return { ok: true, value: undefined };
    }
    const state = await getWelcomeState(
      clerkOrgId,
      organisationId,
      clerkUserId
    );
    if (state.ok && state.value?.personId === personId) {
      return { ok: true, value: undefined };
    }
    return {
      error: appError("not_found", "Person not found."),
      ok: false,
    };
  } catch {
    return internal("Failed to save the welcome state.");
  }
}
