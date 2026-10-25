import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn(),
  feedCacheKey: vi.fn(() => "feed:cache:key"),
  feedFindFirst: vi.fn(),
  feedUpdateMany: vi.fn(),
  invalidateFeedCache: vi.fn(() =>
    Promise.resolve({ ok: true, value: { deletedCount: 0 } })
  ),
  renderFeedBody: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: {
        body: "BEGIN:VCALENDAR",
        etag: "abc",
        fingerprint: "current",
        generation: 1,
      },
    })
  ),
  scopeDatabase: null as Record<string, unknown> | null,
  setCachedFeedBody: vi.fn(() =>
    Promise.resolve({ ok: true, value: undefined })
  ),
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: mocks.createFunction,
    send: vi.fn(),
  },
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    // Real scope ownership and effects are exercised against this area's delegate fake.
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run({ ...mocks.scopeDatabase }),
  },
}));
vi.mock("@repo/database", async () => {
  const exports = {
    database: {
      feed: {
        findFirst: mocks.feedFindFirst,
        updateMany: mocks.feedUpdateMany,
      },
    },
  };
  const mockedModule = {
    ...exports,
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,
  };
  if (!("$executeRaw" in exports.database)) {
    Object.assign(exports.database, { $executeRaw: vi.fn(async () => 1) });
  }
  if (!("$queryRaw" in exports.database)) {
    Object.assign(exports.database, { $queryRaw: vi.fn(async () => []) });
  }
  mocks.scopeDatabase = exports.database;
  const core = await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  );
  return { ...mockedModule, ...core };
});
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
const ACCOUNT_ID = "org_rebuild";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const FEED_ID = "20000000-0000-4000-8000-000000000001";
function input(overrides: Record<string, unknown> = {}) {
  return {
    accountId: ACCOUNT_ID,
    feedId: FEED_ID,
    organisationId: ORGANISATION_ID,
    ...overrides,
  };
}
const registeredHandler = mocks.createFunction.mock.calls[0]?.[1];
it("throws execution failures with valid input at the queue boundary", async () => {
  const handler = registeredHandler;
  expect(handler).toBeTypeOf("function");
  mocks.feedFindFirst.mockResolvedValue({
    id: FEED_ID,
    name: "Team feed",
    privacy_mode: "named",
  });
  mocks.renderFeedBody.mockResolvedValueOnce({
    error: { code: "unknown_error", message: "Projection unavailable" },
    ok: false,
  });
  await expect(
    handler({
      event: {
        data: {
          account_id: ACCOUNT_ID,
          organisation_id: ORGANISATION_ID,
          ...{ feedId: FEED_ID },
        },
      },
      step: {
        run: (_name: string, execute: () => Promise<unknown>) => execute(),
      },
    })
  ).rejects.toThrow();
  expect(mocks.renderFeedBody).toHaveBeenCalled();
});
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
  it("rebuilds account-wide feeds with null company scope", async () => {
    const result = await rebuildFeedCache(input({ organisationId: null }));
    expect(result.ok).toBe(true);
    expect(mocks.renderFeedBody).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        feedId: FEED_ID,
        organisationId: null,
      })
    );
  });
  it("scopes the feed lookup by both account and organisation", async () => {
    await rebuildFeedCache(input());
    expect(mocks.feedFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: ACCOUNT_ID,
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
        accountId: ACCOUNT_ID,
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
  it("reports rendering failure instead of a successful rebuild", async () => {
    mocks.renderFeedBody.mockResolvedValueOnce({
      error: {
        code: "unknown_error",
        message: "Projection unavailable",
      },
      ok: false,
    });
    expect(await rebuildFeedCache(input())).toMatchObject({ ok: false });
    expect(mocks.setCachedFeedBody).not.toHaveBeenCalled();
  });
  it("reports KV failure instead of claiming the body was cached", async () => {
    mocks.setCachedFeedBody.mockResolvedValueOnce({
      error: {
        code: "unknown_error",
        message: "Cache unavailable",
      },
      ok: false,
    });
    expect(await rebuildFeedCache(input())).toMatchObject({ ok: false });
  });
  it("rejects payloads missing a scope key", async () => {
    const result = await rebuildFeedCache(input({ organisationId: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });
});
