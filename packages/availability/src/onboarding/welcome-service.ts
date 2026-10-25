import { assertTenantDb, type TenantDb } from "@repo/database";
import "server-only";

import type { Result } from "@repo/core";
import {
  completeWelcome,
  getWelcomeState,
} from "@repo/database/queries/onboarding";
import { isOnboardingAdmin } from "./wizard-service";

export interface WelcomeActor {
  accountId: string;
  actingRole: string | null | undefined;
  organisationId: string;
  userId: string;
}

// Only members with a linked person who have not yet seen the welcome are
// eligible. Owners and admins are covered by the setup wizard instead.
export async function loadWelcomeEligibility(
  actor: WelcomeActor,
  db: TenantDb
): Promise<Result<{ eligible: boolean; personId: string | null }>> {
  assertTenantDb(db, actor.accountId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof loadWelcomeEligibility> => {
    if (isOnboardingAdmin(actor.actingRole)) {
      return { ok: true, value: { eligible: false, personId: null } };
    }
    const state = await getWelcomeState(
      actor.accountId,
      actor.organisationId,
      actor.userId,
      client
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
  };
  return await (async () => {
    assertTenantDb(db, actor.accountId);
    return await run(db);
  })();
}

export async function completeMemberWelcome(
  actor: WelcomeActor,
  db: TenantDb
): Promise<Result<void>> {
  assertTenantDb(db, actor.accountId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof completeMemberWelcome> => {
    const state = await getWelcomeState(
      actor.accountId,
      actor.organisationId,
      actor.userId,
      client
    );
    if (!state.ok) {
      return state;
    }
    if (!state.value) {
      return {
        error: {
          code: "not_found",
          message: "Your account is not linked yet.",
        },
        ok: false,
      };
    }
    return await completeWelcome(
      actor.accountId,
      actor.organisationId,
      state.value.personId,
      actor.userId,
      client
    );
  };
  return await (async () => {
    assertTenantDb(db, actor.accountId);
    return await run(db);
  })();
}
