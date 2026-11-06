import type { Result } from "@repo/core";
import { appError } from "@repo/core";
import { assertTenantDb, type TenantDb } from "../tenant-db";

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

const scope = (accountId: string, organisationId: string) => ({
  account_id: accountId,
  archived_at: null,
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
  accountId: string,
  organisationId: string,
  db: TenantDb
): Promise<Result<OnboardingRecord>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb = db;

    try {
      const organisation = await tenantDb.organisation.findFirst({
        select: {
          onboarding_completed_at: true,
          onboarding_step: true,
          xero_setup_skipped_at: true,
        },
        where: scope(accountId, organisationId),
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
    } catch (error) {
      if (tenantDb) {
        throw error;
      }
      return internal("Failed to load onboarding progress.");
    }
  }
}

// Conditional on the stored step, so two tabs or admins advancing at once
// move the wizard forward exactly once.
export async function advanceOnboardingStep(
  accountId: string,
  organisationId: string,
  from: OnboardingStep,
  to: OnboardingStep,
  db: TenantDb
): Promise<Result<{ advanced: boolean }>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb2 = db;

    try {
      const updated = await tenantDb2.organisation.updateMany({
        data: { onboarding_step: to },
        where: {
          ...scope(accountId, organisationId),
          onboarding_step: from,
        },
      });
      return { ok: true, value: { advanced: updated.count > 0 } };
    } catch (error) {
      if (tenantDb2) {
        throw error;
      }
      return internal("Failed to save onboarding progress.");
    }
  }
}

export async function setXeroSetupSkipped(
  accountId: string,
  organisationId: string,
  skipped: boolean,
  db: TenantDb
): Promise<Result<void>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb3 = db;

    try {
      await tenantDb3.organisation.updateMany({
        data: { xero_setup_skipped_at: skipped ? new Date() : null },
        where: scope(accountId, organisationId),
      });
      return { ok: true, value: undefined };
    } catch (error) {
      if (tenantDb3) {
        throw error;
      }
      return internal("Failed to save the Xero setup choice.");
    }
  }
}

export async function completeOnboarding(
  accountId: string,
  organisationId: string,
  db: TenantDb
): Promise<Result<{ completedAt: Date }>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb4 = db;

    try {
      await tenantDb4.organisation.updateMany({
        data: {
          onboarding_completed_at: new Date(),
          onboarding_step: "finish",
        },
        where: {
          ...scope(accountId, organisationId),
          onboarding_completed_at: null,
        },
      });
      const record = await getOnboardingRecord(
        accountId,
        organisationId,
        tenantDb4
      );
      if (!record.ok) {
        return record;
      }
      if (!record.value.completedAt) {
        return internal("Failed to complete onboarding.");
      }
      return { ok: true, value: { completedAt: record.value.completedAt } };
    } catch (error) {
      if (tenantDb4) {
        throw error;
      }
      return internal("Failed to complete onboarding.");
    }
  }
}

export async function getWelcomeState(
  accountId: string,
  organisationId: string,
  userId: string,
  db: TenantDb
): Promise<Result<{ completedAt: Date | null; personId: string } | null>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb5 = db;

    try {
      const person = await tenantDb5.person.findFirst({
        select: { id: true, welcome_completed_at: true },
        where: {
          account_id: accountId,
          archived_at: null,
          organisation_id: organisationId,
          user_id: userId,
        },
      });
      return {
        ok: true,
        value: person
          ? { completedAt: person.welcome_completed_at, personId: person.id }
          : null,
      };
    } catch (error) {
      if (tenantDb5) {
        throw error;
      }
      return internal("Failed to load the welcome state.");
    }
  }
}

export async function completeWelcome(
  accountId: string,
  organisationId: string,
  personId: string,
  userId: string,
  db: TenantDb
): Promise<Result<void>> {
  {
    assertTenantDb(db, accountId);
    const tenantDb6 = db;

    try {
      const updated = await tenantDb6.person.updateMany({
        data: { welcome_completed_at: new Date() },
        where: {
          account_id: accountId,
          archived_at: null,
          id: personId,
          organisation_id: organisationId,
          user_id: userId,
          welcome_completed_at: null,
        },
      });
      if (updated.count > 0) {
        return { ok: true, value: undefined };
      }
      const state = await getWelcomeState(
        accountId,
        organisationId,
        userId,
        tenantDb6
      );
      if (state.ok && state.value?.personId === personId) {
        return { ok: true, value: undefined };
      }
      return {
        error: appError("not_found", "Person not found."),
        ok: false,
      };
    } catch (error) {
      if (tenantDb6) {
        throw error;
      }
      return internal("Failed to save the welcome state.");
    }
  }
}
