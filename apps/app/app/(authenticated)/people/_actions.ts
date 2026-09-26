"use server";

import { auth, clerkClient, currentUser } from "@repo/auth/server";
import {
  type AlternativeContactServiceError,
  addAlternativeContact,
  type BalanceRefreshError,
  type ClerkAccessReviewResult,
  type ClerkAccessServiceError,
  type ClerkInvitationDispatchResult,
  deleteAlternativeContact,
  dispatchBalanceRefresh,
  getXeroConnectionStateForScope,
  loadClerkAccessReview,
  type ManualBalanceServiceError,
  type PeopleRole,
  reorderAlternativeContacts,
  inviteClerkAccessCandidates as serviceInviteClerkAccessCandidates,
  setManualLeaveBalance,
  updateAlternativeContact,
} from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { syncXeroLeaveBalances } from "@repo/jobs";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
import {
  type AddAlternativeContactActionInput,
  AddAlternativeContactActionSchema,
  type DeleteAlternativeContactActionInput,
  DeleteAlternativeContactActionSchema,
  type InviteClerkAccessCandidatesInput,
  InviteClerkAccessCandidatesSchema,
  type LoadClerkAccessCandidatesInput,
  LoadClerkAccessCandidatesSchema,
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
  | ClerkAccessServiceError
  | ManualBalanceServiceError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string };

export type PeopleActionResult<T> = Result<T, PeopleActionError>;

export async function addAlternativeContactAction(
  input: AddAlternativeContactActionInput
): Promise<PeopleActionResult<{ id: string }>> {
  const parsed = AddAlternativeContactActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const result = await addAlternativeContact({
    actingPersonId: context.value.actingPersonId,
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    email: parsed.data.email,
    name: parsed.data.name,
    notes: parsed.data.notes,
    organisationId: context.value.organisationId,
    personId: parsed.data.personId,
    phone: parsed.data.phone,
    role: parsed.data.role,
  });
  if (!result.ok) {
    return result;
  }

  revalidatePeoplePaths(parsed.data.personId);
  return { ok: true, value: { id: result.value.id } };
}

export async function updateAlternativeContactAction(
  input: UpdateAlternativeContactActionInput
): Promise<PeopleActionResult<{ id: string }>> {
  const parsed = UpdateAlternativeContactActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const personId = await resolveContactPersonId(
    context.value.clerkOrgId,
    context.value.organisationId,
    parsed.data.contactId
  );

  const result = await updateAlternativeContact({
    actingPersonId: context.value.actingPersonId,
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    contactId: parsed.data.contactId,
    organisationId: context.value.organisationId,
    patch: parsed.data.patch,
  });
  if (!result.ok) {
    return result;
  }

  if (personId) {
    revalidatePeoplePaths(personId);
  } else {
    revalidatePath("/people");
  }
  return { ok: true, value: { id: result.value.id } };
}

export async function deleteAlternativeContactAction(
  input: DeleteAlternativeContactActionInput
): Promise<PeopleActionResult<{ personId: string }>> {
  const parsed = DeleteAlternativeContactActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const result = await deleteAlternativeContact({
    actingPersonId: context.value.actingPersonId,
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    contactId: parsed.data.contactId,
    organisationId: context.value.organisationId,
  });
  if (!result.ok) {
    return result;
  }

  revalidatePeoplePaths(result.value.personId);
  return result;
}

export async function reorderAlternativeContactsAction(
  input: ReorderAlternativeContactsActionInput
): Promise<PeopleActionResult<{ personId: string }>> {
  const parsed = ReorderAlternativeContactsActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const result = await reorderAlternativeContacts({
    actingPersonId: context.value.actingPersonId,
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    orderedContactIds: parsed.data.orderedContactIds,
    organisationId: context.value.organisationId,
    personId: parsed.data.personId,
  });
  if (!result.ok) {
    return result;
  }

  revalidatePeoplePaths(parsed.data.personId);
  return result;
}

export async function refreshBalancesAction(
  input: RefreshBalancesActionInput
): Promise<PeopleActionResult<{ queued: boolean; reason?: string }>> {
  const parsed = RefreshBalancesActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const result = await dispatchBalanceRefresh({
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
    personId: parsed.data.personId,
  });
  if (!result.ok) {
    return result;
  }

  if (result.value.queued) {
    const xeroTenant = await database.xeroTenant.findFirst({
      select: { id: true },
      where: {
        clerk_org_id: context.value.clerkOrgId,
        organisation_id: context.value.organisationId,
      },
    });
    const connectionState = await getXeroConnectionStateForScope({
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
    });
    if (
      xeroTenant &&
      connectionState.ok &&
      connectionState.value.state === "connected" &&
      connectionState.value.bindingGeneration !== null
    ) {
      try {
        await syncXeroLeaveBalances({
          bindingGeneration: connectionState.value.bindingGeneration,
          clerkOrgId: context.value.clerkOrgId,
          organisationId: context.value.organisationId,
          personId: parsed.data.personId,
          triggeredByUserId: context.value.actingUserId,
          triggerType: "manual",
          xeroTenantId: xeroTenant.id,
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
): Promise<PeopleActionResult<{ id: string }>> {
  const parsed = SetManualBalanceActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const result = await setManualLeaveBalance({
    actingRole: context.value.role,
    actingUserId: context.value.actingUserId,
    balance: parsed.data.balance,
    balanceUnit: parsed.data.balanceUnit ?? null,
    clerkOrgId: context.value.clerkOrgId,
    leaveTypeName: parsed.data.leaveTypeName ?? null,
    leaveTypeXeroId: parsed.data.leaveTypeXeroId,
    organisationId: context.value.organisationId,
    personId: parsed.data.personId,
    recordType: parsed.data.recordType ?? null,
  });
  if (!result.ok) {
    return result;
  }

  revalidatePeoplePaths(parsed.data.personId);
  return result;
}

async function resolveActionContext(organisationId: string): Promise<
  PeopleActionResult<{
    actingPersonId: string | null;
    actingUserId: string;
    clerkOrgId: ClerkOrgId;
    organisationId: OrganisationId;
    role: PeopleRole;
  }>
> {
  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
  ]);
  const role = effectiveRole(orgRole);
  if (!(role && user)) {
    return notAuthorised();
  }
  if (!context.ok) {
    return notAuthorised(context.error.message);
  }

  const actingPerson = await database.person.findFirst({
    select: { id: true },
    where: {
      ...scopedQuery(context.value.clerkOrgId, context.value.organisationId),
      archived_at: null,
      clerk_user_id: user.id,
    },
  });

  return {
    ok: true,
    value: {
      actingPersonId: actingPerson?.id ?? null,
      actingUserId: user.id,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
      role,
    },
  };
}

async function resolveContactPersonId(
  clerkOrgId: ClerkOrgId,
  organisationId: OrganisationId,
  contactId: string
): Promise<string | null> {
  const contact = await database.alternativeContact.findFirst({
    select: { person_id: true },
    where: {
      ...scopedQuery(clerkOrgId, organisationId),
      id: contactId,
    },
  });
  return contact?.person_id ?? null;
}

function effectiveRole(role: string | null | undefined): PeopleRole | null {
  if (role === "org:owner") {
    return "owner";
  }
  if (role === "org:admin") {
    return "admin";
  }
  if (role === "org:manager") {
    return "manager";
  }
  if (role === "org:viewer") {
    return "viewer";
  }
  return null;
}

function revalidatePeoplePaths(personId: string) {
  revalidatePath("/people");
  revalidatePath(`/people/${personId}`);
}

export async function loadClerkAccessCandidates(
  input: LoadClerkAccessCandidatesInput
): Promise<PeopleActionResult<ClerkAccessReviewResult>> {
  const parsed = LoadClerkAccessCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminAccessContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const clerk = await clerkClient();
  const reviewResult = await loadClerkAccessReview({
    clerkOrganizations: clerk.organizations,
    clerkOrgId: context.value.clerkOrgId,
    organisationId: context.value.organisationId,
  });
  if (!reviewResult.ok) {
    return reviewResult;
  }

  await database.auditEvent.create({
    data: {
      action: "people.clerk_access_reviewed",
      actor_user_id: context.value.actingUserId,
      clerk_org_id: context.value.clerkOrgId,
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
  });

  return reviewResult;
}

export const loadClerkAccessCandidatesAction = loadClerkAccessCandidates;

export async function inviteClerkAccessCandidates(
  input: InviteClerkAccessCandidatesInput
): Promise<PeopleActionResult<ClerkInvitationDispatchResult>> {
  const parsed = InviteClerkAccessCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await resolveAdminAccessContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }

  const clerk = await clerkClient();
  const inviteResult = await serviceInviteClerkAccessCandidates({
    candidatePersonIds: parsed.data.candidatePersonIds,
    clerkOrganizations: clerk.organizations,
    clerkOrgId: context.value.clerkOrgId,
    inviterUserId: context.value.actingUserId,
    organisationId: context.value.organisationId,
  });
  if (!inviteResult.ok) {
    return inviteResult;
  }

  await database.auditEvent.create({
    data: {
      action: "people.clerk_invitations_sent",
      actor_user_id: context.value.actingUserId,
      clerk_org_id: context.value.clerkOrgId,
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
  });

  revalidatePath("/people");
  return inviteResult;
}

export const inviteClerkAccessCandidatesAction = inviteClerkAccessCandidates;

async function resolveAdminAccessContext(organisationId: string): Promise<
  PeopleActionResult<{
    actingUserId: string;
    clerkOrgId: ClerkOrgId;
    organisationId: OrganisationId;
  }>
> {
  const [{ has, orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
  ]);
  const isOwnerOrAdmin =
    orgRole === "org:owner" ||
    orgRole === "org:admin" ||
    Boolean(has?.({ role: "org:owner" })) ||
    Boolean(has?.({ role: "org:admin" }));

  if (!(isOwnerOrAdmin && user)) {
    return notAuthorised();
  }
  if (!context.ok) {
    return notAuthorised(context.error.message);
  }

  return {
    ok: true,
    value: {
      actingUserId: user.id,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
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
