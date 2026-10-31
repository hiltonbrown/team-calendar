import type { AccountId, OrganisationId } from "@repo/core";
import { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  interface ScopedWhere {
    account_id?: string;
    archived_at?: Date | null;
    ends_at?: Date;
    id?: string | { not: string };
    organisation_id?: string;
    person_id?: string;
    record_type?: string;
    source_remote_id?: string | null;
    source_type?: string;
    starts_at?: Date;
  }

  interface PersonFixture {
    display_name: string | null;
    email: string | null;
    first_name: string;
    id: string;
    last_name: string;
    manager_person_id: string | null;
    user_id: string | null;
  }

  interface AvailabilityRecordFixture {
    account_id: string;
    all_day: boolean;
    archived_at: Date | null;
    contactability: string | null;
    ends_at: Date;
    id: string;
    include_in_feed: boolean;
    notes_internal: string | null;
    organisation_id: string;
    person: PersonFixture;
    person_id: string;
    preferred_contact_method: string | null;
    privacy_mode: string | null;
    record_type: string;
    source_remote_id: string | null;
    source_type: string;
    starts_at: Date;
    title: string | null;
    working_location: string | null;
  }

  const people: PersonFixture[] = [];
  const records: AvailabilityRecordFixture[] = [];

  const datesEqual = (left: Date | undefined, right: Date) =>
    left instanceof Date && left.getTime() === right.getTime();

  const idMatches = (record: AvailabilityRecordFixture, where: ScopedWhere) => {
    if (where.id === undefined) {
      return true;
    }
    return typeof where.id === "string"
      ? record.id === where.id
      : record.id !== where.id.not;
  };

  const matchesWhere = (
    record: AvailabilityRecordFixture,
    where: ScopedWhere
  ) =>
    idMatches(record, where) &&
    (where.archived_at === undefined ||
      record.archived_at === where.archived_at) &&
    (where.account_id === undefined ||
      record.account_id === where.account_id) &&
    (where.organisation_id === undefined ||
      record.organisation_id === where.organisation_id) &&
    (where.person_id === undefined || record.person_id === where.person_id) &&
    (where.record_type === undefined ||
      record.record_type === where.record_type) &&
    (where.source_remote_id === undefined ||
      record.source_remote_id === where.source_remote_id) &&
    (where.source_type === undefined ||
      record.source_type === where.source_type) &&
    (where.starts_at === undefined ||
      datesEqual(where.starts_at, record.starts_at)) &&
    (where.ends_at === undefined || datesEqual(where.ends_at, record.ends_at));

  return {
    availabilityCreate: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      const person = people.find((entry) => entry.id === data.person_id);
      if (!person) {
        throw new Error("Person fixture missing for availability record");
      }

      const record: AvailabilityRecordFixture = {
        account_id: String(data.account_id),
        all_day: data.all_day === true,
        archived_at: null,
        contactability:
          typeof data.contactability === "string" ? data.contactability : null,
        ends_at: data.ends_at instanceof Date ? data.ends_at : new Date(),
        id: String(data.id),
        include_in_feed: data.include_in_feed === true,
        notes_internal:
          typeof data.notes_internal === "string" ? data.notes_internal : null,
        organisation_id: String(data.organisation_id),
        person,
        person_id: String(data.person_id),
        preferred_contact_method:
          typeof data.preferred_contact_method === "string"
            ? data.preferred_contact_method
            : null,
        privacy_mode:
          typeof data.privacy_mode === "string" ? data.privacy_mode : null,
        record_type: String(data.record_type),
        source_remote_id: null,
        source_type: String(data.source_type),
        starts_at: data.starts_at instanceof Date ? data.starts_at : new Date(),
        title: typeof data.title === "string" ? data.title : null,
        working_location:
          typeof data.working_location === "string"
            ? data.working_location
            : null,
      };

      records.push(record);
      return record;
    }),
    availabilityFindFirst: vi.fn(
      ({ where }: { where: ScopedWhere }) =>
        records.find((record) => matchesWhere(record, where)) ?? null
    ),
    availabilityUpdate: vi.fn(
      ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: ScopedWhere;
      }) => {
        const record = records.find((entry) => matchesWhere(entry, where));
        if (!record) {
          throw new Error("Record fixture missing for update");
        }

        if (typeof data.record_type === "string") {
          record.record_type = data.record_type;
        }
        if (data.starts_at instanceof Date) {
          record.starts_at = data.starts_at;
        }
        if (data.ends_at instanceof Date) {
          record.ends_at = data.ends_at;
        }
        if (typeof data.title === "string") {
          record.title = data.title;
        }
        if (typeof data.all_day === "boolean") {
          record.all_day = data.all_day;
        }
        if (typeof data.contactability === "string") {
          record.contactability = data.contactability;
        }
        if (typeof data.include_in_feed === "boolean") {
          record.include_in_feed = data.include_in_feed;
        }
        if (typeof data.privacy_mode === "string") {
          record.privacy_mode = data.privacy_mode;
        }
        if (
          data.notes_internal === null ||
          typeof data.notes_internal === "string"
        ) {
          record.notes_internal = data.notes_internal;
        }
        if (
          data.preferred_contact_method === null ||
          typeof data.preferred_contact_method === "string"
        ) {
          record.preferred_contact_method = data.preferred_contact_method;
        }
        if (
          data.working_location === null ||
          typeof data.working_location === "string"
        ) {
          record.working_location = data.working_location;
        }

        return record;
      }
    ),
    logError: vi.fn(),
    materialiseAvailabilityPublication: vi.fn(() =>
      Promise.resolve({ ok: true, value: undefined })
    ),
    people,
    personFindFirst: vi.fn(({ where }: { where: ScopedWhere }) => {
      const person = people.find((entry) => entry.id === where.id);
      if (!person) {
        return null;
      }

      return person;
    }),
    records,
    reset: () => {
      people.splice(0, people.length);
      records.splice(0, records.length);
    },
    scopedQuery: vi.fn((accountId: string, organisationId: string) => ({
      account_id: accountId,
      organisation_id: organisationId,
    })),
  };
});

vi.mock("server-only", () => ({}), { virtual: true });
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),

  scopedQuery: mocks.scopedQuery,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      availabilityRecord: {
        create: mocks.availabilityCreate,
        findFirst: mocks.availabilityFindFirst,
        update: mocks.availabilityUpdate,
      },
      person: { findFirst: mocks.personFindFirst },
    },
  };
}
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: mocks.logError },
}));

const { createManualAvailability, updateManualAvailability } = await import(
  "./index"
);

const baseTenant = {
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  accountId: "org_duplicate_manual_a" as AccountId,
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  organisationId: "51000000-0000-4000-8000-000000000001" as OrganisationId,
};

const otherTenant = {
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  accountId: "org_duplicate_manual_b" as AccountId,
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  organisationId: "52000000-0000-4000-8000-000000000001" as OrganisationId,
};

const basePersonId = "51000000-0000-4000-8000-000000000011";
const otherPersonId = "51000000-0000-4000-8000-000000000012";

const baseInput = {
  allDay: true,
  contactability: "limited",
  endsAt: new Date("2026-05-12T00:00:00.000Z"),
  includeInFeed: true,
  notesInternal: "Manual duplicate fixture",
  personId: basePersonId,
  privacyMode: "named",
  recordType: "wfh",
  startsAt: new Date("2026-05-10T00:00:00.000Z"),
  title: "Working from home",
  workingLocation: "Brisbane",
} as const;

const basePatchInput = {
  allDay: baseInput.allDay,
  contactability: baseInput.contactability,
  endsAt: baseInput.endsAt,
  includeInFeed: baseInput.includeInFeed,
  notesInternal: baseInput.notesInternal,
  privacyMode: baseInput.privacyMode,
  recordType: baseInput.recordType,
  startsAt: baseInput.startsAt,
  title: baseInput.title,
  workingLocation: baseInput.workingLocation,
};

const adminActor = {
  role: "admin",
  userId: "user_test",
} as const;

function addPerson(id: string, userId: string | null = null) {
  mocks.people.push({
    display_name: null,
    email: `${id}@example.com`,
    first_name: "Manual",
    id,
    last_name: "Person",
    manager_person_id: null,
    user_id: userId,
  });
}

describe("createManualAvailability duplicate guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reset();
    addPerson(basePersonId);
    addPerson(otherPersonId);
  });

  it("rejects a second identical manual record before insert", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    const duplicate = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );

    expect(first.ok).toBe(true);
    expect(duplicate).toMatchObject({
      error: {
        code: "conflict",
        message: "A matching manual availability record already exists.",
      },
      ok: false,
    });
    expect(mocks.records).toHaveLength(1);
    expect(mocks.availabilityCreate).toHaveBeenCalledTimes(1);
  });

  it("persists the record even when publication materialisation fails", async () => {
    mocks.materialiseAvailabilityPublication.mockResolvedValueOnce({
      error: { code: "internal", message: "projection boom" },
      ok: false,
    });

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityCreate).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to materialise availability publication",
      expect.objectContaining({ error: "projection boom" })
    );
  });

  it("accepts non-duplicates with a different person, type, or window", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    const differentPerson = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        createManualAvailability(
          baseTenant,
          { ...baseInput, personId: otherPersonId },
          adminActor,
          db
        )
    );
    const differentType = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        createManualAvailability(
          baseTenant,
          { ...baseInput, recordType: "training" },
          adminActor,
          db
        )
    );
    const differentWindow = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        createManualAvailability(
          baseTenant,
          {
            ...baseInput,
            endsAt: new Date("2026-05-13T00:00:00.000Z"),
            startsAt: new Date("2026-05-11T00:00:00.000Z"),
          },
          adminActor,
          db
        )
    );

    expect(first.ok).toBe(true);
    expect(differentPerson.ok).toBe(true);
    expect(differentType.ok).toBe(true);
    expect(differentWindow.ok).toBe(true);
    expect(mocks.records).toHaveLength(4);
  });

  it("allows an identical manual record in a different organisation scope", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    const scopedDuplicate = await withTestTenantResult(
      tenantTestAccount(otherTenant),
      (db) => createManualAvailability(otherTenant, baseInput, adminActor, db)
    );

    expect(first.ok).toBe(true);
    expect(scopedDuplicate.ok).toBe(true);
    expect(mocks.records).toHaveLength(2);
    expect(mocks.availabilityFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: otherTenant.accountId,
          organisation_id: otherTenant.organisationId,
          person_id: basePersonId,
          source_remote_id: null,
        }),
      })
    );
  });

  it("ignores archived manual records when guarding duplicates", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    expect(first.ok).toBe(true);

    // Soft-delete the stored record, mirroring archiveManualAvailability.
    const created = mocks.records.at(0);
    if (!created) {
      throw new Error("Expected a created record fixture");
    }
    created.archived_at = new Date("2026-05-09T00:00:00.000Z");

    const recreated = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );

    expect(recreated.ok).toBe(true);
    expect(mocks.records).toHaveLength(2);
    expect(mocks.availabilityFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archived_at: null }),
      })
    );
  });

  it("rejects updating a record to match another active record", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    const second = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        createManualAvailability(
          baseTenant,
          {
            ...baseInput,
            endsAt: new Date("2026-05-22T00:00:00.000Z"),
            startsAt: new Date("2026-05-20T00:00:00.000Z"),
          },
          adminActor,
          db
        )
    );
    expect(first.ok).toBe(true);
    if (!second.ok) {
      throw new Error("Expected the second record to be created");
    }

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          second.value.id,
          basePatchInput,
          adminActor,
          db
        )
    );

    expect(result).toMatchObject({
      error: {
        code: "conflict",
        message: "A matching manual availability record already exists.",
      },
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
    expect(mocks.records).toHaveLength(2);
  });

  it("allows updating a record to a window no active record uses", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          created.value.id,
          {
            ...basePatchInput,
            endsAt: new Date("2026-05-13T00:00:00.000Z"),
            startsAt: new Date("2026-05-11T00:00:00.000Z"),
          },
          adminActor,
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.records).toHaveLength(1);
  });

  it("updates only the title and preserves private non-default fields", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        createManualAvailability(
          baseTenant,
          {
            ...baseInput,
            allDay: false,
            contactability: "unavailable",
            includeInFeed: false,
            preferredContactMethod: "Signal",
            privacyMode: "private",
          },
          adminActor,
          db
        )
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          created.value.id,
          { title: "Changed" },
          adminActor,
          db
        )
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        allDay: false,
        contactability: "unavailable",
        includeInFeed: false,
        privacyMode: "private",
        title: "Changed",
      },
    });
    expect(mocks.availabilityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          all_day: false,
          contactability: "unavailable",
          include_in_feed: false,
          preferred_contact_method: "Signal",
          privacy_mode: "private",
          title: "Changed",
        }),
        where: {
          account_id: baseTenant.accountId,
          archived_at: null,
          id: created.value.id,
          organisation_id: baseTenant.organisationId,
          source_type: "manual",
        },
      })
    );
  });

  it("does not update a source-mismatched record", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }
    const stored = mocks.records.at(0);
    if (!stored) {
      throw new Error("Expected a stored record fixture");
    }
    stored.source_type = "xero";
    vi.clearAllMocks();

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          created.value.id,
          { title: "Changed" },
          adminActor,
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "not_found" },
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("does not update a record from another tenant", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }
    vi.clearAllMocks();

    const result = await withTestTenantResult(
      tenantTestAccount(otherTenant),
      (db) =>
        updateManualAvailability(
          otherTenant,
          created.value.id,
          { title: "Changed" },
          adminActor,
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "not_found" },
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("denies an actor who cannot manage the record", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }
    vi.clearAllMocks();

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          created.value.id,
          { title: "Changed" },
          { role: "viewer", userId: "user_outsider" },
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("rejects person reassignment", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }
    vi.clearAllMocks();

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          created.value.id,
          { personId: otherPersonId },
          adminActor,
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "bad_request" },
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("rejects a partial update whose merged interval is inverted", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }
    vi.clearAllMocks();

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          created.value.id,
          { startsAt: new Date("2026-05-13T00:00:00.000Z") },
          adminActor,
          db
        )
    );

    expect(result).toMatchObject({
      error: { code: "bad_request" },
      ok: false,
    });
    expect(mocks.availabilityUpdate).not.toHaveBeenCalled();
  });

  it("clears nullable optional text fields", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        createManualAvailability(
          baseTenant,
          { ...baseInput, preferredContactMethod: "Signal" },
          adminActor,
          db
        )
    );
    if (!created.ok) {
      throw new Error("Expected the record to be created");
    }
    vi.clearAllMocks();

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          created.value.id,
          {
            notesInternal: null,
            preferredContactMethod: null,
            workingLocation: null,
          },
          adminActor,
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes_internal: null,
          preferred_contact_method: null,
          working_location: null,
        }),
      })
    );
  });

  it("ignores archived records when guarding updates", async () => {
    const first = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );
    const second = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        createManualAvailability(
          baseTenant,
          {
            ...baseInput,
            endsAt: new Date("2026-05-22T00:00:00.000Z"),
            startsAt: new Date("2026-05-20T00:00:00.000Z"),
          },
          adminActor,
          db
        )
    );
    expect(first.ok).toBe(true);
    if (!second.ok) {
      throw new Error("Expected the second record to be created");
    }

    // Soft-delete the first record so its window is free to reuse.
    const archived = mocks.records.at(0);
    if (!archived) {
      throw new Error("Expected a created record fixture");
    }
    archived.archived_at = new Date("2026-05-09T00:00:00.000Z");

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) =>
        updateManualAvailability(
          baseTenant,
          second.value.id,
          basePatchInput,
          adminActor,
          db
        )
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdate).toHaveBeenCalledTimes(1);
  });

  it("maps a concurrent unique-constraint violation to a conflict", async () => {
    mocks.availabilityCreate.mockImplementationOnce(() => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        clientVersion: "test",
        code: "P2002",
      });
    });

    const result = await withTestTenantResult(
      tenantTestAccount(baseTenant),
      (db) => createManualAvailability(baseTenant, baseInput, adminActor, db)
    );

    expect(result).toMatchObject({
      error: { code: "conflict" },
      ok: false,
    });
  });
});
