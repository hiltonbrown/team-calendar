import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  alternativeContactCreate: vi.fn(),
  alternativeContactDelete: vi.fn(),
  alternativeContactFindFirst: vi.fn(),
  alternativeContactFindMany: vi.fn(),
  alternativeContactUpdate: vi.fn(),
  auditEventCreate: vi.fn(),
  logError: vi.fn(),
  personFindFirst: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      alternativeContact: {
        create: mocks.alternativeContactCreate,
        delete: mocks.alternativeContactDelete,
        findFirst: mocks.alternativeContactFindFirst,
        findMany: mocks.alternativeContactFindMany,
        update: mocks.alternativeContactUpdate,
      },
      auditEvent: {
        create: mocks.auditEventCreate,
      },
    })
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/observability/log", () => ({
  log: { error: mocks.logError, info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),

  scopedQuery: mocks.scopedQuery,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      $transaction: mocks.transaction,
      alternativeContact: {
        create: mocks.alternativeContactCreate,
        delete: mocks.alternativeContactDelete,
        findFirst: mocks.alternativeContactFindFirst,
        findMany: mocks.alternativeContactFindMany,
        update: mocks.alternativeContactUpdate,
      },
      auditEvent: { create: mocks.auditEventCreate },
      person: {
        findFirst: mocks.personFindFirst,
      },
    },
  };
}

const {
  addAlternativeContact,
  deleteAlternativeContact,
  reorderAlternativeContacts,
  updateAlternativeContact,
} = await import("./alternative-contact-service");

const testContext = {
  actingPersonId: "10000000-0000-4000-8000-000000000001",
  actingRole: "admin" as const,
  actingUserId: "user_test_admin",
  clerkOrgId: "org_test_alt_contacts",
  organisationId: "20000000-0000-4000-8000-000000000001",
  personId: "30000000-0000-4000-8000-000000000001",
};

describe("alternative contact service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditEventCreate.mockResolvedValue({});
    mocks.personFindFirst.mockResolvedValue({
      id: testContext.personId,
      manager_person_id: null,
    });
    mocks.alternativeContactFindFirst.mockResolvedValue(null);
    mocks.alternativeContactFindMany.mockResolvedValue([]);
    mocks.alternativeContactCreate.mockImplementation(
      async ({ data }: { data: any }) => ({
        ...data,
        id: "40000000-0000-4000-8000-000000000001",
      })
    );
    mocks.alternativeContactUpdate.mockImplementation(
      async ({ data, where }: { data: any; where: any }) => ({
        display_order: 0,
        email: "contact@example.com",
        id: where.id,
        name: "Updated Name",
        notes: null,
        person_id: testContext.personId,
        phone: "+61400000000",
        role: "Primary Backup",
        ...data,
      })
    );
    mocks.alternativeContactDelete.mockResolvedValue({});
  });

  describe("addAlternativeContact", () => {
    it("validates input: fails if neither email nor phone is provided", async () => {
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              name: "Jane Doe",
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: "Add an email address or phone number.",
        },
        ok: false,
      });
      expect(mocks.personFindFirst).not.toHaveBeenCalled();
    });

    it("validates input: fails on invalid email format", async () => {
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          email: "not-an-email",
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              email: "not-an-email",
              name: "Jane Doe",
            },
            db
          )
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation_error");
      }
    });

    it("enforces tenant scoping when resolving person; returns person_not_found when missing", async () => {
      mocks.personFindFirst.mockResolvedValue(null);

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          email: "jane@example.com",
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              email: "jane@example.com",
              name: "Jane Doe",
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "person_not_found",
          message: "Person not found.",
        },
        ok: false,
      });
      expect(mocks.scopedQuery).toHaveBeenCalledWith(
        testContext.clerkOrgId,
        testContext.organisationId
      );
    });

    it("logs cross-tenant resource access attempt when person exists in a different tenant", async () => {
      mocks.personFindFirst
        .mockResolvedValueOnce(null) // scoped query misses
        .mockResolvedValueOnce({
          clerk_org_id: "org_other",
          organisation_id: "99999999-0000-4000-8000-000000000099",
        }); // unscoped lookup finds across tenant boundary

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          email: "jane@example.com",
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              email: "jane@example.com",
              name: "Jane Doe",
            },
            db
          )
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("person_not_found");
      }
      expect(mocks.logError).toHaveBeenCalledWith(
        "Cross-tenant resource access attempt",
        expect.objectContaining({
          actingClerkOrgId: testContext.clerkOrgId,
          actingOrganisationId: testContext.organisationId,
          resourceId: testContext.personId,
          resourceType: "person",
        })
      );
    });

    it("denies access if caller is not authorized (e.g. viewer role, not self, not manager)", async () => {
      mocks.personFindFirst.mockResolvedValue({
        id: testContext.personId,
        manager_person_id: "50000000-0000-4000-8000-000000000001",
      });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          actingPersonId: "60000000-0000-4000-8000-000000000001",
          actingRole: "viewer",
          email: "jane@example.com",
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              actingPersonId: "60000000-0000-4000-8000-000000000001",
              actingRole: "viewer",
              email: "jane@example.com",
              name: "Jane Doe",
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage these contacts.",
        },
        ok: false,
      });
      expect(mocks.alternativeContactCreate).not.toHaveBeenCalled();
    });

    it("allows direct manager to add a contact for their report", async () => {
      const managerPersonId = "50000000-0000-4000-8000-000000000001";
      mocks.personFindFirst.mockResolvedValue({
        id: testContext.personId,
        manager_person_id: managerPersonId,
      });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          actingPersonId: managerPersonId,
          actingRole: "manager",
          email: "jane@example.com",
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              actingPersonId: managerPersonId,
              actingRole: "manager",
              email: "jane@example.com",
              name: "Jane Doe",
            },
            db
          )
      );

      expect(result.ok).toBe(true);
      expect(mocks.alternativeContactCreate).toHaveBeenCalled();
    });

    it("allows person to add a contact for themselves", async () => {
      mocks.personFindFirst.mockResolvedValue({
        id: testContext.personId,
        manager_person_id: "50000000-0000-4000-8000-000000000001",
      });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          actingPersonId: testContext.personId,
          actingRole: "viewer",
          email: "jane@example.com",
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              actingPersonId: testContext.personId,
              actingRole: "viewer",
              email: "jane@example.com",
              name: "Jane Doe",
            },
            db
          )
      );

      expect(result.ok).toBe(true);
      expect(mocks.alternativeContactCreate).toHaveBeenCalled();
    });

    it("assigns display_order 0 for the first contact and writes audit event", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue(null);

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          email: "jane@example.com",
          name: "Jane Doe",
          notes: "Available mornings",
          phone: "+61411111111",
          role: "Stand-in",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              email: "jane@example.com",
              name: "Jane Doe",
              notes: "Available mornings",
              phone: "+61411111111",
              role: "Stand-in",
            },
            db
          )
      );

      expect(result.ok).toBe(true);
      expect(mocks.alternativeContactCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerk_org_id: testContext.clerkOrgId,
          display_order: 0,
          email: "jane@example.com",
          name: "Jane Doe",
          notes: "Available mornings",
          organisation_id: testContext.organisationId,
          person_id: testContext.personId,
          phone: "+61411111111",
          role: "Stand-in",
        }),
        select: expect.any(Object),
      });
      expect(mocks.auditEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "alternative_contacts.added",
          actor_user_id: testContext.actingUserId,
          clerk_org_id: testContext.clerkOrgId,
          organisation_id: testContext.organisationId,
          resource_type: "alternative_contact",
        }),
      });
    });

    it("increments display_order when other contacts already exist", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue({ display_order: 2 });

      await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          email: "second@example.com",
          name: "Second Contact",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              email: "second@example.com",
              name: "Second Contact",
            },
            db
          )
      );

      expect(mocks.alternativeContactCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          display_order: 3,
        }),
        select: expect.any(Object),
      });
    });

    it("maps empty strings to null for optional contact fields", async () => {
      await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          email: "",
          name: "Phone Only Contact",
          notes: "   ",
          phone: "+61400000000",
          role: "",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              email: "",
              name: "Phone Only Contact",
              notes: "   ",
              phone: "+61400000000",
              role: "",
            },
            db
          )
      );

      expect(mocks.alternativeContactCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null,
          name: "Phone Only Contact",
          notes: null,
          phone: "+61400000000",
          role: null,
        }),
        select: expect.any(Object),
      });
    });

    it("returns unknown_error when a database operation fails", async () => {
      mocks.alternativeContactCreate.mockRejectedValueOnce(
        new Error("DB failure")
      );

      const result = withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          email: "jane@example.com",
          name: "Jane Doe",
        }),
        (db) =>
          addAlternativeContact(
            {
              ...testContext,
              email: "jane@example.com",
              name: "Jane Doe",
            },
            db
          )
      );

      await expect(result).rejects.toThrow("DB failure");
    });
  });

  describe("updateAlternativeContact", () => {
    const contactId = "40000000-0000-4000-8000-000000000001";
    const existingContact = {
      display_order: 0,
      email: "existing@example.com",
      id: contactId,
      name: "Existing Contact",
      notes: "Original notes",
      person: {
        id: testContext.personId,
        manager_person_id: null,
      },
      person_id: testContext.personId,
      phone: "+61400000000",
      role: "Backup",
    };

    it("rejects an empty patch with validation_error", async () => {
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          contactId,
          patch: {},
        }),
        (db) =>
          updateAlternativeContact(
            {
              ...testContext,
              contactId,
              patch: {},
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: "Provide at least one field to update.",
        },
        ok: false,
      });
    });

    it("returns contact_not_found when the contact does not exist in scope", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue(null);

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          contactId,
          patch: { name: "New Name" },
        }),
        (db) =>
          updateAlternativeContact(
            {
              ...testContext,
              contactId,
              patch: { name: "New Name" },
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "contact_not_found",
          message: "Contact not found.",
        },
        ok: false,
      });
    });

    it("logs cross-tenant resource access attempt when contact belongs to another tenant", async () => {
      mocks.alternativeContactFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          clerk_org_id: "org_other",
          organisation_id: "99999999-0000-4000-8000-000000000099",
        });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          contactId,
          patch: { name: "New Name" },
        }),
        (db) =>
          updateAlternativeContact(
            {
              ...testContext,
              contactId,
              patch: { name: "New Name" },
            },
            db
          )
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("contact_not_found");
      }
      expect(mocks.logError).toHaveBeenCalledWith(
        "Cross-tenant resource access attempt",
        expect.objectContaining({
          actingClerkOrgId: testContext.clerkOrgId,
          actingOrganisationId: testContext.organisationId,
          resourceId: contactId,
          resourceType: "alternative_contact",
        })
      );
    });

    it("denies unauthorized caller from updating the contact", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue({
        ...existingContact,
        person: {
          id: testContext.personId,
          manager_person_id: "50000000-0000-4000-8000-000000000001",
        },
      });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          actingPersonId: "70000000-0000-4000-8000-000000000001",
          actingRole: "viewer",
          contactId,
          patch: { name: "New Name" },
        }),
        (db) =>
          updateAlternativeContact(
            {
              ...testContext,
              actingPersonId: "70000000-0000-4000-8000-000000000001",
              actingRole: "viewer",
              contactId,
              patch: { name: "New Name" },
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage these contacts.",
        },
        ok: false,
      });
    });

    it("rejects patch if resulting contact would have neither email nor phone", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue({
        ...existingContact,
        phone: null,
      });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          contactId,
          patch: { email: "" },
        }),
        (db) =>
          updateAlternativeContact(
            {
              ...testContext,
              contactId,
              patch: { email: "" },
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: "Add an email address or phone number.",
        },
        ok: false,
      });
    });

    it("updates contact successfully and creates an audit event", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue(existingContact);

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          contactId,
          patch: {
            name: "Updated Name",
            role: "New Role",
          },
        }),
        (db) =>
          updateAlternativeContact(
            {
              ...testContext,
              contactId,
              patch: {
                name: "Updated Name",
                role: "New Role",
              },
            },
            db
          )
      );

      expect(result.ok).toBe(true);
      expect(mocks.alternativeContactUpdate).toHaveBeenCalledWith({
        data: {
          email: undefined,
          name: "Updated Name",
          notes: undefined,
          phone: undefined,
          role: "New Role",
        },
        select: expect.any(Object),
        where: { id: contactId },
      });
      expect(mocks.auditEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "alternative_contacts.updated",
          actor_user_id: testContext.actingUserId,
          resource_id: contactId,
          resource_type: "alternative_contact",
        }),
      });
    });
  });

  describe("deleteAlternativeContact", () => {
    const contactId = "40000000-0000-4000-8000-000000000001";
    const existingContact = {
      display_order: 1,
      email: "delete_me@example.com",
      id: contactId,
      name: "To Delete",
      notes: null,
      person: {
        id: testContext.personId,
        manager_person_id: null,
      },
      person_id: testContext.personId,
      phone: null,
      role: null,
    };

    it("deletes contact and reorders remaining contacts sequentially", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue(existingContact);
      mocks.alternativeContactFindMany.mockResolvedValue([
        { id: "40000000-0000-4000-8000-000000000000" },
        { id: "40000000-0000-4000-8000-000000000002" },
      ]);

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          contactId,
        }),
        (db) =>
          deleteAlternativeContact(
            {
              ...testContext,
              contactId,
            },
            db
          )
      );

      expect(result).toEqual({
        ok: true,
        value: { personId: testContext.personId },
      });
      expect(mocks.alternativeContactDelete).toHaveBeenCalledWith({
        where: { id: contactId },
      });
      expect(mocks.alternativeContactUpdate).toHaveBeenCalledWith({
        data: { display_order: 0 },
        where: { id: "40000000-0000-4000-8000-000000000000" },
      });
      expect(mocks.alternativeContactUpdate).toHaveBeenCalledWith({
        data: { display_order: 1 },
        where: { id: "40000000-0000-4000-8000-000000000002" },
      });
      expect(mocks.auditEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "alternative_contacts.deleted",
          resource_id: contactId,
        }),
      });
    });

    it("returns not_authorised when caller has no permission to delete", async () => {
      mocks.alternativeContactFindFirst.mockResolvedValue({
        ...existingContact,
        person: {
          id: testContext.personId,
          manager_person_id: "50000000-0000-4000-8000-000000000001",
        },
      });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          actingPersonId: "80000000-0000-4000-8000-000000000001",
          actingRole: "viewer",
          contactId,
        }),
        (db) =>
          deleteAlternativeContact(
            {
              ...testContext,
              actingPersonId: "80000000-0000-4000-8000-000000000001",
              actingRole: "viewer",
              contactId,
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage these contacts.",
        },
        ok: false,
      });
      expect(mocks.alternativeContactDelete).not.toHaveBeenCalled();
    });
  });

  describe("reorderAlternativeContacts", () => {
    const contactId1 = "40000000-0000-4000-8000-000000000001";
    const contactId2 = "40000000-0000-4000-8000-000000000002";
    const contactId3 = "40000000-0000-4000-8000-000000000003";
    const contactIds = [contactId1, contactId2, contactId3];

    it("rejects when orderedContactIds does not match the person's existing contact set", async () => {
      mocks.alternativeContactFindMany.mockResolvedValue([
        { id: contactId1 },
        { id: contactId2 },
      ]);

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          orderedContactIds: [contactId1, contactId3],
        }),
        (db) =>
          reorderAlternativeContacts(
            {
              ...testContext,
              orderedContactIds: [contactId1, contactId3],
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "reorder_mismatch",
          message: "Contact order does not match the current contact set.",
        },
        ok: false,
      });
      expect(mocks.alternativeContactUpdate).not.toHaveBeenCalled();
    });

    it("reorders contacts according to the given order and writes audit event", async () => {
      mocks.alternativeContactFindMany.mockResolvedValue([
        { id: contactId1 },
        { id: contactId2 },
        { id: contactId3 },
      ]);

      const reordered = [contactId3, contactId1, contactId2];
      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          orderedContactIds: reordered,
        }),
        (db) =>
          reorderAlternativeContacts(
            {
              ...testContext,
              orderedContactIds: reordered,
            },
            db
          )
      );

      expect(result).toEqual({
        ok: true,
        value: { personId: testContext.personId },
      });
      expect(mocks.alternativeContactUpdate).toHaveBeenNthCalledWith(1, {
        data: { display_order: 0 },
        where: { id: contactId3 },
      });
      expect(mocks.alternativeContactUpdate).toHaveBeenNthCalledWith(2, {
        data: { display_order: 1 },
        where: { id: contactId1 },
      });
      expect(mocks.alternativeContactUpdate).toHaveBeenNthCalledWith(3, {
        data: { display_order: 2 },
        where: { id: contactId2 },
      });
      expect(mocks.auditEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "alternative_contacts.reordered",
          actor_user_id: testContext.actingUserId,
          resource_id: testContext.personId,
          resource_type: "person",
        }),
      });
    });

    it("denies reorder when caller is not authorised", async () => {
      mocks.personFindFirst.mockResolvedValue({
        id: testContext.personId,
        manager_person_id: "50000000-0000-4000-8000-000000000001",
      });

      const result = await withTestTenantResult(
        tenantTestAccount({
          ...testContext,
          actingPersonId: "90000000-0000-4000-8000-000000000001",
          actingRole: "viewer",
          orderedContactIds: contactIds,
        }),
        (db) =>
          reorderAlternativeContacts(
            {
              ...testContext,
              actingPersonId: "90000000-0000-4000-8000-000000000001",
              actingRole: "viewer",
              orderedContactIds: contactIds,
            },
            db
          )
      );

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage these contacts.",
        },
        ok: false,
      });
      expect(mocks.alternativeContactUpdate).not.toHaveBeenCalled();
    });
  });
});
