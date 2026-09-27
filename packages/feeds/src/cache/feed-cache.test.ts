import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_PRIVACY_MODES,
  feedCacheKey,
  invalidateFeedCache,
  purgeFeedCacheEntries,
  setFeedCacheClientForTests,
} from "./feed-cache";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  setFeedCacheClientForTests(null);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  setFeedCacheClientForTests(null);
});

async function readCache() {
  const { getCachedFeedBody } = await import("./feed-cache");
  return getCachedFeedBody("feed:test:key");
}

describe("feed cache KV configuration", () => {
  it("degrades gracefully to no cache when neither value is set", async () => {
    const result = await readCache();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("fails fast when the URL is set without the token", async () => {
    process.env.KV_REST_API_URL = "https://example.kv.vercel-storage.com";

    const result = await readCache();

    expect(result.ok).toBe(false);
  });

  it("fails fast when the token is set without the URL", async () => {
    process.env.KV_REST_API_TOKEN = "token";

    const result = await readCache();

    expect(result.ok).toBe(false);
  });
});

describe("feedCacheKey", () => {
  it("returns the same string for the same feedId + privacyMode regardless of any date", () => {
    const key1 = feedCacheKey({
      feedId: "feed-123",
      privacyMode: "named",
    });
    expect(key1).toBe("feed:feed-123:named");
  });

  it("produces identical key even when legacy feedUpdatedAt differs", () => {
    const key1 = feedCacheKey({
      feedId: "feed-123",
      feedUpdatedAt: new Date("2026-07-01"),
      privacyMode: "named",
    } as any);
    const key2 = feedCacheKey({
      feedId: "feed-123",
      feedUpdatedAt: new Date("2026-07-02"),
      privacyMode: "named",
    } as any);
    expect(key1).toBe(key2);
    expect(key1).toBe("feed:feed-123:named");
  });
});

describe("invalidateFeedCache", () => {
  it("calls client.del once with computed keys and never calls client.scan", async () => {
    const delMock = vi.fn().mockResolvedValue(3);
    const scanMock = vi.fn();
    setFeedCacheClientForTests({
      del: delMock,
      get: vi.fn(),
      scan: scanMock,
      set: vi.fn(),
    });

    const result = await invalidateFeedCache({ feedId: "feed-xyz" });

    expect(result).toEqual({ ok: true, value: { deletedCount: 3 } });
    expect(delMock).toHaveBeenCalledTimes(1);
    expect(delMock).toHaveBeenCalledWith(
      "feed:feed-xyz:named",
      "feed:feed-xyz:masked",
      "feed:feed-xyz:private"
    );
    expect(scanMock).not.toHaveBeenCalled();
  });

  it("returns ok: true with deletedCount: 0 when no client is configured", async () => {
    setFeedCacheClientForTests(null);

    const result = await invalidateFeedCache({ feedId: "feed-xyz" });

    expect(result).toEqual({ ok: true, value: { deletedCount: 0 } });
  });

  it("returns ok: false with cache error when client throws", async () => {
    const delMock = vi.fn().mockRejectedValue(new Error("KV connection lost"));
    setFeedCacheClientForTests({
      del: delMock,
      get: vi.fn(),
      scan: vi.fn(),
      set: vi.fn(),
    });

    const result = await invalidateFeedCache({ feedId: "feed-xyz" });

    expect(result).toEqual({
      error: {
        code: "unknown_error",
        message: "Failed to invalidate feed cache.",
      },
      ok: false,
    });
  });

  it("matches expected privacy modes", () => {
    expect(ALL_PRIVACY_MODES).toEqual(["named", "masked", "private"]);
  });
});

describe("immutable cache fixture purge", () => {
  const feedId = "10000000-0000-4000-8000-000000000001";
  it("coerces Redis string cursors and removes only exact feed prefix keys", async () => {
    const del = vi.fn().mockResolvedValue(1);
    const scan = vi
      .fn()
      .mockResolvedValueOnce(["2", [`feed:${feedId}:old`]])
      .mockResolvedValueOnce(["0", [`feed:${feedId}:new`]]);
    setFeedCacheClientForTests({ del, get: vi.fn(), scan, set: vi.fn() });
    expect(await purgeFeedCacheEntries({ feedId })).toEqual({
      ok: true,
      value: { deletedCount: 2 },
    });
    expect(del).toHaveBeenCalledWith(
      `feed:${feedId}:old`,
      `feed:${feedId}:new`
    );
    expect(scan).toHaveBeenCalledTimes(2);
  });
  it("refuses foreign keys and never deletes them", async () => {
    const del = vi.fn();
    setFeedCacheClientForTests({
      del,
      get: vi.fn(),
      scan: vi.fn().mockResolvedValue(["0", ["feed:foreign:key"]]),
      set: vi.fn(),
    });
    expect(await purgeFeedCacheEntries({ feedId })).toMatchObject({
      ok: false,
    });
    expect(del).not.toHaveBeenCalled();
  });
});
