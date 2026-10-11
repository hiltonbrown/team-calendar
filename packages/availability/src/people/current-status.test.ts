import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityFindMany: vi.fn(),
  locationFindFirst: vi.fn(),
  locationFindMany: vi.fn(),
  organisationFindFirst: vi.fn(),
  resolvePublicHolidays: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  scopedQuery: mocks.scopedQuery,
  tenantDatabase: vi.fn((accountId: string) => {
    if (!accountId) {
      throw new Error("Missing tenant context");
    }
    return {
      availabilityRecord: { findMany: mocks.availabilityFindMany },
      location: {
        findFirst: mocks.locationFindFirst,
        findMany: mocks.locationFindMany,
      },
      organisation: { findFirst: mocks.organisationFindFirst },
    };
  }),
  tenantTransaction: vi.fn(
    (accountId: string, transactionCallback: unknown, options?: unknown) => {
      if (!accountId) {
        throw new Error("Missing tenant context");
      }
      return {
        availabilityRecord: { findMany: mocks.availabilityFindMany },
        location: {
          findFirst: mocks.locationFindFirst,
          findMany: mocks.locationFindMany,
        },
        organisation: { findFirst: mocks.organisationFindFirst },
      }.$transaction(transactionCallback, options);
    }
  ),
}));
vi.mock("../holidays/resolve-public-holidays", () => ({
  resolvePublicHolidays: mocks.resolvePublicHolidays,
}));

const LOCATION_ID = "00000000-0000-4000-8000-000000000101";
const resolvedHoliday = (
  overrides: Partial<{
    classification: "non_working" | "working";
    key: string;
    kind: "custom" | "local" | "part_day" | "public";
    locationId: string | null;
    name: string;
    origin: "custom" | "official";
  }> = {}
) => ({
  area: null,
  classification: "non_working",
  date: "2026-04-25",
  hidden: false,
  key: "au-national-2026-04-25-anzac-day",
  kind: "public",
  locationId: LOCATION_ID,
  name: "ANZAC Day",
  origin: "official",
  startsAt: null,
  ...overrides,
});
const resolved = (...holidays: ReturnType<typeof resolvedHoliday>[]) =>
  mocks.resolvePublicHolidays.mockResolvedValue({ ok: true, value: holidays });

const {
  computeCurrentStatus,
  computeCurrentStatusForPeople,
  computePublicHolidayApplicability,
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
    resolved();
    mocks.availabilityFindMany.mockResolvedValue([]);
  });

  it("surfaces a holiday loading failure instead of reporting no holiday", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      error: { code: "internal", message: "Failed to resolve public holidays" },
      ok: false,
    });

    await expect(computeCurrentStatus(baseInput)).rejects.toThrow(
      "Failed to resolve public holidays"
    );
  });

  it("treats an unknown organisation as having no holidays", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      error: { code: "not_found", message: "Organisation not found" },
      ok: false,
    });

    await expect(computeCurrentStatus(baseInput)).resolves.toMatchObject({
      activePublicHoliday: null,
    });
  });

  it("computes holiday applicability without querying invented people", async () => {
    const locationId = "00000000-0000-4000-8000-000000000101";
    mocks.locationFindMany.mockResolvedValue([
      {
        country_code: "AU",
        id: locationId,
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      },
    ]);
    resolved(resolvedHoliday(), resolvedHoliday({ locationId: null }));

    const result = await computePublicHolidayApplicability({
      at: baseInput.at,
      clerkOrgId: baseInput.clerkOrgId,
      locationIds: [locationId],
      organisationId: baseInput.organisationId,
    });

    expect(result.locationIds).toEqual(new Set([locationId]));
    expect(result.unassigned).toBe(true);
    expect(mocks.availabilityFindMany).not.toHaveBeenCalled();
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
    resolved(resolvedHoliday());

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

  it("returns the public holiday resolved for the person's location and local date", async () => {
    resolved(resolvedHoliday());

    const status = await computeCurrentStatus(baseInput);

    expect(status.statusKey).toBe("public_holiday");
    expect(mocks.resolvePublicHolidays).toHaveBeenCalledWith({
      clerkOrgId: baseInput.clerkOrgId,
      from: "2026-04-25",
      organisationId: baseInput.organisationId,
      to: "2026-04-25",
    });
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
        person_id: people[0].personId,
      },
      {
        ...activeRecord("annual_leave", "approved"),
        person_id: people[0].personId,
      },
      {
        ...activeRecord("sick_leave", "submitted"),
        person_id: people[1].personId,
      },
      {
        ...activeRecord("wfh", "approved"),
        person_id: people[3].personId,
      },
      {
        ...activeRecord("training", "approved"),
        person_id: people[3].personId,
      },
    ]);
    resolved(resolvedHoliday());

    const statuses = await computeCurrentStatusForPeople({
      at: baseInput.at,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      people,
    });

    expect(statuses.get(people[0].personId)?.statusKey).toBe("on_leave");
    expect(statuses.get(people[1].personId)?.statusKey).toBe("pending_leave");
    expect(statuses.get(people[2].personId)?.statusKey).toBe("public_holiday");
    expect(statuses.get(people[3].personId)?.statusKey).toBe("training");
    expect(mocks.organisationFindFirst).toHaveBeenCalledOnce();
    expect(mocks.locationFindMany).toHaveBeenCalledOnce();
    expect(mocks.availabilityFindMany).toHaveBeenCalledOnce();
    expect(mocks.resolvePublicHolidays).toHaveBeenCalledOnce();
  });

  it("exposes only the public holiday summary on activePublicHoliday", async () => {
    resolved(resolvedHoliday());

    const status = await computeCurrentStatus(baseInput);

    expect(status.activePublicHoliday).toEqual({
      date: new Date("2026-04-25T00:00:00.000Z"),
      id: "au-national-2026-04-25-anzac-day",
      name: "ANZAC Day",
      source: "official",
      type: "public",
    });
  });

  describe("single and batched status parity across holiday scenarios", () => {
    const scenarios = [
      {
        description: "holiday resolved for the person's location",
        expectedStatus: "public_holiday",
        holidays: [resolvedHoliday()],
        personLocationId: LOCATION_ID,
      },
      {
        description: "holiday resolved for another location only",
        expectedStatus: "available",
        holidays: [
          resolvedHoliday({
            locationId: "00000000-0000-4000-8000-000000000999",
          }),
        ],
        personLocationId: LOCATION_ID,
      },
      {
        description: "holiday resolved as a working day",
        expectedStatus: "available",
        holidays: [resolvedHoliday({ classification: "working" })],
        personLocationId: LOCATION_ID,
      },
      {
        description: "custom holiday for the location",
        expectedStatus: "public_holiday",
        holidays: [
          resolvedHoliday({
            key: "custom:1",
            kind: "custom",
            name: "Company Day",
            origin: "custom",
          }),
        ],
        personLocationId: LOCATION_ID,
      },
      {
        description: "person without location uses the organisation level",
        expectedStatus: "public_holiday",
        holidays: [resolvedHoliday({ locationId: null, name: "National Day" })],
        personLocationId: null,
      },
      {
        description: "person without location ignores location holidays",
        expectedStatus: "available",
        holidays: [resolvedHoliday()],
        personLocationId: null,
      },
    ];

    for (const scenario of scenarios) {
      it(`evaluates single and batch identically for: ${scenario.description}`, async () => {
        resolved(...scenario.holidays);

        const singleStatus = await computeCurrentStatus({
          ...baseInput,
          locationId: scenario.personLocationId,
        });

        const batchMap = await computeCurrentStatusForPeople({
          at: baseInput.at,
          clerkOrgId: baseInput.clerkOrgId,
          organisationId: baseInput.organisationId,
          people: [
            {
              locationId: scenario.personLocationId,
              personId: baseInput.personId,
            },
          ],
        });
        const batchStatus = batchMap.get(baseInput.personId);

        expect(singleStatus.statusKey).toBe(scenario.expectedStatus);
        expect(batchStatus?.statusKey).toBe(scenario.expectedStatus);
        expect(singleStatus.statusKey).toBe(batchStatus?.statusKey);
        expect(singleStatus.activePublicHoliday?.name).toBe(
          batchStatus?.activePublicHoliday?.name
        );
      });
    }
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
