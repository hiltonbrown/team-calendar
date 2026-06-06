import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  interface ScopedWhere {
    clerk_org_id?: string;
    ends_at?: Date;
    id?: string;
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
  }

  interface AvailabilityRecordFixture {
    all_day: boolean;
    clerk_org_id: string;
    contactability: string | null;
    ends_at: Date;
    id: string;
    include_in_feed: boolean;
    notes_internal: string | null;
    organisation_id: string;
    person: PersonFixture;
    person_id: string;
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

  const matchesDuplicateWhere = (
    record: AvailabilityRecordFixture,
    where: ScopedWhere
  ) =>
    record.clerk_org_id === where.clerk_org_id &&
    record.organisation_id === where.organisation_id &&
    record.person_id === where.person_id &&
    record.record_type === where.record_type &&
    record.source_remote_id === where.source_remote_id &&
    record.source_type === where.source_type &&
    datesEqual(where.starts_at, record.starts_at) &&
    datesEqual(where.ends_at, record.ends_at);

  return {
    availabilityCreate: vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        const person = people.find((entry) => entry.id === data.person_id);
        if (!person) {
          throw new Error("Person fixture missing for availability record");
        }

        const record: AvailabilityRecordFixture = {
          all_day: data.all_day === true,
          clerk_org_id: String(data.clerk_org_id),
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
          privacy_mode:
            typeof data.privacy_mode === "string" ? data.privacy_mode : null,
          record_type: String(data.record_type),
          source_remote_id: null,
          source_type: String(data.source_type),
          starts_at:
            data.starts_at instanceof Date ? data.starts_at : new Date(),
          title: typeof data.title === "string" ? data.title : null,
          working_location:
            typeof data.working_location === "string"
              ? data.working_location
              : null,
        };

        records.push(record);
        return record;
      }
    ),
    availabilityFindFirst: vi.fn(
      async ({ where }: { where: ScopedWhere }) =>
        records.find((record) => matchesDuplicateWhere(record, where)) ?? null
    ),
    people,
    personFindFirst: vi.fn(async ({ where }: { where: ScopedWhere }) => {
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
    scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
      clerk_org_id: clerkOrgId,
      organisation_id: organisationId,
    })),
  };
});

vi.mock("server-only", () => ({}), { virtual: true });
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: {
      create: mocks.availabilityCreate,
      findFirst: mocks.availabilityFindFirst,
    },
    person: { findFirst: mocks.personFindFirst },
  },
  scopedQuery: mocks.scopedQuery,
}));

const { createManualAvailability } = await import("./index");

const baseTenant = {
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  clerkOrgId: "org_duplicate_manual_a" as ClerkOrgId,
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  organisationId: "51000000-0000-4000-8000-000000000001" as OrganisationId,
};

const otherTenant = {
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  clerkOrgId: "org_duplicate_manual_b" as ClerkOrgId,
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

function addPerson(id: string) {
  mocks.people.push({
    display_name: null,
    email: `${id}@example.com`,
    first_name: "Manual",
    id,
    last_name: "Person",
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
    const first = await createManualAvailability(
      baseTenant,
      baseInput,
      "user_test"
    );
    const duplicate = await createManualAvailability(
      baseTenant,
      baseInput,
      "user_test"
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

  it("accepts non-duplicates with a different person, type, or window", async () => {
    const first = await createManualAvailability(
      baseTenant,
      baseInput,
      "user_test"
    );
    const differentPerson = await createManualAvailability(
      baseTenant,
      { ...baseInput, personId: otherPersonId },
      "user_test"
    );
    const differentType = await createManualAvailability(
      baseTenant,
      { ...baseInput, recordType: "training" },
      "user_test"
    );
    const differentWindow = await createManualAvailability(
      baseTenant,
      {
        ...baseInput,
        endsAt: new Date("2026-05-13T00:00:00.000Z"),
        startsAt: new Date("2026-05-11T00:00:00.000Z"),
      },
      "user_test"
    );

    expect(first.ok).toBe(true);
    expect(differentPerson.ok).toBe(true);
    expect(differentType.ok).toBe(true);
    expect(differentWindow.ok).toBe(true);
    expect(mocks.records).toHaveLength(4);
  });

  it("allows an identical manual record in a different organisation scope", async () => {
    const first = await createManualAvailability(
      baseTenant,
      baseInput,
      "user_test"
    );
    const scopedDuplicate = await createManualAvailability(
      otherTenant,
      baseInput,
      "user_test"
    );

    expect(first.ok).toBe(true);
    expect(scopedDuplicate.ok).toBe(true);
    expect(mocks.records).toHaveLength(2);
    expect(mocks.availabilityFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: otherTenant.clerkOrgId,
          organisation_id: otherTenant.organisationId,
          person_id: basePersonId,
          source_remote_id: null,
        }),
      })
    );
  });
});
