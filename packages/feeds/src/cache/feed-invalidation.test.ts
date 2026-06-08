import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  feedFindMany: vi.fn(),
  invalidateFeedCache: vi.fn(() =>
    Promise.resolve({ ok: true, value: { deletedCount: 1 } })
  ),
  resolvePeopleForFeed: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: { feed: { findMany: mocks.feedFindMany } },
}));
vi.mock("../scope/feed-scope", () => ({
  resolvePeopleForFeed: mocks.resolvePeopleForFeed,
}));
vi.mock("./feed-cache", () => ({
  invalidateFeedCache: mocks.invalidateFeedCache,
}));

const { feedIdsForPeople, invalidateFeedCachesForPerson } = await import(
  "./feed-invalidation"
);

const CLERK_ORG_ID = "org_feeds";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const PERSON_IN_SCOPE = "10000000-0000-4000-8000-000000000001";
const PERSON_OUT_OF_SCOPE = "10000000-0000-4000-8000-000000000099";

function feedFixtures() {
  return [
    {
      created_by_user_id: null,
      id: "feed-a",
      scopes: [{ scope_type: "person", scope_value: PERSON_IN_SCOPE }],
    },
    {
      created_by_user_id: null,
      id: "feed-b",
      scopes: [{ scope_type: "person", scope_value: "p-other" }],
    },
  ];
}

describe("feed cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feedFindMany.mockResolvedValue(feedFixtures());
    // Mirror person-scope resolution: a feed includes exactly the people named in its scopes.
    mocks.resolvePeopleForFeed.mockImplementation(
      (input: { scopes: Array<{ scopeType: string; scopeValue: string }> }) =>
        Promise.resolve({
          ok: true,
          value: input.scopes
            .filter((scope) => scope.scopeType === "person")
            .map((scope) => ({ id: scope.scopeValue })),
        })
    );
  });

  it("invalidates only the feeds whose scope includes the changed person", async () => {
    const result = await invalidateFeedCachesForPerson({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personId: PERSON_IN_SCOPE,
    });

    expect(result).toEqual({ ok: true, value: { feedIds: ["feed-a"] } });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateFeedCache).toHaveBeenCalledWith({
      feedId: "feed-a",
    });
  });

  it("does not invalidate any feed for an out-of-scope person", async () => {
    const result = await invalidateFeedCachesForPerson({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personId: PERSON_OUT_OF_SCOPE,
    });

    expect(result).toEqual({ ok: true, value: { feedIds: [] } });
    expect(mocks.invalidateFeedCache).not.toHaveBeenCalled();
  });

  it("scopes the feed lookup by both clerk org and organisation", async () => {
    await feedIdsForPeople({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personIds: [PERSON_IN_SCOPE],
    });

    expect(mocks.feedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          status: "active",
        }),
      })
    );
  });

  it("returns no feeds when there are no people to match", async () => {
    const feedIds = await feedIdsForPeople({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personIds: [],
    });

    expect(feedIds).toEqual([]);
    expect(mocks.feedFindMany).not.toHaveBeenCalled();
  });

  it("invalidates defensively when scope resolution fails", async () => {
    mocks.resolvePeopleForFeed.mockResolvedValue({
      ok: false,
      error: { code: "unknown_error", message: "boom" },
    });

    const feedIds = await feedIdsForPeople({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personIds: [PERSON_IN_SCOPE],
    });

    expect(feedIds).toEqual(["feed-a", "feed-b"]);
  });
});
