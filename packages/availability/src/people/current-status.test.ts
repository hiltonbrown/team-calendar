import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityFindMany: vi.fn(),
  locationFindFirst: vi.fn(),
  locationFindMany: vi.fn(),
  organisationFindFirst: vi.fn(),
  publicHolidayFindFirst: vi.fn(),
  publicHolidayFindMany: vi.fn(),
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
    mocks.publicHolidayFindFirst.mockResolvedValue(null);
    mocks.publicHolidayFindMany.mockResolvedValue([]);
    mocks.availabilityFindMany.mockResolvedValue([]);
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
    mocks.publicHolidayFindMany.mockResolvedValue([
      {
        archived_at: null,
        assignments: [],
        country_code: "AU",
        default_classification: "non_working",
        holiday_date: new Date("2026-04-25T00:00:00.000Z"),
        holiday_type: "public",
        id: "holiday-1",
        name: "ANZAC Day",
        region_code: null,
        source: "australian_government",
      },
    ]);

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
    mocks.publicHolidayFindFirst.mockResolvedValue({
      assignments: [],
      country_code: "AU",
      default_classification: "non_working",
      holiday_date: new Date("2026-04-25T00:00:00.000Z"),
      holiday_type: "public",
      id: "holiday-1",
      name: "ANZAC Day",
      region_code: null,
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
      assignments: [],
      country_code: "AU",
      default_classification: "non_working",
      holiday_date: new Date("2026-04-25T00:00:00.000Z"),
      holiday_type: "public",
      id: "holiday-1",
      name: "ANZAC Day",
      region_code: null,
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
    mocks.publicHolidayFindMany.mockResolvedValue([
      {
        assignments: [],
        country_code: "AU",
        default_classification: "non_working",
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

    expect(statuses.get(people[0].personId)?.statusKey).toBe("on_leave");
    expect(statuses.get(people[1].personId)?.statusKey).toBe("pending_leave");
    expect(statuses.get(people[2].personId)?.statusKey).toBe("public_holiday");
    expect(statuses.get(people[3].personId)?.statusKey).toBe("training");
    expect(mocks.organisationFindFirst).toHaveBeenCalledOnce();
    expect(mocks.locationFindMany).toHaveBeenCalledOnce();
    expect(mocks.availabilityFindMany).toHaveBeenCalledOnce();
    expect(mocks.publicHolidayFindMany).toHaveBeenCalledOnce();
  });

  it("selects the exact Plan 095 helper fields in both single and batch queries", async () => {
    mocks.publicHolidayFindFirst.mockResolvedValue(null);
    mocks.publicHolidayFindMany.mockResolvedValue([]);

    await computeCurrentStatus(baseInput);
    await computeCurrentStatusForPeople({
      at: baseInput.at,
      clerkOrgId: baseInput.clerkOrgId,
      organisationId: baseInput.organisationId,
      people: [
        { locationId: baseInput.locationId, personId: baseInput.personId },
      ],
    });

    const expectedSelect = {
      assignments: {
        select: {
          archived_at: true,
          day_classification: true,
          scope_type: true,
          scope_value: true,
        },
        where: {
          archived_at: null,
          scope_type: "location",
        },
      },
      country_code: true,
      default_classification: true,
      holiday_date: true,
      holiday_type: true,
      id: true,
      name: true,
      region_code: true,
      source: true,
    };

    expect(mocks.publicHolidayFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expectedSelect,
        where: expect.objectContaining({
          clerk_org_id: baseInput.clerkOrgId,
          organisation_id: baseInput.organisationId,
        }),
      })
    );

    expect(mocks.publicHolidayFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expectedSelect,
        where: expect.objectContaining({
          clerk_org_id: baseInput.clerkOrgId,
          organisation_id: baseInput.organisationId,
        }),
      })
    );
  });

  it("never exposes helper-only or internal fields on the public activePublicHoliday object", async () => {
    mocks.publicHolidayFindFirst.mockResolvedValue({
      assignments: [
        {
          archived_at: null,
          day_classification: "non_working",
          scope_type: "location",
          scope_value: baseInput.locationId,
        },
      ],
      country_code: "AU",
      default_classification: "non_working",
      holiday_date: new Date("2026-04-25T00:00:00.000Z"),
      holiday_type: "public",
      id: "holiday-1",
      name: "ANZAC Day",
      region_code: "QLD",
      source: "nager",
    });

    const status = await computeCurrentStatus(baseInput);

    expect(status.statusKey).toBe("public_holiday");
    expect(status.activePublicHoliday).toEqual({
      date: new Date("2026-04-25T00:00:00.000Z"),
      id: "holiday-1",
      name: "ANZAC Day",
      source: "nager",
      type: "public",
    });
    expect(status.activePublicHoliday).not.toHaveProperty("assignments");
    expect(status.activePublicHoliday).not.toHaveProperty(
      "default_classification"
    );
    expect(status.activePublicHoliday).not.toHaveProperty("country_code");
    expect(status.activePublicHoliday).not.toHaveProperty("region_code");
  });

  describe("single and batched status parity across holiday scenarios", () => {
    const scenarios = [
      {
        description: "regional holiday matching subject location",
        expectedStatus: "public_holiday",
        holiday: {
          assignments: [],
          country_code: "AU",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "public" as const,
          id: "holiday-regional-match",
          name: "QLD Day",
          region_code: "QLD",
          source: "nager" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
      {
        description: "regional holiday mismatched with subject location",
        expectedStatus: "available",
        holiday: {
          assignments: [],
          country_code: "AU",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "public" as const,
          id: "holiday-regional-mismatch",
          name: "NSW Day",
          region_code: "NSW",
          source: "nager" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
      {
        description: "custom holiday applying to all jurisdictions",
        expectedStatus: "public_holiday",
        holiday: {
          assignments: [],
          country_code: "CUSTOM",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "custom" as const,
          id: "holiday-custom",
          name: "Company Day",
          region_code: null,
          source: "manual" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
      {
        description: "default working holiday without override",
        expectedStatus: "available",
        holiday: {
          assignments: [],
          country_code: "AU",
          default_classification: "working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "observance" as const,
          id: "holiday-working-default",
          name: "Working Observance",
          region_code: null,
          source: "nager" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
      {
        description:
          "default working holiday with non_working location override",
        expectedStatus: "public_holiday",
        holiday: {
          assignments: [
            {
              archived_at: null,
              day_classification: "non_working" as const,
              scope_type: "location" as const,
              scope_value: "00000000-0000-4000-8000-000000000101",
            },
          ],
          country_code: "AU",
          default_classification: "working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "observance" as const,
          id: "holiday-working-overridden-non-working",
          name: "Overridden Observance",
          region_code: null,
          source: "nager" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
      {
        description:
          "default non_working holiday with working location override",
        expectedStatus: "available",
        holiday: {
          assignments: [
            {
              archived_at: null,
              day_classification: "working" as const,
              scope_type: "location" as const,
              scope_value: "00000000-0000-4000-8000-000000000101",
            },
          ],
          country_code: "AU",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "public" as const,
          id: "holiday-non-working-overridden-working",
          name: "Working Override",
          region_code: null,
          source: "nager" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
      {
        description: "archived location override is ignored",
        expectedStatus: "public_holiday",
        holiday: {
          assignments: [
            {
              archived_at: new Date("2026-01-01T00:00:00.000Z"),
              day_classification: "working" as const,
              scope_type: "location" as const,
              scope_value: "00000000-0000-4000-8000-000000000101",
            },
          ],
          country_code: "AU",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "public" as const,
          id: "holiday-archived-override",
          name: "ANZAC Day",
          region_code: null,
          source: "nager" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
      {
        description:
          "person without location matches national organisation holiday",
        expectedStatus: "public_holiday",
        holiday: {
          assignments: [],
          country_code: "AU",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "public" as const,
          id: "holiday-national-for-unassigned-person",
          name: "National Day",
          region_code: null,
          source: "nager" as const,
        },
        personLocationId: null,
      },
      {
        description: "person without location ignores regional holiday",
        expectedStatus: "available",
        holiday: {
          assignments: [],
          country_code: "AU",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "public" as const,
          id: "holiday-regional-for-unassigned-person",
          name: "QLD Day",
          region_code: "QLD",
          source: "nager" as const,
        },
        personLocationId: null,
      },
      {
        description: "organisation/team/person/feed assignments remain inert",
        expectedStatus: "public_holiday",
        holiday: {
          assignments: [
            {
              archived_at: null,
              day_classification: "working" as const,
              scope_type: "person" as const,
              scope_value: baseInput.personId,
            },
            {
              archived_at: null,
              day_classification: "working" as const,
              scope_type: "team" as const,
              scope_value: "team-1",
            },
            {
              archived_at: null,
              day_classification: "working" as const,
              scope_type: "organisation" as const,
              scope_value: baseInput.organisationId,
            },
            {
              archived_at: null,
              day_classification: "working" as const,
              scope_type: "feed" as const,
              scope_value: "feed-1",
            },
          ],
          country_code: "AU",
          default_classification: "non_working" as const,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          holiday_type: "public" as const,
          id: "holiday-inert-scopes",
          name: "Inert Scope Holiday",
          region_code: null,
          source: "nager" as const,
        },
        personLocationId: "00000000-0000-4000-8000-000000000101",
      },
    ];

    for (const scenario of scenarios) {
      it(`evaluates single and batch identically for: ${scenario.description}`, async () => {
        mocks.publicHolidayFindFirst.mockResolvedValue(scenario.holiday);
        mocks.publicHolidayFindMany.mockResolvedValue([scenario.holiday]);

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
