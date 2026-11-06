"use server";

import { getCurrentUser, getSession } from "@repo/auth/server";
import {
  advanceWizard,
  ensureCurrentUserPerson,
  finishWizard,
  isOnboardingAdmin,
  type WizardActor,
  type WizardError,
  type WizardSnapshot,
} from "@repo/availability";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import {
  afterTenantCommit,
  lockPlanLimitMutations,
  type TenantDb,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import { setXeroSetupSkipped } from "@repo/database/queries/onboarding";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateOrganisationAction } from "@/app/(authenticated)/settings/general/_actions";
import { connectXeroAction } from "@/app/(authenticated)/settings/integrations/xero/_actions";
import { inviteMember } from "@/app/actions/settings/invite-member";
import { AU_TIMEZONE_VALUES } from "@/lib/onboarding/au-timezones";
import { createManualPerson } from "@/lib/server/create-manual-person";
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
  assertNoTenantTransaction("saveDetailsAction");
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
  assertNoTenantTransaction("startXeroFromOnboardingAction");
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
  assertNoTenantTransaction("skipXeroAction");
  const parsed = OrganisationInput.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardIdentity(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const result = await runWizardMutation(actor.value, async (db) => {
    const skipped = await setXeroSetupSkipped(
      actor.value.accountId,
      actor.value.organisationId,
      true,
      db
    );
    if (!skipped.ok) {
      return unknownError(skipped.error.message);
    }
    return advanceWizard(actor.value, "xero", db);
  });
  if (result.ok) {
    await captureOnboardingEvent({
      distinctId: actor.value.userId,
      event: "Onboarding Step Completed",
      properties: { mode: result.value.mode, step: "xero" },
    });
    revalidatePath("/onboarding");
  }
  return result;
}

const AdvanceSchema = OrganisationInput.extend({ from: StepSchema });

export async function advanceStepAction(
  input: z.input<typeof AdvanceSchema>
): Promise<OnboardingActionResult<WizardSnapshot>> {
  assertNoTenantTransaction("advanceStepAction");
  const parsed = AdvanceSchema.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardIdentity(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  return await advance(actor.value, parsed.data.from);
}

const LinkSelfSchema = OrganisationInput.extend({
  personId: z.string().uuid(),
});

// Links the acting admin to an existing unlinked person, for when their
// Xero record uses a different email from their sign-in.
export async function linkSelfAction(
  input: z.input<typeof LinkSelfSchema>
): Promise<OnboardingActionResult<{ personId: string }>> {
  assertNoTenantTransaction("linkSelfAction");
  const parsed = LinkSelfSchema.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardIdentity(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const scope = {
    account_id: actor.value.accountId,
    archived_at: null,
    organisation_id: actor.value.organisationId,
  };
  return runWizardMutation(
    actor.value,
    async (db): ReturnType<typeof linkSelfAction> => {
      await lockPlanLimitMutations(actor.value.accountId, db);

      const alreadyLinked = await db.person.findFirst({
        select: { id: true },
        where: {
          account_id: actor.value.accountId,
          archived_at: null,
          organisation: {
            account_id: actor.value.accountId,
            archived_at: null,
          },
          user_id: actor.value.userId,
        },
      });
      if (alreadyLinked) {
        return validationError("Your account is already linked to a person.");
      }
      const linked = await db.person.updateMany({
        data: { user_id: actor.value.userId },
        where: { ...scope, id: parsed.data.personId, user_id: null },
      });
      if (linked.count === 0) {
        return validationError(
          "That person is already linked to another account. Choose someone else."
        );
      }
      await db.auditEvent.create({
        data: {
          account_id: actor.value.accountId,
          action: "person.linked_to_user",
          actor_user_id: actor.value.userId,
          metadata: { source: "onboarding" },
          organisation_id: actor.value.organisationId,
          resource_id: parsed.data.personId,
          resource_type: "person",
        },
      });
      afterTenantCommit(db, () => {
        revalidatePath("/onboarding");

        return Promise.resolve();
      });
      return { ok: true, value: { personId: parsed.data.personId } };
    }
  );
}

// Links by matching email, or creates the admin's own person record.
export async function createSelfAction(
  input: z.input<typeof OrganisationInput>
): Promise<OnboardingActionResult<{ personId: string }>> {
  assertNoTenantTransaction("createSelfAction");
  const parsed = OrganisationInput.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardIdentity(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const user = await getCurrentUser();
  if (!user) {
    return validationError();
  }
  return runWizardMutation(
    actor.value,
    async (db): ReturnType<typeof createSelfAction> => {
      const person = await ensureCurrentUserPerson(
        {
          accountId: actor.value.accountId as AccountId,
          organisationId: actor.value.organisationId as OrganisationId,
        },
        {
          avatarUrl: user.image,
          displayName: user.name || user.email || user.id,
          email: user.email,
          userId: user.id,
        },
        db
      );
      if (!person.ok) {
        return unknownError(person.error.message);
      }
      afterTenantCommit(db, () => {
        revalidatePath("/onboarding");

        return Promise.resolve();
      });
      return { ok: true, value: { personId: person.value.id } };
    }
  );
}

const AddPersonSchema = OrganisationInput.extend({
  email: z.string().trim().email("Enter a valid email address.").max(256),
  firstName: z.string().trim().min(1, "Enter a first name.").max(128),
  lastName: z.string().trim().min(1, "Enter a last name.").max(128),
});

export async function addPersonAction(
  input: z.input<typeof AddPersonSchema>
): Promise<OnboardingActionResult<{ personId: string }>> {
  assertNoTenantTransaction("addPersonAction");
  const parsed = AddPersonSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveWizardIdentity(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  return runWizardMutation(
    actor.value,
    async (db): ReturnType<typeof addPersonAction> => {
      const created = await createManualPerson(
        {
          accountId: actor.value.accountId as AccountId,
          email: parsed.data.email,
          employmentType: "employee",
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          organisationId: actor.value.organisationId as OrganisationId,
        },
        db
      );
      if (!created.ok) {
        return { error: created.error, ok: false };
      }
      afterTenantCommit(db, () => {
        revalidatePath("/onboarding");

        return Promise.resolve();
      });
      return created;
    }
  );
}

const InviteRowsSchema = OrganisationInput.extend({
  rows: z
    .array(
      z.object({
        email: z.string().trim().email(),
        role: z.enum(["admin", "manager", "viewer"]),
      })
    )
    .min(1, "Choose at least one person to invite.")
    .max(200),
});

export interface InviteOutcome {
  email: string;
  ok: boolean;
  reason?: string;
}

// Sends each invitation independently, so one failure never stops the rest.
// Reasons are plain copy; provider messages are not shown.
export async function sendInvitesAction(
  input: z.input<typeof InviteRowsSchema>
): Promise<OnboardingActionResult<{ results: InviteOutcome[] }>> {
  assertNoTenantTransaction("sendInvitesAction");
  const parsed = InviteRowsSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveWizardActor(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const results: InviteOutcome[] = [];
  for (const row of parsed.data.rows) {
    const sent = await inviteMember({
      emailAddress: row.email,
      role: row.role,
    });
    results.push(
      sent.ok
        ? { email: row.email, ok: true }
        : {
            email: row.email,
            ok: false,
            reason: inviteFailureReason(sent.error),
          }
    );
  }
  return { ok: true, value: { results } };
}

const ALREADY_INVITED = /already/i;

function inviteFailureReason(message: string): string {
  return ALREADY_INVITED.test(message)
    ? "Already invited or already a member."
    : "This invitation could not be sent. Try again later.";
}

const FinishSchema = OrganisationInput.extend({ force: z.boolean() });

export async function finishAction(
  input: z.input<typeof FinishSchema>
): Promise<OnboardingActionResult<{ redirectTo: "/calendar" }>> {
  assertNoTenantTransaction("finishAction");
  const parsed = FinishSchema.safeParse(input);
  if (!parsed.success) {
    return validationError();
  }
  const actor = await resolveWizardIdentity(parsed.data.organisationId);
  if (!actor.ok) {
    return actor;
  }
  const result = await runWizardMutation(actor.value, (db) =>
    finishWizard(actor.value, { force: parsed.data.force }, db)
  );
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
  const result = await runWizardMutation(actor, (db) =>
    advanceWizard(actor, from, db)
  );
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

async function resolveWizardIdentity(
  organisationId: string
): Promise<OnboardingActionResult<WizardActor>> {
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
  if (!(sessionAccountId && user && isOnboardingAdmin(sessionRole))) {
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
      accountId: sessionAccountId,
      actingRole: sessionRole,
      organisationId,
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

async function runWizardMutation<T>(
  actor: WizardActor,
  run: (db: TenantDb) => Promise<OnboardingActionResult<T>>
): Promise<OnboardingActionResult<T>> {
  try {
    return await withTenantResult(
      actor.accountId,
      async (db): Promise<OnboardingActionResult<T>> => {
        const company = await getOrganisationById(
          actor.accountId as AccountId,
          actor.organisationId as OrganisationId,
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
        return run(db);
      }
    );
  } catch {
    return unknownError("Could not save setup progress. Try again.");
  }
}
async function resolveWizardActor(
  organisationId: string
): Promise<OnboardingActionResult<WizardActor>> {
  const identity = await resolveWizardIdentity(organisationId);
  if (!identity.ok) {
    return identity;
  }
  try {
    return await withTenantDb(
      identity.value.accountId,
      async (db): Promise<OnboardingActionResult<WizardActor>> => {
        const company = await getOrganisationById(
          identity.value.accountId as AccountId,
          organisationId as OrganisationId,
          db
        );
        return company.ok
          ? identity
          : {
              error: {
                code: "not_authorised",
                message: "Organisation not found.",
              },
              ok: false,
            };
      }
    );
  } catch {
    return unknownError("Could not load setup context.");
  }
}
