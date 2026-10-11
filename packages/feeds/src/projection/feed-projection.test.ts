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
    loadHolidayResolutionData: vi.fn(() => Promise.resolve(null)),
    record,
    referenceHolidays: vi.fn(() => [] as unknown[]),
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
vi.mock("@repo/database", () => {
  const client = {
    availabilityRecord: { findMany: mocks.availabilityRecordFindMany },
    feed: { findFirst: mocks.feedFindFirst },
  };
  return {
    loadHolidayResolutionData: mocks.loadHolidayResolutionData,
    tenantDatabase: vi.fn(() => client),
    tenantTransaction: vi.fn((_clerkOrgId, callback) => callback(client)),
  };
});
vi.mock(
  "../../../core/src/public-holidays/reference/reference-holidays",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    listReferenceHolidays: (input: { region: string | null }) =>
      (mocks.referenceHolidays() as Array<{ region: string | null }>).filter(
        (holiday) => holiday.region === null || holiday.region === input.region
      ),
  })
);

const { PUBLIC_HOLIDAY_DATA_VERSION } = await import("@repo/core");

function referenceHoliday(
  overrides: {
    date: string;
    id: string;
    name: string;
    region: string | null;
  } & Partial<{
    kind: "local" | "part_day" | "public";
    startsAt: string;
  }>
) {
  return {
    area: null,
    country: "AU",
    kind: "public",
    startsAt: null,
    ...overrides,
  };
}

function holidayData(overrides: Record<string, unknown>) {
  return {
    customHolidays: [],
    from: "2026-01-01",
    locations: [],
    organisation: { countryCode: "AU", regionCode: "QLD" },
    preferences: [],
    to: "2026-12-31",
    ...overrides,
  };
}
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
      summary: "Jane Smith: Annual leave",
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

  it("projects resolved holidays for the feed's locations once per holiday", async () => {
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
            timezone: "Australia/Brisbane",
          },
          locationId: "50000000-0000-4000-8000-000000000002",
          managerPersonId: null,
          team: null,
          teamId: null,
        },
      ],
    });
    mocks.referenceHolidays.mockReturnValue([
      referenceHoliday({
        date: "2026-06-22",
        id: "au-qld-2026-06-22-state-day",
        name: "State Day",
        region: "QLD",
      }),
      referenceHoliday({
        date: "2026-06-23",
        id: "au-qld-2026-06-23-eve",
        kind: "part_day",
        name: "Eve",
        region: "QLD",
        startsAt: "18:00",
      }),
      referenceHoliday({
        date: "2026-06-26",
        id: "au-nsw-2026-06-26-nsw-day",
        name: "NSW Day",
        region: "NSW",
      }),
    ]);
    mocks.loadHolidayResolutionData.mockResolvedValueOnce(
      holidayData({
        customHolidays: [
          {
            countryCode: "CUSTOM",
            date: "2026-06-24",
            defaultClassification: "non_working",
            id: "c-1",
            name: "Company Holiday",
            regionCode: null,
            updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          },
        ],
        locations: [
          {
            countryCode: "AU",
            id: "50000000-0000-4000-8000-000000000001",
            regionCode: "QLD",
          },
          {
            countryCode: "NZ",
            id: "50000000-0000-4000-8000-000000000002",
            regionCode: "AUK",
          },
        ],
        preferences: [
          {
            holidayKey: "au-qld-2026-06-22-state-day",
            locationId: "50000000-0000-4000-8000-000000000001",
            setting: "working",
          },
        ],
      })
    );

    const result = await projectFeedEvents({
      ...baseInput,
      privacyMode: "named",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const holidays = result.value.filter((event) => event.isPublicHoliday);
    expect(holidays.map((event) => event.sourceRecordId)).toEqual([
      "au-qld-2026-06-23-eve",
      "c-1",
    ]);
    expect(holidays[0]).toMatchObject({
      allDay: true,
      endsAt: new Date("2026-06-24T00:00:00.000Z"),
      publishedUid: `${"40000000-0000-4000-8000-000000000001"}-au-qld-2026-06-23-eve@ical.teamcalendar.online`,
      startsAt: new Date("2026-06-23T00:00:00.000Z"),
      summary: "Public holiday from 18:00: Eve",
    });
    expect(holidays[1]).toMatchObject({
      displayName: "Public holiday: Company Holiday",
      publishedAt: new Date("2026-06-01T00:00:00.000Z"),
      publishedUid: "c-1@ical.teamcalendar.online",
    });
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
    mocks.loadHolidayResolutionData.mockResolvedValueOnce(
      holidayData({
        customHolidays: [
          {
            countryCode: "CUSTOM",
            date: "2026-06-22",
            defaultClassification: "non_working",
            id: "c-2",
            name: "Holiday Day",
            regionCode: null,
          },
        ],
        locations: [
          {
            countryCode: "AU",
            id: "50000000-0000-4000-8000-000000000001",
            regionCode: "QLD",
          },
        ],
      })
    );

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

  it("loads holiday data once for the horizon window within the tenant", async () => {
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

    await projectFeedEvents({
      ...baseInput,
      horizonDays: 30,
      privacyMode: "named",
    });

    expect(mocks.loadHolidayResolutionData).toHaveBeenCalledTimes(1);
    expect(mocks.loadHolidayResolutionData.mock.calls[0]?.[0]).toEqual({
      clerkOrgId: baseInput.clerkOrgId,
      from: "2026-06-20",
      organisationId: baseInput.organisationId,
      to: "2026-07-20",
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
    mocks.referenceHolidays.mockReturnValue([
      referenceHoliday({
        date: "2026-05-04",
        id: "au-qld-2026-05-04-labour-day",
        name: "Labour Day",
        region: "QLD",
      }),
    ]);
    mocks.loadHolidayResolutionData.mockResolvedValueOnce(
      holidayData({
        locations: [
          {
            countryCode: "AU",
            id: "50000000-0000-4000-8000-000000000001",
            regionCode: "QLD",
          },
        ],
      })
    );

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
        eventClass: "PUBLIC",
        hasPublication: false,
        isPublicHoliday: false,
        location: "Brisbane",
        publishedAt: undefined,
        publishedSequence: 1,
        publishedUid: "pub-leave-1@ical.teamcalendar.online",
        recordType: "annual_leave",
        sourceRecordId: "10000000-0000-4000-8000-000000000010",
        startsAt: new Date("2026-05-02T00:00:00.000Z"),
        summary: "Alice Walker: Annual leave",
      },
      {
        allDay: true,
        contactabilityStatus: null,
        description: null,
        displayName: "Public holiday: Labour Day",
        endsAt: new Date("2026-05-05T00:00:00.000Z"),
        eventClass: "PUBLIC",
        hasPublication: false,
        isPublicHoliday: true,
        location: null,
        publishedAt: new Date(`${PUBLIC_HOLIDAY_DATA_VERSION}T00:00:00.000Z`),
        publishedSequence: 0,
        publishedUid: `${"40000000-0000-4000-8000-000000000001"}-au-qld-2026-05-04-labour-day@ical.teamcalendar.online`,
        recordType: "public_holiday",
        sourceRecordId: "au-qld-2026-05-04-labour-day",
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
      expect(labelForRecordType("annual_leave", null)).toBe("Annual leave");
      expect(labelForRecordType("annual_leave", "   ")).toBe("Annual leave");
      expect(labelForRecordType("wfh", null)).toBe("Working from home");
      expect(labelForRecordType("long_service_leave", null)).toBe(
        "Long service leave"
      );
      expect(labelForRecordType("travelling", null)).toBe("Travelling");
    });
  });
});
