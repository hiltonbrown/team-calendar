import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  feedCacheKey: vi.fn(() => "feed:cache:key"),
  feedFindFirst: vi.fn(),
  invalidateFeedCache: vi.fn(() =>
    Promise.resolve({ ok: true, value: { deletedCount: 0 } })
  ),
  renderFeedBody: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: { body: "BEGIN:VCALENDAR", etag: "abc" },
    })
  ),
  setCachedFeedBody: vi.fn(() =>
    Promise.resolve({ ok: true, value: undefined })
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "rebuild-feed-cache" })),
    send: vi.fn(),
  },
}));
vi.mock("@repo/database", () => ({
  database: { feed: { findFirst: mocks.feedFindFirst } },
}));
vi.mock("@repo/feeds", () => ({
  feedCacheKey: mocks.feedCacheKey,
  invalidateFeedCache: mocks.invalidateFeedCache,
  renderFeedBody: mocks.renderFeedBody,
  setCachedFeedBody: mocks.setCachedFeedBody,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));

const { rebuildFeedCache } = await import("./rebuild-feed-cache");

const CLERK_ORG_ID = "org_rebuild";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const FEED_ID = "20000000-0000-4000-8000-000000000001";

function input(overrides: Record<string, unknown> = {}) {
  return {
    clerkOrgId: CLERK_ORG_ID,
    feedId: FEED_ID,
    organisationId: ORGANISATION_ID,
    ...overrides,
  };
}

describe("rebuildFeedCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feedCacheKey.mockReturnValue("feed:cache:key");
    mocks.feedFindFirst.mockResolvedValue({
      id: FEED_ID,
      name: "Team feed",
      privacy_mode: "named",
      updated_at: new Date("2026-05-01T00:00:00.000Z"),
    });
  });

  it("scopes the feed lookup by both clerk org and organisation", async () => {
    await rebuildFeedCache(input());

    expect(mocks.feedFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          id: FEED_ID,
          organisation_id: ORGANISATION_ID,
          status: "active",
        }),
      })
    );
  });

  it("invalidates then regenerates the cached body under the renderer key", async () => {
    const result = await rebuildFeedCache(input());

    expect(result).toEqual({
      ok: true,
      value: { feedId: FEED_ID, rebuilt: true, skipped: false },
    });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledWith({ feedId: FEED_ID });
    expect(mocks.renderFeedBody).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: CLERK_ORG_ID,
        feedId: FEED_ID,
        organisationId: ORGANISATION_ID,
        privacyMode: "named",
      })
    );
    expect(mocks.setCachedFeedBody).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "BEGIN:VCALENDAR",
        etag: "abc",
        key: "feed:cache:key",
      })
    );
  });

  it("drops the cache and skips when the feed is not active in scope", async () => {
    mocks.feedFindFirst.mockResolvedValue(null);

    const result = await rebuildFeedCache(input());

    expect(result).toEqual({
      ok: true,
      value: { feedId: FEED_ID, rebuilt: false, skipped: true },
    });
    expect(mocks.invalidateFeedCache).toHaveBeenCalledWith({ feedId: FEED_ID });
    expect(mocks.renderFeedBody).not.toHaveBeenCalled();
    expect(mocks.setCachedFeedBody).not.toHaveBeenCalled();
  });

  it("rejects payloads missing a scope key", async () => {
    const result = await rebuildFeedCache(input({ organisationId: undefined }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });
});
