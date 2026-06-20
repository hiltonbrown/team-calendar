import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityFindMany: vi.fn(),
  locationFindMany: vi.fn(),
  locationFindFirst: vi.fn(),
  organisationFindFirst: vi.fn(),
  publicHolidayFindMany: vi.fn(),
  publicHolidayFindFirst: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: { findMany: mocks.availabilityFindMany },
    location: {
      findFirst: mocks.locationFindFirst,
      findMany: mocks.locationFindMany,
    },
    organisation: { findFirst: mocks.organisationFindFirst },
    publicHoliday: {
      findFirst: mocks.publicHolidayFindFirst,
      findMany: mocks.publicHolidayFindMany,
    },
  },
  scopedQuery: mocks.scopedQuery,
}));

const {
  computeCurrentStatus,
  computeCurrentStatusForPeople,
  dateOnlyInTimeZone,
} = await import("./current-status");

const baseInput = {
  at: new Date("2026-04-25T02:00:00.000Z"),
  clerkOrgId: "org_1",
  locationId: "00000000-0000-4000-8000-000000000101",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000011",
};

const activeRecord = (
  recordType: string,
  approvalStatus: "approved" | "submitted"
) => ({
  approval_status: approvalStatus,
  archived_at: null,
  contactability: "contactable",
  ends_at: new Date("2026-04-25T08:00:00.000Z"),
  id: `record-${recordType}-${approvalStatus}`,
  record_type: recordType,
  source_type: "manual",
  starts_at: new Date("2026-04-24T22:00:00.000Z"),
  title: null,
});

describe("current-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locationFindFirst.mockResolvedValue({
      country_code: "AU",
      region_code: "QLD",
      timezone: "Australia/Brisbane",
    });
    mocks.organisationFindFirst.mockResolvedValue({
      country_code: "AU",
      timezone: "Australia/Brisbane",
    });
    mocks.publicHolidayFindFirst.mockResolvedValue(null);
    mocks.publicHolidayFindMany.mockResolvedValue([]);
    mocks.availabilityFindMany.mockResolvedValue([]);
  });

  it("prioritises approved Xero leave over lower-priority local records", async () => {
    mocks.availabilityFindMany.mockResolvedValue([
      activeRecord("wfh", "approved"),
      activeRecord("annual_leave", "approved"),
    ]);

    const status = await computeCurrentStatus(baseInput);

    expect(status.statusKey).toBe("on_leave");
    expect(status.label).toBe("On annual leave");
    expect(status.recordType).toBe("annual_leave");
  });

  it("returns pending leave before public holidays", async () => {
    mocks.availabilityFindMany.mockResolvedValue([
      activeRecord("sick_leave", "submitted"),
    ]);
    mocks.publicHolidayFindFirst.mockResolvedValue({
      holiday_date: new Date("2026-04-25T00:00:00.000Z"),
      holiday_type: "public",
      id: "holiday-1",
      name: "ANZAC Day",
      source: "nager",
    });

    const status = await computeCurrentStatus(baseInput);

    expect(status.statusKey).toBe("pending_leave");
    expect(status.label).toBe("Leave pending approval");
  });

  it("returns the higher local priority for overlapping local records", async () => {
    mocks.availabilityFindMany.mockResolvedValue([
      activeRecord("wfh", "approved"),
      activeRecord("training", "approved"),
    ]);

    const status = await computeCurrentStatus(baseInput);

    expect(status.statusKey).toBe("training");
    expect(status.label).toBe("In training");
  });

  it("uses archived_at null when checking public holidays", async () => {
    mocks.publicHolidayFindFirst.mockResolvedValue({
      holiday_date: new Date("2026-04-25T00:00:00.000Z"),
      holiday_type: "public",
      id: "holiday-1",
      name: "ANZAC Day",
      source: "nager",
    });

    const status = await computeCurrentStatus(baseInput);

    expect(status.statusKey).toBe("public_holiday");
    expect(mocks.publicHolidayFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archived_at: null }),
      })
    );
  });

  it("returns available when no active record or holiday applies", async () => {
    const status = await computeCurrentStatus(baseInput);

    expect(status.statusKey).toBe("available");
    expect(status.label).toBe("Available");
  });

  it("batches reference-data queries while preserving status priority per person", async () => {
    const people = [
      {
        locationId: "00000000-0000-4000-8000-000000000101",
        personId: "00000000-0000-4000-8000-000000000201",
      },
      {
        locationId: "00000000-0000-4000-8000-000000000101",
        personId: "00000000-0000-4000-8000-000000000202",
      },
      {
        locationId: "00000000-0000-4000-8000-000000000101",
        personId: "00000000-0000-4000-8000-000000000203",
      },
      {
        locationId: "00000000-0000-4000-8000-000000000102",
        personId: "00000000-0000-4000-8000-000000000204",
      },
    ];
    mocks.locationFindMany.mockResolvedValue([
      {
        country_code: "AU",
        id: "00000000-0000-4000-8000-000000000101",
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      },
      {
        country_code: "NZ",
        id: "00000000-0000-4000-8000-000000000102",
        region_code: null,
        timezone: "Pacific/Auckland",
      },
    ]);
    mocks.availabilityFindMany.mockResolvedValue([
      {
        ...activeRecord("wfh", "approved"),
        person_id: people[0]?.personId,
      },
      {
        ...activeRecord("annual_leave", "approved"),
        person_id: people[0]?.personId,
      },
      {
        ...activeRecord("sick_leave", "submitted"),
        person_id: people[1]?.personId,
      },
      {
        ...activeRecord("wfh", "approved"),
        person_id: people[3]?.personId,
      },
      {
        ...activeRecord("training", "approved"),
        person_id: people[3]?.personId,
      },
    ]);
    mocks.publicHolidayFindMany.mockResolvedValue([
      {
        country_code: "AU",
        holiday_date: new Date("2026-04-25T00:00:00.000Z"),
        holiday_type: "public",
        id: "holiday-1",
        name: "ANZAC Day",
        region_code: "QLD",
        source: "nager",
      },
    ]);

    const statuses = await computeCurrentStatusForPeople({
      at: baseInput.at,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      people,
    });

    expect(statuses.get(people[0]?.personId ?? "")?.statusKey).toBe("on_leave");
    expect(statuses.get(people[1]?.personId ?? "")?.statusKey).toBe(
      "pending_leave"
    );
    expect(statuses.get(people[2]?.personId ?? "")?.statusKey).toBe(
      "public_holiday"
    );
    expect(statuses.get(people[3]?.personId ?? "")?.statusKey).toBe("training");
    expect(mocks.organisationFindFirst).toHaveBeenCalledOnce();
    expect(mocks.locationFindMany).toHaveBeenCalledOnce();
    expect(mocks.availabilityFindMany).toHaveBeenCalledOnce();
    expect(mocks.publicHolidayFindMany).toHaveBeenCalledOnce();
  });

  it("formats dates in the supplied location timezone", () => {
    expect(
      dateOnlyInTimeZone(
        new Date("2026-04-24T14:30:00.000Z"),
        "Australia/Brisbane"
      )
    ).toBe("2026-04-25");
  });
});
