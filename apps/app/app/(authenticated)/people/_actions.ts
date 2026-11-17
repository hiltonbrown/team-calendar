"use server";

import { accountDirectory } from "@repo/auth/accounts";
import { hasPermission as can } from "@repo/auth/permissions";
import { getCurrentUser, getSession } from "@repo/auth/server";
import {
  type AccountAccessReviewResult,
  type AccountAccessServiceError,
  type AccountInvitationDispatchResult,
  type AlternativeContactServiceError,
  addAlternativeContact,
  type BalanceRefreshError,
  deleteAlternativeContact,
  getXeroConnectionStateForScope,
  loadAccountAccessReview,
  type ManagerAssignmentError,
  type ManualBalanceServiceError,
  type PeopleRole,
  prepareBalanceRefresh,
  recordBalanceRefreshDispatch,
  reorderAlternativeContacts,
  sendPreparedBalanceRefresh,
  inviteAccountAccessCandidates as serviceInviteAccountAccessCandidates,
  setManualLeaveBalance,
  setPersonManager,
  updateAlternativeContact,
} from "@repo/availability";
import type { AccountId, OrganisationId, Result } from "@repo/core";
import {
  afterTenantCommit,
  assertTenantDb,
  resolveAccountCompanies,
  scopedQuery,
  type TenantDb,
  withTenantDb,
  withTenantResult,
} from "@repo/database";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { syncXeroLeaveBalances } from "@repo/jobs";
import { revalidatePath } from "next/cache";
import {
  type AddAlternativeContactActionInput,
  AddAlternativeContactActionSchema,
  type DeleteAlternativeContactActionInput,
  DeleteAlternativeContactActionSchema,
  type InviteAccountAccessCandidatesInput,
  InviteAccountAccessCandidatesSchema,
  type LoadAccountAccessCandidatesInput,
  LoadAccountAccessCandidatesSchema,
  type RefreshBalancesActionInput,
  RefreshBalancesActionSchema,
  type ReorderAlternativeContactsActionInput,
  ReorderAlternativeContactsActionSchema,
  type SetManualBalanceActionInput,
  SetManualBalanceActionSchema,
  type UpdateAlternativeContactActionInput,
  UpdateAlternativeContactActionSchema,
} from "./_schemas";

export type PeopleActionError =
  | AlternativeContactServiceError
  | BalanceRefreshError
  | AccountAccessServiceError
  | ManualBalanceServiceError
  | {
      code: "not_authorised";
      message: string;
    }
  | {
      code: "validation_error";
      message: string;
    };
export type PeopleActionResult<T> = Result<T, PeopleActionError>;
export async function addAlternativeContactAction(
  input: AddAlternativeContactActionInput
): Promise<
  PeopleActionResult<{
    id: string;
  }>
> {
  assertNoTenantTransaction("addAlternativeContactAction");
  const parsed = AddAlternativeContactActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveAuthenticatedPeopleActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(actor.value.accountId, async (db) => {
      const context = await resolvePeopleActionContext(
        actor.value,
        parsed.data.organisationId,
        db
      );
      if (!context.ok) {
        return context;
      }
      const result = await addAlternativeContact(
        {
          accountId: context.value.accountId,
          actingPersonId: context.value.actingPersonId,
          actingRole: context.value.role,
          actingUserId: context.value.actingUserId,
          email: parsed.data.email,
          name: parsed.data.name,
          notes: parsed.data.notes,
          organisationId: context.value.organisationId,
          personId: parsed.data.personId,
          phone: parsed.data.phone,
          role: parsed.data.role,
        },
        db
      );
      if (!result.ok) {
        return result;
      }
      afterTenantCommit(db, async () =>
        revalidatePeoplePaths(parsed.data.personId)
      );
      return { ok: true, value: { id: result.value.id } };
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to save person changes.",
      },
      ok: false,
    };
  }
}
export async function updateAlternativeContactAction(
  input: UpdateAlternativeContactActionInput
): Promise<
  PeopleActionResult<{
    id: string;
  }>
> {
  assertNoTenantTransaction("updateAlternativeContactAction");
  const parsed = UpdateAlternativeContactActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveAuthenticatedPeopleActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(actor.value.accountId, async (db) => {
      const context = await resolvePeopleActionContext(
        actor.value,
        parsed.data.organisationId,
        db
      );
      if (!context.ok) {
        return context;
      }
      const personId = await resolveContactPersonId(
        context.value.accountId,
        context.value.organisationId,
        parsed.data.contactId,
        db
      );
      const result = await updateAlternativeContact(
        {
          accountId: context.value.accountId,
          actingPersonId: context.value.actingPersonId,
          actingRole: context.value.role,
          actingUserId: context.value.actingUserId,
          contactId: parsed.data.contactId,
          organisationId: context.value.organisationId,
          patch: parsed.data.patch,
        },
        db
      );
      if (!result.ok) {
        return result;
      }
      if (personId) {
        afterTenantCommit(db, async () => revalidatePeoplePaths(personId));
      } else {
        afterTenantCommit(db, async () => revalidatePath("/people"));
      }
      return { ok: true, value: { id: result.value.id } };
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to save person changes.",
      },
      ok: false,
    };
  }
}
export async function deleteAlternativeContactAction(
  input: DeleteAlternativeContactActionInput
): Promise<
  PeopleActionResult<{
    personId: string;
  }>
> {
  assertNoTenantTransaction("deleteAlternativeContactAction");
  const parsed = DeleteAlternativeContactActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveAuthenticatedPeopleActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(actor.value.accountId, async (db) => {
      const context = await resolvePeopleActionContext(
        actor.value,
        parsed.data.organisationId,
        db
      );
      if (!context.ok) {
        return context;
      }
      const result = await deleteAlternativeContact(
        {
          accountId: context.value.accountId,
          actingPersonId: context.value.actingPersonId,
          actingRole: context.value.role,
          actingUserId: context.value.actingUserId,
          contactId: parsed.data.contactId,
          organisationId: context.value.organisationId,
        },
        db
      );
      if (!result.ok) {
        return result;
      }
      afterTenantCommit(db, async () =>
        revalidatePeoplePaths(result.value.personId)
      );
      return result;
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to save person changes.",
      },
      ok: false,
    };
  }
}
export async function reorderAlternativeContactsAction(
  input: ReorderAlternativeContactsActionInput
): Promise<
  PeopleActionResult<{
    personId: string;
  }>
> {
  assertNoTenantTransaction("reorderAlternativeContactsAction");
  const parsed = ReorderAlternativeContactsActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveAuthenticatedPeopleActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(actor.value.accountId, async (db) => {
      const context = await resolvePeopleActionContext(
        actor.value,
        parsed.data.organisationId,
        db
      );
      if (!context.ok) {
        return context;
      }
      const result = await reorderAlternativeContacts(
        {
          accountId: context.value.accountId,
          actingPersonId: context.value.actingPersonId,
          actingRole: context.value.role,
          actingUserId: context.value.actingUserId,
          orderedContactIds: parsed.data.orderedContactIds,
          organisationId: context.value.organisationId,
          personId: parsed.data.personId,
        },
        db
      );
      if (!result.ok) {
        return result;
      }
      afterTenantCommit(db, async () =>
        revalidatePeoplePaths(parsed.data.personId)
      );
      return result;
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to save person changes.",
      },
      ok: false,
    };
  }
}
export async function refreshBalancesAction(
  input: RefreshBalancesActionInput
): Promise<
  PeopleActionResult<{
    queued: boolean;
    reason?: string;
  }>
> {
  assertNoTenantTransaction("refreshBalancesAction");
  const parsed = RefreshBalancesActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const refreshInput = {
    accountId: context.value.accountId,
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    organisationId: context.value.organisationId,
    personId: parsed.data.personId,
  };
  let result: Awaited<ReturnType<typeof sendPreparedBalanceRefresh>>;
  try {
    const prepared = await withTenantDb(context.value.accountId, (db) =>
      prepareBalanceRefresh(refreshInput, db)
    );
    if (!prepared.ok) {
      return prepared;
    }
    result = await sendPreparedBalanceRefresh(prepared.value);
    if (!result.ok) {
      return result;
    }
    const outcome = result.value;
    const audited = await withTenantDb(context.value.accountId, (db) =>
      recordBalanceRefreshDispatch(refreshInput, outcome, db)
    );
    if (!audited.ok) {
      return audited;
    }
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to dispatch balance refresh.",
      },
      ok: false,
    };
  }
  if (result.value.queued) {
    const { xeroConnection, connectionState } = await withTenantDb(
      context.value.accountId,
      async (db) => {
        const preparedXeroConnection = await db.xeroConnection.findFirst({
          select: { id: true },
          where: {
            account_id: context.value.accountId,
            archived_at: null,
            organisation_id: context.value.organisationId,
          },
        });
        const preparedConnectionState = await getXeroConnectionStateForScope(
          {
            accountId: context.value.accountId,
            organisationId: context.value.organisationId,
          },
          db
        );
        return {
          connectionState: preparedConnectionState,
          xeroConnection: preparedXeroConnection,
        };
      }
    );
    if (
      xeroConnection &&
      connectionState.ok &&
      connectionState.value.state === "connected"
    ) {
      try {
        await syncXeroLeaveBalances({
          accountId: context.value.accountId,
          connectionId: xeroConnection.id,
          organisationId: context.value.organisationId,
          personId: parsed.data.personId,
          triggeredByUserId: context.value.actingUserId,
          triggerType: "manual",
        });
      } catch {
        // Sync run error will be recorded in sync_runs
      }
    }
  }
  revalidatePath(`/people/${parsed.data.personId}`);
  revalidatePath("/people");
  revalidatePath("/leave-balances");
  return result;
}
export async function setManualBalanceAction(
  input: SetManualBalanceActionInput
): Promise<
  PeopleActionResult<{
    id: string;
  }>
> {
  assertNoTenantTransaction("setManualBalanceAction");
  const parsed = SetManualBalanceActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const actor = await resolveAuthenticatedPeopleActor();
  if (!actor.ok) {
    return actor;
  }
  try {
    return await withTenantResult(actor.value.accountId, async (db) => {
      const context = await resolvePeopleActionContext(
        actor.value,
        parsed.data.organisationId,
        db
      );
      if (!context.ok) {
        return context;
      }
      const result = await setManualLeaveBalance(
        {
          accountId: context.value.accountId,
          actingRole: context.value.role,
          actingUserId: context.value.actingUserId,
          balance: parsed.data.balance,
          balanceUnit: parsed.data.balanceUnit ?? null,
          leaveTypeName: parsed.data.leaveTypeName ?? null,
          leaveTypeXeroId: parsed.data.leaveTypeXeroId,
          organisationId: context.value.organisationId,
          personId: parsed.data.personId,
          recordType: parsed.data.recordType ?? null,
        },
        db
      );
      if (!result.ok) {
        return result;
      }
      afterTenantCommit(db, async () =>
        revalidatePeoplePaths(parsed.data.personId)
      );
      return result;
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to save person changes.",
      },
      ok: false,
    };
  }
}
interface AuthenticatedPeopleActor {
  accountId: AccountId;
  actingUserId: string;
  role: PeopleRole;
}
async function resolveAuthenticatedPeopleActor(): Promise<
  PeopleActionResult<AuthenticatedPeopleActor>
> {
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
  const role = effectiveRole(sessionRole);
  if (!(sessionAccountId && role && user)) {
    return notAuthorised();
  }
  // The account comes from the authenticated session.
  return {
    ok: true,
    value: {
      accountId: sessionAccountId as AccountId,
      actingUserId: user.id,
      role,
    },
  };
}
async function resolvePeopleActionContext(
  actor: AuthenticatedPeopleActor,
  organisationId: string,
  db: TenantDb
): Promise<
  PeopleActionResult<
    AuthenticatedPeopleActor & {
      actingPersonId: string | null;
      organisationId: OrganisationId;
    }
  >
> {
  assertTenantDb(db, actor.accountId);
  const company = await getOrganisationById(
    actor.accountId,
    organisationId as OrganisationId,
    db
  );
  if (!company.ok) {
    return notAuthorised();
  }
  const companies = await resolveAccountCompanies(actor.accountId, db);
  const actingPerson = await db.person.findFirst({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
    where: {
      account_id: actor.accountId,
      archived_at: null,
      organisation_id: {
        in: companies.map((preparedCompany) => preparedCompany.id),
      },
      user_id: actor.actingUserId,
    },
  });
  return {
    ok: true,
    value: {
      ...actor,
      actingPersonId: actingPerson?.id ?? null,
      organisationId: company.value.id as OrganisationId,
    },
  };
}
async function resolveActionContext(organisationId: string): Promise<
  PeopleActionResult<{
    actingPersonId: string | null;
    actingUserId: string;
    accountId: AccountId;
    organisationId: OrganisationId;
    role: PeopleRole;
  }>
> {
  const actor = await resolveAuthenticatedPeopleActor();
  if (!actor.ok) {
    return actor;
  }
  return withTenantDb(actor.value.accountId, (db) =>
    resolvePeopleActionContext(actor.value, organisationId, db)
  );
}
async function resolveContactPersonId(
  accountId: AccountId,
  organisationId: OrganisationId,
  contactId: string,
  db: TenantDb
): Promise<string | null> {
  const contact = await db.alternativeContact.findFirst({
    select: { person_id: true },
    where: {
      ...scopedQuery(accountId, organisationId),
      id: contactId,
    },
  });
  return contact?.person_id ?? null;
}
function effectiveRole(role: string | null | undefined): PeopleRole | null {
  if (role === "owner") {
    return "owner";
  }
  if (role === "admin") {
    return "admin";
  }
  if (role === "manager") {
    return "manager";
  }
  if (role === "viewer") {
    return "viewer";
  }
  return null;
}
function revalidatePeoplePaths(personId: string) {
  revalidatePath("/people");
  revalidatePath(`/people/${personId}`);
}
export async function loadAccountAccessCandidates(
  input: LoadAccountAccessCandidatesInput
): Promise<PeopleActionResult<AccountAccessReviewResult>> {
  assertNoTenantTransaction("loadAccountAccessCandidates");
  const parsed = LoadAccountAccessCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminAccessContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const reviewResult = await loadAccountAccessReview({
    accountDirectory,
    accountId: context.value.accountId,
    organisationId: context.value.organisationId,
  });
  if (!reviewResult.ok) {
    return reviewResult;
  }
  await withTenantDb(context.value.accountId, (db) =>
    db.auditEvent.create({
      data: {
        account_id: context.value.accountId,
        action: "people.account_access_reviewed",
        actor_user_id: context.value.actingUserId,
        entity_id: context.value.organisationId,
        entity_type: "people",
        metadata: {
          alreadyInvitedCount: reviewResult.value.alreadyInvitedCount,
          candidateCount: reviewResult.value.candidateCount,
          conflictCount: reviewResult.value.conflictCount,
          invitableCount: reviewResult.value.invitableCount,
          inviterId: context.value.actingUserId,
          linkableCount: reviewResult.value.linkableCount,
          memberCount: reviewResult.value.memberCount,
          organisationId: context.value.organisationId,
        },
        organisation_id: context.value.organisationId,
        resource_id: context.value.organisationId,
        resource_type: "people",
      },
    })
  );
  return reviewResult;
}
export const loadAccountAccessCandidatesAction = loadAccountAccessCandidates;
export async function inviteAccountAccessCandidates(
  input: InviteAccountAccessCandidatesInput
): Promise<PeopleActionResult<AccountInvitationDispatchResult>> {
  assertNoTenantTransaction("inviteAccountAccessCandidates");
  const parsed = InviteAccountAccessCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminAccessContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const inviteResult = await serviceInviteAccountAccessCandidates({
    accountDirectory,
    accountId: context.value.accountId,
    candidatePersonIds: parsed.data.candidatePersonIds,
    inviterUserId: context.value.actingUserId,
    organisationId: context.value.organisationId,
  });
  if (!inviteResult.ok) {
    return inviteResult;
  }
  await withTenantDb(context.value.accountId, (db) =>
    db.auditEvent.create({
      data: {
        account_id: context.value.accountId,
        action: "people.account_invitations_sent",
        actor_user_id: context.value.actingUserId,
        entity_id: context.value.organisationId,
        entity_type: "people",
        metadata: {
          candidateCount: inviteResult.value.candidateCount,
          failedCount: inviteResult.value.failedCount,
          inviterId: context.value.actingUserId,
          organisationId: context.value.organisationId,
          ...(inviteResult.value.providerRequestId
            ? { providerRequestId: inviteResult.value.providerRequestId }
            : {}),
          succeededCount: inviteResult.value.succeededCount,
        },
        organisation_id: context.value.organisationId,
        resource_id: context.value.organisationId,
        resource_type: "people",
      },
    })
  );
  revalidatePath("/people");
  return inviteResult;
}
export const inviteAccountAccessCandidatesAction =
  inviteAccountAccessCandidates;
async function resolveAdminAccessContext(organisationId: string): Promise<
  PeopleActionResult<{
    actingUserId: string;
    accountId: AccountId;
    organisationId: OrganisationId;
  }>
> {
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
  const isOwnerOrAdmin = can(sessionRole, { people: ["manage"] });
  if (!(sessionAccountId && isOwnerOrAdmin && user)) {
    return notAuthorised();
  }
  // Authenticated Account precedes an owned-company scope.
  const accountId = sessionAccountId as AccountId;
  const context = await withTenantDb(accountId, (db) =>
    getOrganisationById(accountId, organisationId as OrganisationId, db)
  );
  if (!context.ok) {
    return notAuthorised();
  }
  return {
    ok: true,
    value: {
      accountId,
      actingUserId: user.id,
      organisationId: context.value.id as OrganisationId,
    },
  };
}
function notAuthorised(message?: string): PeopleActionResult<never> {
  return {
    error: {
      code: "not_authorised",
      message: message ?? "You do not have permission to manage people.",
    },
    ok: false,
  };
}
function validationError(message?: string): PeopleActionResult<never> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid people request.",
    },
    ok: false,
  };
}

export async function setPersonManagerAction(input: {
  personId: string;
  managerPersonId: string | null;
}): Promise<
  Result<
    { managerPersonId: string | null },
    ManagerAssignmentError | { code: "unknown_error"; message: string }
  >
> {
  assertNoTenantTransaction("setPersonManagerAction");
  const {
    accountId: sessionAccountId,
    userId,
    role: sessionRole,
  } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  if (
    !(sessionAccountId && userId && can(sessionRole, { people: ["manage"] }))
  ) {
    return {
      error: {
        code: "not_authorised",
        message: "Only owners and admins can assign managers.",
      },
      ok: false,
    };
  }
  try {
    return await withTenantResult(sessionAccountId, async (db) => {
      const result = await setPersonManager(
        {
          ...input,
          accountId: sessionAccountId,
          actingRole: sessionRole === "owner" ? "owner" : "admin",
          actingUserId: userId,
        },
        db
      );
      if (result.ok) {
        afterTenantCommit(db, () => {
          for (const path of [
            "/people",
            "/calendar",
            "/leave-approvals",
            "/plans",
            "/analytics",
            "/",
          ]) {
            revalidatePath(path);
          }

          return Promise.resolve();
        });
      }
      return result;
    });
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to assign the person's manager.",
      },
      ok: false,
    };
  }
}
