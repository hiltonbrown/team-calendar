import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
