import { log } from "@repo/observability/log";
import "server-only";

import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { assertTenantDb, scopedQuery, type TenantDb } from "@repo/database";
import { z } from "zod";
import type { AlternativeContactSnapshot, PeopleRole } from "./people-service";

export type AlternativeContactServiceError =
  | { code: "contact_not_found"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "person_not_found"; message: string }
  | { code: "reorder_mismatch"; message: string }
  | { code: "unknown_error"; message: string }
  | { code: "validation_error"; message: string };

const RoleSchema = z.enum(["admin", "manager", "owner", "viewer"]);
const BaseInputSchema = z.object({
  actingPersonId: z.string().uuid().nullable(),
  actingRole: RoleSchema,
  actingUserId: z.string().min(1).optional(),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

const ContactFieldsSchema = z
  .object({
    email: z.string().trim().email().max(320).optional().or(z.literal("")),
    name: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    role: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Add an email address or phone number.",
    path: ["email"],
  });

const AddContactSchema = BaseInputSchema.merge(ContactFieldsSchema).extend({
  personId: z.string().uuid(),
});

const ContactPatchSchema = z
  .object({
    email: z.string().trim().email().max(320).optional().or(z.literal("")),
    name: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    role: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

const UpdateContactSchema = BaseInputSchema.extend({
  contactId: z.string().uuid(),
  patch: ContactPatchSchema,
});

const DeleteContactSchema = BaseInputSchema.extend({
  contactId: z.string().uuid(),
});

const ReorderContactsSchema = BaseInputSchema.extend({
  orderedContactIds: z.array(z.string().uuid()),
  personId: z.string().uuid(),
});

export async function addAlternativeContact(
  input: {
    actingPersonId: null | string;
    actingRole: PeopleRole;
    actingUserId?: string;
    clerkOrgId: string;
    email?: string;
    name: string;
    notes?: string;
    organisationId: string;
    personId: string;
    phone?: string;
    role?: string;
  },
  db: TenantDb
): Promise<Result<AlternativeContactSnapshot, AlternativeContactServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof addAlternativeContact> => {
    const parsed = AddContactSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await client.person.findFirst({
      select: { id: true, manager_person_id: true },
      where: {
        ...scoped,
        id: parsed.data.personId,
      },
    });
    if (!person) {
      return await personNotFound(parsed.data, client);
    }
    if (
      !canMutate(person, parsed.data.actingPersonId, parsed.data.actingRole)
    ) {
      return notAuthorised();
    }

    const contact = await (async (tx: TenantDb) => {
      const lastContact = await tx.alternativeContact.findFirst({
        orderBy: { display_order: "desc" },
        select: { display_order: true },
        where: {
          ...scoped,
          person_id: person.id,
        },
      });
      const created = await tx.alternativeContact.create({
        data: {
          clerk_org_id: parsed.data.clerkOrgId,
          display_order: (lastContact?.display_order ?? -1) + 1,
          email: emptyToNull(parsed.data.email),
          name: parsed.data.name,
          notes: emptyToNull(parsed.data.notes),
          organisation_id: parsed.data.organisationId,
          person_id: person.id,
          phone: emptyToNull(parsed.data.phone),
          role: emptyToNull(parsed.data.role),
        },
        select: alternativeContactSelect,
      });
      await tx.auditEvent.create({
        data: auditData(
          parsed.data,
          "alternative_contacts.added",
          person.id,
          created.id,
          {
            contactId: created.id,
            personId: person.id,
          }
        ),
      });
      return created;
    })(client);

    return { ok: true, value: toAlternativeContactSnapshot(contact) };
  };
  return await (async () => {
    assertTenantDb(db, input.clerkOrgId);
    return await run(db);
  })();
}

export async function updateAlternativeContact(
  input: {
    actingPersonId: null | string;
    actingRole: PeopleRole;
    actingUserId?: string;
    clerkOrgId: string;
    contactId: string;
    organisationId: string;
    patch: {
      email?: string;
      name?: string;
      notes?: string;
      phone?: string;
      role?: string;
    };
  },
  db: TenantDb
): Promise<Result<AlternativeContactSnapshot, AlternativeContactServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof updateAlternativeContact> => {
    const parsed = UpdateContactSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const existing = await loadContact(scoped, parsed.data.contactId, client);
    if (!existing) {
      return await contactNotFound(parsed.data, client);
    }
    if (
      !canMutate(
        existing.person,
        parsed.data.actingPersonId,
        parsed.data.actingRole
      )
    ) {
      return notAuthorised();
    }
    const merged = {
      email: existing.email ?? undefined,
      name: parsed.data.patch.name ?? existing.name,
      phone: existing.phone ?? undefined,
      ...parsed.data.patch,
    };
    const contactFields = ContactFieldsSchema.safeParse(merged);
    if (!contactFields.success) {
      return validationError(contactFields.error);
    }

    const updated = await (async (tx: TenantDb) => {
      const row = await tx.alternativeContact.update({
        data: {
          email:
            parsed.data.patch.email === undefined
              ? undefined
              : emptyToNull(parsed.data.patch.email),
          name: parsed.data.patch.name,
          notes:
            parsed.data.patch.notes === undefined
              ? undefined
              : emptyToNull(parsed.data.patch.notes),
          phone:
            parsed.data.patch.phone === undefined
              ? undefined
              : emptyToNull(parsed.data.patch.phone),
          role:
            parsed.data.patch.role === undefined
              ? undefined
              : emptyToNull(parsed.data.patch.role),
        },
        select: alternativeContactSelect,
        where: { id: existing.id },
      });
      await tx.auditEvent.create({
        data: auditData(
          parsed.data,
          "alternative_contacts.updated",
          existing.person_id,
          existing.id,
          {
            contactId: existing.id,
            personId: existing.person_id,
          }
        ),
      });
      return row;
    })(client);

    return { ok: true, value: toAlternativeContactSnapshot(updated) };
  };
  return await (async () => {
    assertTenantDb(db, input.clerkOrgId);
    return await run(db);
  })();
}

export async function deleteAlternativeContact(
  input: {
    actingPersonId: null | string;
    actingRole: PeopleRole;
    actingUserId?: string;
    clerkOrgId: string;
    contactId: string;
    organisationId: string;
  },
  db: TenantDb
): Promise<Result<{ personId: string }, AlternativeContactServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof deleteAlternativeContact> => {
    const parsed = DeleteContactSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const existing = await loadContact(scoped, parsed.data.contactId, client);
    if (!existing) {
      return await contactNotFound(parsed.data, client);
    }
    if (
      !canMutate(
        existing.person,
        parsed.data.actingPersonId,
        parsed.data.actingRole
      )
    ) {
      return notAuthorised();
    }

    await (async (tx: TenantDb) => {
      await tx.alternativeContact.delete({ where: { id: existing.id } });
      const remaining = await tx.alternativeContact.findMany({
        orderBy: [{ display_order: "asc" }, { created_at: "asc" }],
        select: { id: true },
        where: {
          ...scoped,
          person_id: existing.person_id,
        },
      });
      for (const [displayOrder, contact] of remaining.entries()) {
        await tx.alternativeContact.update({
          data: { display_order: displayOrder },
          where: { id: contact.id },
        });
      }
      await tx.auditEvent.create({
        data: auditData(
          parsed.data,
          "alternative_contacts.deleted",
          existing.person_id,
          existing.id,
          {
            contactId: existing.id,
            personId: existing.person_id,
          }
        ),
      });
    })(client);

    return { ok: true, value: { personId: existing.person_id } };
  };
  return await (async () => {
    assertTenantDb(db, input.clerkOrgId);
    return await run(db);
  })();
}

export async function reorderAlternativeContacts(
  input: {
    actingPersonId: null | string;
    actingRole: PeopleRole;
    actingUserId?: string;
    clerkOrgId: string;
    orderedContactIds: string[];
    organisationId: string;
    personId: string;
  },
  db: TenantDb
): Promise<Result<{ personId: string }, AlternativeContactServiceError>> {
  assertTenantDb(db, input.clerkOrgId);
  const run = async (
    client: TenantDb
  ): ReturnType<typeof reorderAlternativeContacts> => {
    const parsed = ReorderContactsSchema.safeParse(input);
    if (!parsed.success) {
      return validationError(parsed.error);
    }
    const scoped = scopedQuery(
      parsed.data.clerkOrgId as ClerkOrgId,
      parsed.data.organisationId as OrganisationId
    );
    const person = await client.person.findFirst({
      select: { id: true, manager_person_id: true },
      where: {
        ...scoped,
        id: parsed.data.personId,
      },
    });
    if (!person) {
      return await personNotFound(parsed.data, client);
    }
    if (
      !canMutate(person, parsed.data.actingPersonId, parsed.data.actingRole)
    ) {
      return notAuthorised();
    }

    const existing = await client.alternativeContact.findMany({
      orderBy: [{ display_order: "asc" }, { created_at: "asc" }],
      select: { id: true },
      where: {
        ...scoped,
        person_id: person.id,
      },
    });
    if (
      !sameIdSet(
        existing.map((contact) => contact.id),
        parsed.data.orderedContactIds
      )
    ) {
      return {
        error: {
          code: "reorder_mismatch",
          message: "Contact order does not match the current contact set.",
        },
        ok: false,
      };
    }

    await (async (tx: TenantDb) => {
      for (const [
        displayOrder,
        contactId,
      ] of parsed.data.orderedContactIds.entries()) {
        await tx.alternativeContact.update({
          data: { display_order: displayOrder },
          where: { id: contactId },
        });
      }
      await tx.auditEvent.create({
        data: auditData(
          parsed.data,
          "alternative_contacts.reordered",
          person.id,
          person.id,
          {
            orderedContactIds: parsed.data.orderedContactIds,
            personId: person.id,
          }
        ),
      });
    })(client);

    return { ok: true, value: { personId: person.id } };
  };
  return await (async () => {
    assertTenantDb(db, input.clerkOrgId);
    return await run(db);
  })();
}

const alternativeContactSelect = {
  display_order: true,
  email: true,
  id: true,
  name: true,
  notes: true,
  person_id: true,
  phone: true,
  role: true,
} as const;

async function loadContact(
  scoped: { clerk_org_id: ClerkOrgId; organisation_id: OrganisationId },
  contactId: string,
  db: TenantDb
) {
  return await db.alternativeContact.findFirst({
    select: {
      ...alternativeContactSelect,
      person: {
        select: {
          id: true,
          manager_person_id: true,
        },
      },
    },
    where: {
      ...scoped,
      id: contactId,
    },
  });
}

function canMutate(
  person: { id: string; manager_person_id: string | null },
  actingPersonId: null | string,
  actingRole: PeopleRole
): boolean {
  return (
    actingRole === "admin" ||
    actingRole === "owner" ||
    actingPersonId === person.id ||
    (Boolean(actingPersonId) && person.manager_person_id === actingPersonId)
  );
}

function auditData(
  input: {
    actingPersonId: null | string;
    actingUserId?: string;
    clerkOrgId: string;
    organisationId: string;
  },
  action: string,
  personId: string,
  resourceId: string,
  payload: Record<string, unknown>
) {
  return {
    action,
    actor_user_id: input.actingUserId ?? null,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    payload: {
      ...payload,
      actingPersonId: input.actingPersonId,
    },
    resource_id: resourceId,
    resource_type: personId === resourceId ? "person" : "alternative_contact",
  };
}

function toAlternativeContactSnapshot(contact: {
  display_order: number;
  email: string | null;
  id: string;
  name: string;
  notes: string | null;
  phone: string | null;
  role: string | null;
}): AlternativeContactSnapshot {
  return {
    displayOrder: contact.display_order,
    email: contact.email,
    id: contact.id,
    name: contact.name,
    notes: contact.notes,
    phone: contact.phone,
    role: contact.role,
  };
}

async function personNotFound(
  input: {
    clerkOrgId: string;
    organisationId: string;
    personId: string;
  },
  db: TenantDb
): Promise<Result<never, AlternativeContactServiceError>> {
  const exists = await db.person.findFirst({
    select: { clerk_org_id: true, organisation_id: true },
    where: { clerk_org_id: input.clerkOrgId, id: input.personId },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
      actingOrganisationId: input.organisationId,
      resourceId: input.personId,
      resourceType: "person",
    });
  }
  return {
    error: { code: "person_not_found", message: "Person not found." },
    ok: false,
  };
}

async function contactNotFound(
  input: {
    clerkOrgId: string;
    contactId: string;
    organisationId: string;
  },
  db: TenantDb
): Promise<Result<never, AlternativeContactServiceError>> {
  const exists = await db.alternativeContact.findFirst({
    select: { clerk_org_id: true, organisation_id: true },
    where: { clerk_org_id: input.clerkOrgId, id: input.contactId },
  });
  if (
    exists &&
    (exists.clerk_org_id !== input.clerkOrgId ||
      exists.organisation_id !== input.organisationId)
  ) {
    log.error("Cross-tenant resource access attempt", {
      actingClerkOrgId: input.clerkOrgId,
      actingOrganisationId: input.organisationId,
      resourceId: input.contactId,
      resourceType: "alternative_contact",
    });
  }
  return {
    error: { code: "contact_not_found", message: "Contact not found." },
    ok: false,
  };
}

function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validationError(
  error: z.ZodError
): Result<never, AlternativeContactServiceError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid alternative contact.",
    },
    ok: false,
  };
}

function notAuthorised(): Result<never, AlternativeContactServiceError> {
  return {
    error: {
      code: "not_authorised",
      message: "You do not have permission to manage these contacts.",
    },
    ok: false,
  };
}
