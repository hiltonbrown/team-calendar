import "server-only";

import type { Result } from "@repo/core";
import {
  completeWelcome,
  getWelcomeState,
} from "@repo/database/queries/onboarding";
import { isOnboardingAdmin } from "./wizard-service";

export interface WelcomeActor {
  actingRole: string | null | undefined;
  clerkOrgId: string;
  organisationId: string;
  userId: string;
}

// Only members with a linked person who have not yet seen the welcome are
// eligible. Owners and admins are covered by the setup wizard instead.
export async function loadWelcomeEligibility(
  actor: WelcomeActor
): Promise<Result<{ eligible: boolean; personId: string | null }>> {
  if (isOnboardingAdmin(actor.actingRole)) {
    return { ok: true, value: { eligible: false, personId: null } };
  }
  const state = await getWelcomeState(
    actor.clerkOrgId,
    actor.organisationId,
    actor.userId
  );
  if (!state.ok) {
    return state;
  }
  return {
    ok: true,
    value: {
      eligible: Boolean(state.value && !state.value.completedAt),
      personId: state.value?.personId ?? null,
    },
  };
}

export async function completeMemberWelcome(
  actor: WelcomeActor
): Promise<Result<void>> {
  const state = await getWelcomeState(
    actor.clerkOrgId,
    actor.organisationId,
    actor.userId
  );
  if (!state.ok) {
    return state;
  }
  if (!state.value) {
    return {
      error: { code: "not_found", message: "Your account is not linked yet." },
      ok: false,
    };
  }
  return await completeWelcome(
    actor.clerkOrgId,
    actor.organisationId,
    state.value.personId,
    actor.userId
  );
}
