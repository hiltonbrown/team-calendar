import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const record = {
    all_day: true,
    contactability: "unavailable",
    derived_sequence: 0,
    derived_uid_key: "fallback@ical.leavesync.app",
    ends_at: new Date("2026-05-08T00:00:00.000Z"),
    id: "10000000-0000-4000-8000-000000000001",
    notes_internal: "Internal note",
    person: {
      display_name: null,
      first_name: "Jane",
      last_name: "Smith",
      location: { name: "Brisbane" },
    },
    publication: {
      published_sequence: 3,
      published_uid: "published@ical.leavesync.app",
    },
    record_type: "annual_leave",
    starts_at: new Date("2026-05-07T00:00:00.000Z"),
    title: null,
  };

  return {
    availabilityRecordFindMany: vi.fn(() => Promise.resolve([record])),
    feedFindFirst: vi.fn(() =>
      Promise.resolve({
        created_by_user_id: "user_1",
        includes_public_holidays: false,
        privacy_mode: "named",
        scopes: [{ scope_type: "org", scope_value: null }],
      })
    ),
    publicHolidayFindMany: vi.fn(() => Promise.resolve([])),
    resolvePeopleForFeed: vi.fn(() =>
      Promise.resolve({
        ok: true,
        value: [
          {
            displayName: "Jane Smith",
            firstName: "Jane",
            id: "20000000-0000-4000-8000-000000000001",
            lastName: "Smith",
            location: null,
            locationId: null,
            managerPersonId: null,
            team: null,
            teamId: null,
          },
        ],
      })
    ),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: { findMany: mocks.availabilityRecordFindMany },
    feed: { findFirst: mocks.feedFindFirst },
    publicHoliday: { findMany: mocks.publicHolidayFindMany },
  },
}));
vi.mock("../scope/feed-scope", () => ({
  resolvePeopleForFeed: mocks.resolvePeopleForFeed,
}));

const { projectFeedEvents } = await import("./feed-projection");

const baseInput = {
  actingRole: "viewer" as const,
  clerkOrgId: "org_projection",
  feedId: "30000000-0000-4000-8000-000000000001",
  horizonDays: 30,
  organisationId: "40000000-0000-4000-8000-000000000001",
};

describe("projectFeedEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies privacy transforms in projection and carries publication identity", async () => {
    const named = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });
    const masked = await projectFeedEvents({
      ...baseInput,
      privacyMode: "masked",
    });
    const privateFeed = await projectFeedEvents({
      ...baseInput,
      privacyMode: "private",
    });

    expect(named.ok && named.value[0]).toMatchObject({
      description: "Internal note",
      location: "Brisbane",
      publishedSequence: 3,
      publishedUid: "published@ical.leavesync.app",
      sourceRecordId: "10000000-0000-4000-8000-000000000001",
      summary: "Jane Smith: Annual Leave",
    });
    expect(masked.ok && masked.value[0]).toMatchObject({
      description: null,
      location: "Brisbane",
      summary: "Team member: Annual Leave",
    });
    expect(privateFeed.ok && privateFeed.value[0]).toMatchObject({
      description: null,
      location: null,
      summary: "Unavailable",
    });
  });

  it("projects public holidays for matching locations and deduplicates by id and date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T09:00:00.000Z"));

    mocks.feedFindFirst.mockResolvedValueOnce({
      created_by_user_id: "user_1",
      includes_public_holidays: true,
      privacy_mode: "named",
      scopes: [{ scope_type: "org", scope_value: null }],
    });
    mocks.resolvePeopleForFeed.mockResolvedValueOnce({
      ok: true,
      value: [
        {
          displayName: "Jane Smith",
          firstName: "Jane",
          id: "20000000-0000-4000-8000-000000000001",
          lastName: "Smith",
          location: {
            countryCode: "AU",
            id: "50000000-0000-4000-8000-000000000001",
            name: "Brisbane",
            regionCode: "QLD",
            timezone: "Australia/Brisbane",
          },
          locationId: "50000000-0000-4000-8000-000000000001",
          managerPersonId: null,
          team: null,
          teamId: null,
        },
        {
          displayName: "Moana Lee",
          firstName: "Moana",
          id: "20000000-0000-4000-8000-000000000002",
          lastName: "Lee",
          location: {
            countryCode: "NZ",
            id: "50000000-0000-4000-8000-000000000002",
            name: "Auckland",
            regionCode: "AUK",
            timezone: "Pacific/Auckland",
          },
          locationId: "50000000-0000-4000-8000-000000000002",
          managerPersonId: null,
          team: null,
          teamId: null,
        },
      ],
    });
    mocks.publicHolidayFindMany.mockResolvedValueOnce([
      {
        archived_at: null,
        assignments: [
          {
            archived_at: null,
            day_classification: "non_working",
            scope_type: "location",
            scope_value: "50000000-0000-4000-8000-000000000001",
          },
        ],
        country_code: "AU",
        default_classification: "working",
        holiday_date: new Date("2026-06-22T00:00:00.000Z"),
        id: "60000000-0000-4000-8000-000000000001",
        name: "Assigned Picnic Day",
        region_code: "NSW",
      },
      {
        archived_at: null,
        assignments: [
          {
            archived_at: null,
            day_classification: "working",
            scope_type: "location",
            scope_value: "50000000-0000-4000-8000-000000000001",
          },
        ],
        country_code: "AU",
        default_classification: "non_working",
        holiday_date: new Date("2026-06-23T00:00:00.000Z"),
        id: "60000000-0000-4000-8000-000000000002",
        name: "Local Trading Day",
        region_code: "QLD",
      },
      {
        archived_at: null,
        assignments: [],
        country_code: "CUSTOM",
        default_classification: "non_working",
        holiday_date: new Date("2026-06-24T00:00:00.000Z"),
        id: "60000000-0000-4000-8000-000000000003",
        name: "Company Holiday",
        region_code: null,
      },
      {
        archived_at: null,
        assignments: [],
        country_code: "CUSTOM",
        default_classification: "non_working",
        holiday_date: new Date("2026-06-24T00:00:00.000Z"),
        id: "60000000-0000-4000-8000-000000000003",
        name: "Company Holiday Duplicate",
        region_code: null,
      },
      {
        archived_at: null,
        assignments: [],
        country_code: "AU",
        default_classification: "non_working",
        holiday_date: new Date("2026-06-25T00:00:00.000Z"),
        id: "60000000-0000-4000-8000-000000000004",
        name: "State Holiday",
        region_code: "NSW",
      },
    ]);

    const result = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const publicHolidays = result.value.filter(
      (event) => event.isPublicHoliday
    );

    expect(publicHolidays).toHaveLength(2);
    expect(publicHolidays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allDay: true,
          displayName: "Public holiday: Assigned Picnic Day",
          endsAt: new Date("2026-06-23T00:00:00.000Z"),
          publishedUid:
            "60000000-0000-4000-8000-000000000001@ical.leavesync.app",
          sourceRecordId: "60000000-0000-4000-8000-000000000001",
          startsAt: new Date("2026-06-22T00:00:00.000Z"),
          summary: "Public holiday: Assigned Picnic Day",
        }),
        expect.objectContaining({
          displayName: "Public holiday: Company Holiday",
          endsAt: new Date("2026-06-25T00:00:00.000Z"),
          publishedUid:
            "60000000-0000-4000-8000-000000000003@ical.leavesync.app",
          sourceRecordId: "60000000-0000-4000-8000-000000000003",
          startsAt: new Date("2026-06-24T00:00:00.000Z"),
          summary: "Public holiday: Company Holiday",
        }),
      ])
    );
    expect(publicHolidays.map((event) => event.summary)).not.toContain(
      "Public holiday: Local Trading Day"
    );
    expect(publicHolidays.map((event) => event.summary)).not.toContain(
      "Public holiday: State Holiday"
    );
  });
});
