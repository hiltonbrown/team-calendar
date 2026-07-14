import "server-only";

import type { Result } from "@repo/core";
import { keys } from "../../keys";

export interface FeedCacheError {
  code: "unknown_error";
  message: string;
}

export interface CachedFeedBody {
  body: string;
  etag: string;
}

interface FeedCacheClient {
  del: (...keys: string[]) => Promise<unknown>;
  get: <T>(key: string) => Promise<T | null>;
  scan: (
    cursor: number,
    options: { count?: number; match?: string }
  ) => Promise<[number, string[]]>;
  set: <T>(
    key: string,
    value: T,
    options?: { ex?: number }
  ) => Promise<unknown>;
}

let cacheClient: FeedCacheClient | null = null;
let cacheClientResolved = false;

export function feedCacheKey(input: {
  feedId: string;
  privacyMode: string;
}): string {
  return `feed:${input.feedId}:${input.privacyMode}`;
}

export async function getCachedFeedBody(
  key: string
): Promise<Result<CachedFeedBody | null, FeedCacheError>> {
  try {
    const client = getFeedCacheClient();
    if (!client) {
      return { ok: true, value: null };
    }
    const value = await client.get<CachedFeedBody>(key);
    return { ok: true, value };
  } catch {
    return cacheError("Failed to read feed cache.");
  }
}

export async function setCachedFeedBody(input: {
  body: string;
  etag: string;
  key: string;
  ttlSeconds?: number;
}): Promise<Result<void, FeedCacheError>> {
  try {
    const client = getFeedCacheClient();
    if (!client) {
      return { ok: true, value: undefined };
    }
    await client.set(
      input.key,
      { body: input.body, etag: input.etag },
      input.ttlSeconds ? { ex: input.ttlSeconds } : undefined
    );
    return { ok: true, value: undefined };
  } catch {
    return cacheError("Failed to write feed cache.");
  }
}

export async function invalidateFeedCache(input: {
  feedId: string;
}): Promise<Result<{ deletedCount: number }, FeedCacheError>> {
  try {
    const client = getFeedCacheClient();
    if (!client) {
      return { ok: true, value: { deletedCount: 0 } };
    }

    const keys: string[] = [];
    let cursor = 0;
    do {
      const [nextCursor, batch] = await client.scan(cursor, {
        count: 100,
        match: `feed:${input.feedId}:*`,
      });
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== 0);

    if (keys.length > 0) {
      await client.del(...keys);
    }
    return { ok: true, value: { deletedCount: keys.length } };
  } catch {
    return cacheError("Failed to invalidate feed cache.");
  }
}

export function setFeedCacheClientForTests(client: FeedCacheClient | null) {
  cacheClient = client;
  cacheClientResolved = true;
}

function getFeedCacheClient(): FeedCacheClient | null {
  if (cacheClientResolved) {
    return cacheClient;
  }
  // keys() validates the KV credential format and enforces both-or-neither,
  // throwing on a partial pair. So here either both values are present (enable
  // caching) or both are absent (degrade gracefully to no cache).
  const { KV_REST_API_TOKEN, KV_REST_API_URL } = keys();
  cacheClient =
    KV_REST_API_URL && KV_REST_API_TOKEN
      ? createRestCacheClient({
          token: KV_REST_API_TOKEN,
          url: KV_REST_API_URL,
        })
      : null;
  cacheClientResolved = true;
  return cacheClient;
}

function createRestCacheClient(input: {
  token: string;
  url: string;
}): FeedCacheClient {
  const command = async <T>(parts: unknown[]): Promise<T> => {
    const response = await fetch(input.url, {
      body: JSON.stringify(parts),
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("KV command failed");
    }
    const payload = (await response.json()) as { result: T };
    return payload.result;
  };
  return {
    del: (...keys) => command(["del", ...keys]),
    get: async <T>(key: string): Promise<T | null> => {
      const value = await command<unknown>(["get", key]);
      if (value === null) {
        return null;
      }
      if (typeof value === "string") {
        return JSON.parse(value) as T;
      }
      return value as T;
    },
    scan: (cursor, options) =>
      command([
        "scan",
        cursor,
        ...(options.match ? ["match", options.match] : []),
        ...(options.count ? ["count", options.count] : []),
      ]),
    set: (key, value, options) =>
      command([
        "set",
        key,
        JSON.stringify(value),
        ...(options?.ex ? ["ex", options.ex] : []),
      ]),
  };
}

function cacheError(message: string): Result<never, FeedCacheError> {
  return { ok: false, error: { code: "unknown_error", message } };
}
