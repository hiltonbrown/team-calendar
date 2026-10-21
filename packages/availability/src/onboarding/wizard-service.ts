import { assertTenantDb, type TenantDb } from "@repo/database";
import "server-only";

import type { Result } from "@repo/core";
import {
  advanceOnboardingStep,
  completeOnboarding,
  type OnboardingStep,
} from "@repo/database/queries/onboarding";
import {
  buildSnapshot,
  canFinish,
  isStepComplete,
  nextStep,
  stepIndex,
  type WizardSnapshot,
} from "./wizard-rules";
import { loadWizardInputs, type WizardContext } from "./wizard-state";

export type WizardError =
  | { code: "not_authorised"; message: string }
  | { code: "stale_step"; message: string }
  | { code: "step_incomplete"; message: string }
  | { code: "unknown_error"; message: string };

export interface WizardActor extends WizardContext {
  actingRole: string | null | undefined;
}

const ADMIN_ROLES = new Set(["admin", "org:admin", "org:owner", "owner"]);

export function isOnboardingAdmin(role: string | null | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.has(role));
}

const STEP_INCOMPLETE_MESSAGES: Record<OnboardingStep, string> = {
  details: "Choose an Australian timezone to continue.",
  finish: "Your calendar opens when leave has been imported.",
  invites: "Send or skip invitations to continue.",
  people: "Finish the people review and confirm your own record to continue.",
  xero: "Connect Xero Payroll or choose to set up without Xero.",
};

export async function loadWizardSnapshot(
  actor: WizardActor,
  db: TenantDb
): Promise<Result<WizardSnapshot, WizardError>> {
  assertTenantDb(db, actor.clerkOrgId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof loadWizardSnapshot> => {
    if (!isOnboardingAdmin(actor.actingRole)) {
      return notAuthorised();
    }
    const inputs = await loadWizardInputs(actor, client);
    if (!inputs.ok) {
      return unknownError(inputs.error.message);
    }
    return { ok: true, value: buildSnapshot(inputs.value) };
  };
  return await (async () => {
    assertTenantDb(db, actor.clerkOrgId);
    return await run(db);
  })();
}

// Advances from `from` only when the server-side rule for that step holds.
// A stale tab that is behind the stored step gets the current snapshot.
export async function advanceWizard(
  actor: WizardActor,
  from: OnboardingStep,
  db: TenantDb
): Promise<Result<WizardSnapshot, WizardError>> {
  assertTenantDb(db, actor.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof advanceWizard> => {
    const current = await loadWizardSnapshot(actor, client);
    if (!current.ok) {
      return current;
    }
    const snapshot = current.value;
    if (snapshot.completed || stepIndex(from) < stepIndex(snapshot.step)) {
      return current;
    }
    if (stepIndex(from) > stepIndex(snapshot.step) || from === "finish") {
      return {
        error: {
          code: "stale_step",
          message: "Setup has moved on. Refresh to continue.",
        },
        ok: false,
      };
    }
    if (!isStepComplete(from, snapshot)) {
      return {
        error: {
          code: "step_incomplete",
          message: STEP_INCOMPLETE_MESSAGES[from],
        },
        ok: false,
      };
    }
    const advanced = await advanceOnboardingStep(
      actor.clerkOrgId,
      actor.organisationId,
      from,
      nextStep(from),
      client
    );
    if (!advanced.ok) {
      return unknownError(advanced.error.message);
    }
    return await loadWizardSnapshot(actor, client);
  };
  return await (async () => {
    assertTenantDb(db, actor.clerkOrgId);
    return await run(db);
  })();
}

export async function finishWizard(
  actor: WizardActor,
  options: { force: boolean },
  db: TenantDb
): Promise<
  Result<{ redirectTo: "/calendar"; snapshot: WizardSnapshot }, WizardError>
> {
  assertTenantDb(db, actor.clerkOrgId);
  const run = async (client: TenantDb): ReturnType<typeof finishWizard> => {
    const current = await loadWizardSnapshot(actor, client);
    if (!current.ok) {
      return current;
    }
    const snapshot = current.value;
    if (!snapshot.completed) {
      if (snapshot.step !== "finish") {
        return {
          error: {
            code: "stale_step",
            message: "Finish the earlier setup steps first.",
          },
          ok: false,
        };
      }
      if (!canFinish(snapshot, options)) {
        return {
          error: {
            code: "step_incomplete",
            message: STEP_INCOMPLETE_MESSAGES.finish,
          },
          ok: false,
        };
      }
      const completed = await completeOnboarding(
        actor.clerkOrgId,
        actor.organisationId,
        client
      );
      if (!completed.ok) {
        return unknownError(completed.error.message);
      }
    }
    return {
      ok: true,
      value: {
        redirectTo: "/calendar",
        snapshot: { ...snapshot, completed: true },
      },
    };
  };
  return await (async () => {
    assertTenantDb(db, actor.clerkOrgId);
    return await run(db);
  })();
}

function notAuthorised(): Result<never, WizardError> {
  return {
    error: {
      code: "not_authorised",
      message: "Only owners and admins can set up the organisation.",
    },
    ok: false,
  };
}

function unknownError(message: string): Result<never, WizardError> {
  return { error: { code: "unknown_error", message }, ok: false };
}
