import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const record = {
    all_day: true,
    contactability: "unavailable",
    derived_sequence: 0,
    derived_uid_key: "fallback@ical.teamcalendar.online",
    ends_at: new Date("2026-05-08T00:00:00.000Z"),
    id: "10000000-0000-4000-8000-000000000001",
    notes_internal: "Internal note",
    person: {
      display_name: null,
      first_name: "Jane",
      last_name: "Smith",
      location: { name: "Brisbane" },
    },
    privacy_mode: "named",
    publication: {
      published_sequence: 3,
      published_uid: "published@ical.teamcalendar.online",
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
    record,
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

const { labelForRecordType, projectFeedEvents } = await import(
  "./feed-projection"
);

const baseInput = {
  actingRole: "viewer" as const,
  clerkOrgId: "org_projection",
  feedId: "30000000-0000-4000-8000-000000000001",
  horizonDays: 30,
  organisationId: "40000000-0000-4000-8000-000000000001",
};

function mockFeedRecord(record: { ends_at: Date; starts_at: Date }) {
  mocks.feedFindFirst.mockResolvedValueOnce({
    created_by_user_id: "user_1",
    includes_public_holidays: false,
    privacy_mode: "named",
    scopes: [{ scope_type: "org", scope_value: null }],
  });
  mocks.availabilityRecordFindMany.mockImplementationOnce(
    (query: {
      where: {
        ends_at: { gte: Date };
        starts_at: { lt: Date };
      };
    }) => {
      const endsAfterHorizon = record.ends_at >= query.where.ends_at.gte;
      const startsBeforeHorizonEnd =
        record.starts_at < query.where.starts_at.lt;
      return Promise.resolve(
        endsAfterHorizon && startsBeforeHorizonEnd ? [record] : []
      );
    }
  );
}

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
      description: null,
      location: "Brisbane",
      publishedSequence: 3,
      publishedUid: "published@ical.teamcalendar.online",
      sourceRecordId: "10000000-0000-4000-8000-000000000001",
      summary: "Jane Smith: Annual Leave",
    });
    expect(masked.ok && masked.value[0]).toMatchObject({
      description: null,
      location: "Brisbane",
      summary: "Out of office",
    });
    expect(privateFeed.ok && privateFeed.value[0]).toMatchObject({
      description: null,
      location: null,
      summary: "Busy",
    });
  });

  it.each([
    ["named", "masked", "Out of office", "Brisbane"],
    ["masked", "named", "Out of office", "Brisbane"],
    ["named", "private", "Busy", null],
    ["private", "named", "Busy", null],
  ] as const)(
    "uses the stricter of %s record privacy and %s feed privacy",
    async (recordPrivacy, feedPrivacy, summary, location) => {
      mocks.availabilityRecordFindMany.mockResolvedValueOnce([
        { ...mocks.record, privacy_mode: recordPrivacy },
      ]);

      const result = await projectFeedEvents({
        ...baseInput,
        privacyMode: feedPrivacy,
      });

      expect(result.ok && result.value[0]).toMatchObject({ location, summary });
    }
  );

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
            "60000000-0000-4000-8000-000000000001@ical.teamcalendar.online",
          sourceRecordId: "60000000-0000-4000-8000-000000000001",
          startsAt: new Date("2026-06-22T00:00:00.000Z"),
          summary: "Public holiday: Assigned Picnic Day",
        }),
        expect.objectContaining({
          displayName: "Public holiday: Company Holiday",
          endsAt: new Date("2026-06-25T00:00:00.000Z"),
          publishedUid:
            "60000000-0000-4000-8000-000000000003@ical.teamcalendar.online",
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

  it("converts a one-day all-day record inclusive end at 23:59:59.999 to the next midnight exclusive", async () => {
    mocks.feedFindFirst.mockResolvedValueOnce({
      created_by_user_id: "user_1",
      includes_public_holidays: false,
      privacy_mode: "named",
      scopes: [{ scope_type: "org", scope_value: null }],
    });
    mocks.availabilityRecordFindMany.mockResolvedValueOnce([
      {
        all_day: true,
        contactability: "unavailable",
        derived_sequence: 0,
        derived_uid_key: "fallback@ical.teamcalendar.online",
        ends_at: new Date("2026-05-07T23:59:59.999Z"),
        id: "10000000-0000-4000-8000-000000000002",
        person: {
          display_name: null,
          first_name: "Jane",
          last_name: "Smith",
          location: { name: "Brisbane" },
        },
        publication: null,
        record_type: "annual_leave",
        starts_at: new Date("2026-05-07T00:00:00.000Z"),
        title: null,
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
    expect(result.value).toHaveLength(1);
    expect(result.value[0].endsAt.toISOString()).toBe(
      "2026-05-08T00:00:00.000Z"
    );
    expect(result.value[0].startsAt.toISOString()).toBe(
      "2026-05-07T00:00:00.000Z"
    );
  });

  it("projects a Xero-shaped all-day record throughout its final day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:00:00.000Z"));
    const record = {
      all_day: true,
      contactability: "unavailable",
      derived_sequence: 0,
      derived_uid_key: "fallback@ical.teamcalendar.online",
      ends_at: new Date("2026-05-08T00:00:00.000Z"),
      id: "10000000-0000-4000-8000-000000000005",
      person: {
        display_name: null,
        first_name: "Jane",
        last_name: "Smith",
        location: { name: "Brisbane" },
      },
      publication: null,
      record_type: "annual_leave",
      starts_at: new Date("2026-05-07T00:00:00.000Z"),
      title: null,
    };
    mockFeedRecord(record);

    const result = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].sourceRecordId).toBe(record.id);
  });

  it("projects a Team Calendar all-day record throughout its final day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:00:00.000Z"));
    const record = {
      all_day: true,
      contactability: "unavailable",
      derived_sequence: 0,
      derived_uid_key: "fallback@ical.teamcalendar.online",
      ends_at: new Date("2026-05-08T23:59:59.999Z"),
      id: "10000000-0000-4000-8000-000000000006",
      person: {
        display_name: null,
        first_name: "Jane",
        last_name: "Smith",
        location: { name: "Brisbane" },
      },
      publication: null,
      record_type: "annual_leave",
      starts_at: new Date("2026-05-08T00:00:00.000Z"),
      title: null,
    };
    mockFeedRecord(record);

    const result = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].sourceRecordId).toBe(record.id);
  });

  it("does not project a record that ended the previous day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:00:00.000Z"));
    const record = {
      all_day: true,
      contactability: "unavailable",
      derived_sequence: 0,
      derived_uid_key: "fallback@ical.teamcalendar.online",
      ends_at: new Date("2026-05-07T00:00:00.000Z"),
      id: "10000000-0000-4000-8000-000000000007",
      person: {
        display_name: null,
        first_name: "Jane",
        last_name: "Smith",
        location: { name: "Brisbane" },
      },
      publication: null,
      record_type: "annual_leave",
      starts_at: new Date("2026-05-06T00:00:00.000Z"),
      title: null,
    };
    mockFeedRecord(record);

    const result = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(0);
  });

  it("projects a record starting tomorrow within the horizon", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:00:00.000Z"));
    const record = {
      all_day: true,
      contactability: "unavailable",
      derived_sequence: 0,
      derived_uid_key: "fallback@ical.teamcalendar.online",
      ends_at: new Date("2026-05-10T00:00:00.000Z"),
      id: "10000000-0000-4000-8000-000000000008",
      person: {
        display_name: null,
        first_name: "Jane",
        last_name: "Smith",
        location: { name: "Brisbane" },
      },
      publication: null,
      record_type: "annual_leave",
      starts_at: new Date("2026-05-09T00:00:00.000Z"),
      title: null,
    };
    mockFeedRecord(record);

    const result = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].sourceRecordId).toBe(record.id);
  });

  it("keeps the far edge of the horizon exclusive", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:00:00.000Z"));
    const record = {
      all_day: true,
      contactability: "unavailable",
      derived_sequence: 0,
      derived_uid_key: "fallback@ical.teamcalendar.online",
      ends_at: new Date("2026-06-08T00:00:00.000Z"),
      id: "10000000-0000-4000-8000-000000000009",
      person: {
        display_name: null,
        first_name: "Jane",
        last_name: "Smith",
        location: { name: "Brisbane" },
      },
      publication: null,
      record_type: "annual_leave",
      starts_at: new Date("2026-06-07T00:00:00.000Z"),
      title: null,
    };
    mockFeedRecord(record);

    const result = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(0);
  });

  it("converts a multi-day Xero-shaped all-day record inclusive midnight end to the following midnight", async () => {
    mocks.feedFindFirst.mockResolvedValueOnce({
      created_by_user_id: "user_1",
      includes_public_holidays: false,
      privacy_mode: "named",
      scopes: [{ scope_type: "org", scope_value: null }],
    });
    mocks.availabilityRecordFindMany.mockResolvedValueOnce([
      {
        all_day: true,
        contactability: "unavailable",
        derived_sequence: 0,
        derived_uid_key: "fallback@ical.teamcalendar.online",
        ends_at: new Date("2026-05-09T00:00:00.000Z"),
        id: "10000000-0000-4000-8000-000000000003",
        person: {
          display_name: null,
          first_name: "Jane",
          last_name: "Smith",
          location: { name: "Brisbane" },
        },
        publication: null,
        record_type: "annual_leave",
        starts_at: new Date("2026-05-07T00:00:00.000Z"),
        title: null,
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
    expect(result.value[0].endsAt.toISOString()).toBe(
      "2026-05-10T00:00:00.000Z"
    );
  });

  it("leaves timed records unchanged", async () => {
    const startsAt = new Date("2026-05-07T09:00:00.000Z");
    const endsAt = new Date("2026-05-07T17:00:00.000Z");
    mocks.feedFindFirst.mockResolvedValueOnce({
      created_by_user_id: "user_1",
      includes_public_holidays: false,
      privacy_mode: "named",
      scopes: [{ scope_type: "org", scope_value: null }],
    });
    mocks.availabilityRecordFindMany.mockResolvedValueOnce([
      {
        all_day: false,
        contactability: "unavailable",
        derived_sequence: 0,
        derived_uid_key: "fallback@ical.teamcalendar.online",
        ends_at: endsAt,
        id: "10000000-0000-4000-8000-000000000004",
        person: {
          display_name: null,
          first_name: "Jane",
          last_name: "Smith",
          location: { name: "Brisbane" },
        },
        publication: null,
        record_type: "annual_leave",
        starts_at: startsAt,
        title: null,
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
    expect(result.value[0].endsAt).toBe(endsAt);
    expect(result.value[0].startsAt).toBe(startsAt);
    expect(result.value[0].allDay).toBe(false);
  });

  it("does not double-extend public holiday exclusive ends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T09:00:00.000Z"));

    mocks.feedFindFirst.mockResolvedValueOnce({
      created_by_user_id: "user_1",
      includes_public_holidays: true,
      privacy_mode: "named",
      scopes: [{ scope_type: "org", scope_value: null }],
    });
    mocks.availabilityRecordFindMany.mockResolvedValueOnce([]);
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
      ],
    });
    mocks.publicHolidayFindMany.mockResolvedValueOnce([
      {
        archived_at: null,
        assignments: [],
        country_code: "CUSTOM",
        default_classification: "non_working",
        holiday_date: new Date("2026-06-22T00:00:00.000Z"),
        id: "60000000-0000-4000-8000-000000000005",
        name: "Holiday Day",
        region_code: null,
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
    const holiday = result.value.find((event) => event.isPublicHoliday);
    expect(holiday?.startsAt.toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(holiday?.endsAt.toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });

  it("queries public holidays in a single query bounded by the horizon window and excluding archived holidays", async () => {
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
      ],
    });
    mocks.publicHolidayFindMany.mockResolvedValueOnce([]);

    await projectFeedEvents({
      ...baseInput,
      horizonDays: 30,
      privacyMode: "named",
    });

    expect(mocks.publicHolidayFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.publicHolidayFindMany).toHaveBeenCalledWith({
      orderBy: { holiday_date: "asc" },
      select: {
        assignments: {
          select: {
            archived_at: true,
            day_classification: true,
            scope_type: true,
            scope_value: true,
          },
        },
        country_code: true,
        default_classification: true,
        holiday_date: true,
        id: true,
        name: true,
        region_code: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: baseInput.clerkOrgId,
        holiday_date: {
          gte: new Date("2026-06-20T00:00:00.000Z"),
          lte: new Date("2026-07-20T00:00:00.000Z"),
        },
        organisation_id: baseInput.organisationId,
      },
    });
  });

  it("produces deterministic output for a fixed mixed dataset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

    mocks.feedFindFirst.mockResolvedValueOnce({
      created_by_user_id: "user_1",
      includes_public_holidays: true,
      privacy_mode: "named",
      scopes: [{ scope_type: "org", scope_value: null }],
    });
    mocks.availabilityRecordFindMany.mockResolvedValueOnce([
      {
        all_day: true,
        contactability: "unavailable",
        derived_sequence: 1,
        derived_uid_key: "leave-1@ical.teamcalendar.online",
        ends_at: new Date("2026-05-03T00:00:00.000Z"),
        id: "10000000-0000-4000-8000-000000000010",
        notes_internal: null,
        person: {
          display_name: null,
          first_name: "Alice",
          last_name: "Walker",
          location: { name: "Brisbane" },
        },
        publication: {
          published_sequence: 1,
          published_uid: "pub-leave-1@ical.teamcalendar.online",
        },
        record_type: "annual_leave",
        starts_at: new Date("2026-05-02T00:00:00.000Z"),
        title: null,
      },
    ]);
    mocks.resolvePeopleForFeed.mockResolvedValueOnce({
      ok: true,
      value: [
        {
          displayName: "Alice Walker",
          firstName: "Alice",
          id: "20000000-0000-4000-8000-000000000010",
          lastName: "Walker",
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
      ],
    });
    mocks.publicHolidayFindMany.mockResolvedValueOnce([
      {
        archived_at: null,
        assignments: [],
        country_code: "AU",
        default_classification: "non_working",
        holiday_date: new Date("2026-05-04T00:00:00.000Z"),
        id: "60000000-0000-4000-8000-000000000020",
        name: "Labour Day",
        region_code: "QLD",
      },
    ]);

    const result = await projectFeedEvents({
      ...baseInput,
      horizonDays: 30,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual([
      {
        allDay: true,
        contactabilityStatus: "unavailable",
        description: null,
        displayName: "Alice Walker",
        endsAt: new Date("2026-05-04T00:00:00.000Z"),
        isPublicHoliday: false,
        location: "Brisbane",
        publishedSequence: 1,
        publishedUid: "pub-leave-1@ical.teamcalendar.online",
        recordType: "annual_leave",
        sourceRecordId: "10000000-0000-4000-8000-000000000010",
        startsAt: new Date("2026-05-02T00:00:00.000Z"),
        summary: "Alice Walker: Annual Leave",
      },
      {
        allDay: true,
        contactabilityStatus: null,
        description: null,
        displayName: "Public holiday: Labour Day",
        endsAt: new Date("2026-05-05T00:00:00.000Z"),
        isPublicHoliday: true,
        location: null,
        publishedSequence: 0,
        publishedUid:
          "60000000-0000-4000-8000-000000000020@ical.teamcalendar.online",
        recordType: "public_holiday",
        sourceRecordId: "60000000-0000-4000-8000-000000000020",
        startsAt: new Date("2026-05-04T00:00:00.000Z"),
        summary: "Public holiday: Labour Day",
      },
    ]);
  });

  describe("labelForRecordType", () => {
    it("prefers custom title override when present", () => {
      expect(labelForRecordType("annual_leave", "Trip to Japan")).toBe(
        "Trip to Japan"
      );
      expect(labelForRecordType("wfh", "WFH Afternoon")).toBe("WFH Afternoon");
    });

    it("falls back to centralised canonical label when title is null or whitespace", () => {
      expect(labelForRecordType("annual_leave", null)).toBe("Annual Leave");
      expect(labelForRecordType("annual_leave", "   ")).toBe("Annual Leave");
      expect(labelForRecordType("wfh", null)).toBe("Work From Home");
      expect(labelForRecordType("long_service_leave", null)).toBe(
        "Long Service Leave"
      );
      expect(labelForRecordType("travelling", null)).toBe("Travelling");
    });
  });
});
