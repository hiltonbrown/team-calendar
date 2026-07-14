import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedCacheKey } from "./feed-cache";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
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
      privacyMode: "named",
      feedUpdatedAt: new Date("2026-07-01"),
    } as any);
    const key2 = feedCacheKey({
      feedId: "feed-123",
      privacyMode: "named",
      feedUpdatedAt: new Date("2026-07-02"),
    } as any);
    expect(key1).toBe(key2);
    expect(key1).toBe("feed:feed-123:named");
  });
});
