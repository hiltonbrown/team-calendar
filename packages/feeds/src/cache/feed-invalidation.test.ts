import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  withTenantDb as withTestTenantDb,
  withTenantResult as withTestTenantResult,
} from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  feedFindMany: vi.fn(),
  invalidateFeedCache: vi.fn(() =>
    Promise.resolve({ ok: true, value: { deletedCount: 1 } })
  ),
  loadFeedScopeData: vi.fn(),
  personFindMany: vi.fn(),
  resolvePeopleForFeed: vi.fn(),
}));

vi.mock("server-only", () => ({}));
const tenantTestState = vi.hoisted(() => ({
  client: null as Record<string, unknown> | null,
  queryRaw: vi.fn(async () => []),
}));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) => {
      if (!tenantTestState.client) {
        throw new Error("Missing feed fixture delegates");
      }
      return await executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: tenantTestState.queryRaw,
        ...tenantTestState.client,
      });
    },
  },
}));
vi.mock("@repo/database", async () => {
  const client = {
    feed: { findMany: mocks.feedFindMany },
    person: { findMany: mocks.personFindMany },
  };
  tenantTestState.client = client;
  return {
    ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
      "../../../database/src/tenant-db"
    )),
  };
});
vi.mock("../scope/feed-scope", () => ({
  loadFeedScopeData: mocks.loadFeedScopeData,
  resolvePeopleForFeed: mocks.resolvePeopleForFeed,
}));
vi.mock("./feed-cache", () => ({
  ALL_PRIVACY_MODES: ["named", "masked", "private"],
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
      organisation_id: ORGANISATION_ID,
      privacy_mode: "named",
      scopes: [{ scope_type: "person", scope_value: PERSON_IN_SCOPE }],
    },
    {
      created_by_user_id: null,
      id: "feed-b",
      organisation_id: ORGANISATION_ID,
      privacy_mode: "masked",
      scopes: [{ scope_type: "person", scope_value: "p-other" }],
    },
    {
      created_by_user_id: null,
      id: "feed-c",
      organisation_id: ORGANISATION_ID,
      privacy_mode: "private",
      scopes: [{ scope_type: "person", scope_value: PERSON_IN_SCOPE }],
    },
  ];
}

describe("feed cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feedFindMany.mockResolvedValue(feedFixtures());
    mocks.loadFeedScopeData.mockResolvedValue({
      ok: true,
      value: {
        people: [{ id: PERSON_IN_SCOPE, is_active: true }],
        teams: [],
      },
    });
    mocks.invalidateFeedCache.mockResolvedValue({
      ok: true,
      value: { deletedCount: 1 },
    });
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
    const result = await withTestTenantResult(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personId: PERSON_IN_SCOPE,
      }),
      (db) =>
        invalidateFeedCachesForPerson(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personId: PERSON_IN_SCOPE,
          },
          db
        )
    );

    expect(result).toEqual({
      ok: true,
      value: { feedIds: ["feed-a", "feed-c"] },
    });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateFeedCache).toHaveBeenCalledWith({
      feedId: "feed-a",
      privacyModes: ["named", "masked", "private"],
    });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledWith({
      feedId: "feed-c",
      privacyModes: ["named", "masked", "private"],
    });
  });

  it("does not invalidate any feed for an out-of-scope person", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personId: PERSON_OUT_OF_SCOPE,
      }),
      (db) =>
        invalidateFeedCachesForPerson(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personId: PERSON_OUT_OF_SCOPE,
          },
          db
        )
    );

    expect(result).toEqual({ ok: true, value: { feedIds: [] } });
    expect(mocks.invalidateFeedCache).not.toHaveBeenCalled();
  });

  it("binds feed invalidation reads to the caller account", async () => {
    await withTestTenantDb(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personIds: [PERSON_IN_SCOPE],
      }),
      (db) =>
        feedIdsForPeople(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personIds: [PERSON_IN_SCOPE],
          },
          db
        )
    );
    expect(tenantTestState.queryRaw).toHaveBeenCalledWith(
      expect.any(Array),
      CLERK_ORG_ID
    );
  });

  it("scopes the feed lookup by both clerk org and organisation", async () => {
    await withTestTenantDb(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personIds: [PERSON_IN_SCOPE],
      }),
      (db) =>
        feedIdsForPeople(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personIds: [PERSON_IN_SCOPE],
          },
          db
        )
    );

    expect(mocks.feedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          OR: [{ organisation_id: ORGANISATION_ID }, { organisation_id: null }],
          status: "active",
        }),
      })
    );
  });

  it("returns no feeds when there are no people to match", async () => {
    const feeds = await withTestTenantDb(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personIds: [],
      }),
      (db) =>
        feedIdsForPeople(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personIds: [],
          },
          db
        )
    );

    expect(feeds).toEqual([]);
    expect(mocks.feedFindMany).not.toHaveBeenCalled();
  });

  it("calls loadFeedScopeData once across all active feeds rather than once per feed", async () => {
    await withTestTenantDb(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personIds: [PERSON_IN_SCOPE],
      }),
      (db) =>
        feedIdsForPeople(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personIds: [PERSON_IN_SCOPE],
          },
          db
        )
    );

    expect(mocks.loadFeedScopeData).toHaveBeenCalledTimes(1);
    expect(mocks.resolvePeopleForFeed).toHaveBeenCalledTimes(3);
    for (const call of mocks.resolvePeopleForFeed.mock.calls) {
      expect(call[0].preloaded).toBeDefined();
    }
  });

  it("aborts scope reads when the shared SQL lookup fails", async () => {
    mocks.loadFeedScopeData.mockResolvedValue({
      error: { code: "unknown_error", message: "scope load failed" },
      ok: false,
    });
    await expect(
      withTestTenantDb(
        tenantTestAccount({
          clerkOrgId: CLERK_ORG_ID,
          organisationId: ORGANISATION_ID,
          personIds: [PERSON_IN_SCOPE],
        }),
        (db) =>
          feedIdsForPeople(
            {
              clerkOrgId: CLERK_ORG_ID,
              organisationId: ORGANISATION_ID,
              personIds: [PERSON_IN_SCOPE],
            },
            db
          )
      )
    ).rejects.toThrow("scope load failed");
    expect(mocks.resolvePeopleForFeed).not.toHaveBeenCalled();
    expect(mocks.invalidateFeedCache).not.toHaveBeenCalled();
  });

  it("invalidates defensively when scope resolution fails for a feed", async () => {
    mocks.resolvePeopleForFeed.mockResolvedValue({
      error: { code: "unknown_error", message: "boom" },
      ok: false,
    });

    const feeds = await withTestTenantDb(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personIds: [PERSON_IN_SCOPE],
      }),
      (db) =>
        feedIdsForPeople(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personIds: [PERSON_IN_SCOPE],
          },
          db
        )
    );

    expect(feeds).toEqual([
      { id: "feed-a", organisationId: ORGANISATION_ID, privacyMode: "named" },
      { id: "feed-b", organisationId: ORGANISATION_ID, privacyMode: "masked" },
      { id: "feed-c", organisationId: ORGANISATION_ID, privacyMode: "private" },
    ]);
  });

  it("attempts invalidation for all feeds even when one feed invalidation fails", async () => {
    mocks.invalidateFeedCache
      .mockResolvedValueOnce({
        error: { code: "unknown_error", message: "KV error on feed-a" },
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { deletedCount: 1 },
      });

    const result = await withTestTenantResult(
      tenantTestAccount({
        clerkOrgId: CLERK_ORG_ID,
        organisationId: ORGANISATION_ID,
        personId: PERSON_IN_SCOPE,
      }),
      (db) =>
        invalidateFeedCachesForPerson(
          {
            clerkOrgId: CLERK_ORG_ID,
            organisationId: ORGANISATION_ID,
            personId: PERSON_IN_SCOPE,
          },
          db
        )
    );

    expect(result).toEqual({
      ok: true,
      value: { feedIds: ["feed-a", "feed-c"] },
    });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledTimes(4);
    expect(mocks.invalidateFeedCache).toHaveBeenNthCalledWith(1, {
      feedId: "feed-a",
      privacyModes: ["named", "masked", "private"],
    });
    expect(mocks.invalidateFeedCache).toHaveBeenNthCalledWith(2, {
      feedId: "feed-c",
      privacyModes: ["named", "masked", "private"],
    });
  });
});

it("invalidates every account feed when a company record changes, including departed people", async () => {
  mocks.feedFindMany.mockResolvedValue([
    {
      created_by_user_id: null,
      id: "account-feed",
      organisation_id: null,
      privacy_mode: "named",
      scopes: [],
    },
  ]);
  mocks.loadFeedScopeData.mockResolvedValue({
    ok: true,
    value: { people: [], teams: [] },
  });
  mocks.resolvePeopleForFeed.mockResolvedValue({ ok: true, value: [] });
  const result = await withTestTenantResult(
    tenantTestAccount({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personId: PERSON_OUT_OF_SCOPE,
    }),
    (db) =>
      invalidateFeedCachesForPerson(
        {
          clerkOrgId: CLERK_ORG_ID,
          organisationId: ORGANISATION_ID,
          personId: PERSON_OUT_OF_SCOPE,
        },
        db
      )
  );
  expect(result).toEqual({ ok: true, value: { feedIds: ["account-feed"] } });
  expect(mocks.feedFindMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        clerk_org_id: CLERK_ORG_ID,
        OR: [{ organisation_id: ORGANISATION_ID }, { organisation_id: null }],
      }),
    })
  );
});
