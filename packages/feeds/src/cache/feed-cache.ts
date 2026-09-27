import "server-only";

import { executeRedisRestCommand, type Result } from "@repo/core";
import { z } from "zod";
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

export const ALL_PRIVACY_MODES = ["named", "masked", "private"] as const;

export function feedCacheKey(input: {
  feedId: string;
  etag?: string;
  privacyMode?: string;
}): string {
  return `feed:${input.feedId}:${input.etag ?? input.privacyMode}`;
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
  privacyModes?: string[];
}): Promise<Result<{ deletedCount: number }, FeedCacheError>> {
  try {
    const client = getFeedCacheClient();
    if (!client) {
      return { ok: true, value: { deletedCount: 0 } };
    }

    const modes = input.privacyModes ?? ALL_PRIVACY_MODES;
    const cacheKeys = modes.map((privacyMode) =>
      feedCacheKey({ feedId: input.feedId, privacyMode })
    );
    if (cacheKeys.length === 0) {
      return { ok: true, value: { deletedCount: 0 } };
    }

    await client.del(...cacheKeys);
    return { ok: true, value: { deletedCount: cacheKeys.length } };
  } catch {
    return cacheError("Failed to invalidate feed cache.");
  }
}

export async function purgeFeedCacheEntries(input: {
  feedId: string;
}): Promise<Result<{ deletedCount: number }, FeedCacheError>> {
  const id = z.string().uuid().safeParse(input.feedId);
  if (!id.success) {
    return cacheError("Invalid feed cache identity.");
  }
  try {
    const client = getFeedCacheClient();
    if (!client) {
      return { ok: true, value: { deletedCount: 0 } };
    }
    const prefix = `feed:${id.data}:`;
    const cacheKeys = new Set<string>();
    let cursor = 0;
    let pages = 0;
    do {
      const [next, entries] = z
        .tuple([z.coerce.number().int().nonnegative(), z.array(z.string())])
        .parse(await client.scan(cursor, { count: 100, match: `${prefix}*` }));
      for (const key of entries) {
        if (!key.startsWith(prefix)) {
          return cacheError("Feed cache scan returned a foreign identity.");
        }
        cacheKeys.add(key);
      }
      cursor = next;
      pages += 1;
      if (pages > 100_000) {
        return cacheError("Feed cache scan exceeded its page bound.");
      }
    } while (cursor !== 0);
    const entries = [...cacheKeys];
    for (let offset = 0; offset < entries.length; offset += 100) {
      await client.del(...entries.slice(offset, offset + 100));
    }
    return { ok: true, value: { deletedCount: entries.length } };
  } catch {
    return cacheError("Failed to purge feed cache entries.");
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
    const result = await executeRedisRestCommand<T>({
      command: parts,
      token: input.token,
      url: input.url,
    });
    if (!result.ok) {
      throw new Error("KV command failed");
    }
    return result.value;
  };
  return {
    del: (...cacheKeys) => command(["del", ...cacheKeys]),
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
  return { error: { code: "unknown_error", message }, ok: false };
}
