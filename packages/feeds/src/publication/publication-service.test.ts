import { Prisma } from "@repo/database/generated/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const publication = {
    availability_record_id: "10000000-0000-4000-8000-000000000001",
    id: "20000000-0000-4000-8000-000000000001",
    privacy_mode: "named",
    published_all_day: true,
    published_at: new Date("2026-05-01T00:00:00.000Z"),
    published_description: "Initial note",
    published_sequence: 0,
    published_summary: "Jane Smith: Annual Leave",
    published_uid: "stable@ical.teamcalendar.online",
  };
  const record = {
    all_day: true,
    clerk_org_id: "org_publication",
    derived_uid_key: "stable@ical.teamcalendar.online",
    id: "10000000-0000-4000-8000-000000000001",
    notes_internal: "Initial note",
    organisation_id: "30000000-0000-4000-8000-000000000001",
    person: {
      display_name: null,
      first_name: "Jane",
      last_name: "Smith",
    },
    privacy_mode: "named",
    publication: null as typeof publication | null,
    record_type: "annual_leave",
    title: null as string | null,
  };

  return {
    availabilityPublicationCreate: vi.fn(
      ({ data }: { data: Record<string, unknown> }) => {
        record.publication = {
          availability_record_id: String(data.availability_record_id),
          id: publication.id,
          privacy_mode: String(data.privacy_mode),
          published_all_day: Boolean(data.published_all_day),
          published_at:
            data.published_at instanceof Date
              ? data.published_at
              : publication.published_at,
          published_description:
            typeof data.published_description === "string"
              ? data.published_description
              : null,
          published_sequence:
            typeof data.published_sequence === "number"
              ? data.published_sequence
              : 0,
          published_summary: String(data.published_summary),
          published_uid: String(data.published_uid),
        };
        return record.publication;
      }
    ),
    availabilityPublicationUpdate: vi.fn(
      ({ data }: { data: Record<string, unknown> }) => {
        if (!record.publication) {
          throw new Error("Publication fixture missing for update");
        }
        const nextSequence = data.published_sequence;
        record.publication = {
          ...record.publication,
          privacy_mode: String(data.privacy_mode),
          published_all_day: Boolean(data.published_all_day),
          published_at:
            data.published_at instanceof Date
              ? data.published_at
              : record.publication.published_at,
          published_description:
            typeof data.published_description === "string"
              ? data.published_description
              : null,
          published_sequence:
            typeof nextSequence === "object" &&
            nextSequence !== null &&
            "increment" in nextSequence
              ? record.publication.published_sequence +
                Number(nextSequence.increment)
              : Number(nextSequence),
          published_summary: String(data.published_summary),
          published_uid: String(data.published_uid),
        };
        return record.publication;
      }
    ),
    availabilityPublicationFindUnique: vi.fn(() => ({ ...publication })),
    availabilityRecordFindFirst: vi.fn(() => record),
    record,
    reset: () => {
      record.all_day = true;
      record.derived_uid_key = "stable@ical.teamcalendar.online";
      record.notes_internal = "Initial note";
      record.privacy_mode = "named";
      record.publication = null;
      record.title = null;
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityPublication: {
      create: mocks.availabilityPublicationCreate,
      findUnique: mocks.availabilityPublicationFindUnique,
      update: mocks.availabilityPublicationUpdate,
    },
    availabilityRecord: {
      findFirst: mocks.availabilityRecordFindFirst,
    },
  },
}));

const { materialiseAvailabilityPublication } = await import(
  "./publication-service"
);

const input = {
  availabilityRecordId: "10000000-0000-4000-8000-000000000001",
  clerkOrgId: "org_publication",
  organisationId: "30000000-0000-4000-8000-000000000001",
};

describe("materialiseAvailabilityPublication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reset();
  });

  it("creates publication rows with the stable UID and sequence zero", async () => {
    const result = await materialiseAvailabilityPublication(input);

    expect(result).toMatchObject({
      ok: true,
      value: {
        publishedDescription: "Initial note",
        publishedSequence: 0,
        publishedSummary: "Jane Smith: Annual Leave",
        publishedUid: "stable@ical.teamcalendar.online",
      },
    });
  });

  it("keeps the UID stable and increments sequence on a prompt-scope edit", async () => {
    const first = await materialiseAvailabilityPublication(input);
    expect(first.ok && first.value.publishedSequence).toBe(0);

    mocks.record.notes_internal = "Updated note";
    const second = await materialiseAvailabilityPublication(input);

    expect(second).toMatchObject({
      ok: true,
      value: {
        publishedDescription: "Updated note",
        publishedSequence: 1,
        publishedUid: "stable@ical.teamcalendar.online",
      },
    });
  });

  it("increments sequence when only the all-day flag changes", async () => {
    const first = await materialiseAvailabilityPublication(input);
    expect(first.ok && first.value.publishedSequence).toBe(0);

    mocks.record.all_day = false;
    const second = await materialiseAvailabilityPublication(input);

    expect(second).toMatchObject({
      ok: true,
      value: {
        publishedSequence: 1,
        publishedUid: "stable@ical.teamcalendar.online",
      },
    });
  });

  it("skips the write and keeps the sequence when nothing materially changed", async () => {
    const first = await materialiseAvailabilityPublication(input);
    expect(first.ok && first.value.publishedSequence).toBe(0);

    const second = await materialiseAvailabilityPublication(input);

    expect(second).toMatchObject({
      ok: true,
      value: {
        publishedSequence: 0,
        publishedUid: "stable@ical.teamcalendar.online",
      },
    });
    expect(mocks.availabilityPublicationUpdate).not.toHaveBeenCalled();
  });

  it("recovers from a concurrent create conflict by reloading the winning row", async () => {
    mocks.availabilityPublicationCreate.mockImplementationOnce(() => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        clientVersion: "test",
        code: "P2002",
      });
    });

    const result = await materialiseAvailabilityPublication(input);

    expect(result).toMatchObject({
      ok: true,
      value: {
        publishedSequence: 0,
        publishedUid: "stable@ical.teamcalendar.online",
      },
    });
    expect(mocks.availabilityPublicationFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityPublicationUpdate).not.toHaveBeenCalled();
  });
});
