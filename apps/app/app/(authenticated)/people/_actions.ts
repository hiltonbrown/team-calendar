"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  type AlternativeContactServiceError,
  addAlternativeContact,
  type BalanceRefreshError,
  deleteAlternativeContact,
  dispatchBalanceRefresh,
  type PeopleRole,
  reorderAlternativeContacts,
  updateAlternativeContact,
} from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
import {
  type AddAlternativeContactActionInput,
  AddAlternativeContactActionSchema,
  type DeleteAlternativeContactActionInput,
  DeleteAlternativeContactActionSchema,
  type RefreshBalancesActionInput,
  RefreshBalancesActionSchema,
  type ReorderAlternativeContactsActionInput,
  ReorderAlternativeContactsActionSchema,
  type UpdateAlternativeContactActionInput,
  UpdateAlternativeContactActionSchema,
} from "./_schemas";

export type PeopleActionError =
  | AlternativeContactServiceError
  | BalanceRefreshError
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

  revalidatePath(`/people/${parsed.data.personId}`);
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
    where: {
      ...scopedQuery(context.value.clerkOrgId, context.value.organisationId),
      archived_at: null,
      clerk_user_id: user.id,
    },
    select: { id: true },
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
    where: {
      ...scopedQuery(clerkOrgId, organisationId),
      id: contactId,
    },
    select: { person_id: true },
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

function notAuthorised(message?: string): PeopleActionResult<never> {
  return {
    ok: false,
    error: {
      code: "not_authorised",
      message: message ?? "You do not have permission to manage people.",
    },
  };
}

function validationError(message?: string): PeopleActionResult<never> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid people request.",
    },
  };
}
