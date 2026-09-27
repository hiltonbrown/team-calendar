import { z } from "zod";
import { executeRedisRestCommand } from "../../packages/core/src/redis-rest-transport.js";

interface FeedCacheFixtureInput {
  feedIds: string[];
  token?: string;
  url?: string;
}
const scanSchema = z.tuple([
  z.coerce.number().int().nonnegative(),
  z.array(z.string()),
]);

export async function listOwnedFeedCacheKeys(
  input: FeedCacheFixtureInput
): Promise<string[]> {
  const feedIds = z.array(z.string().uuid()).parse(input.feedIds);
  if (feedIds.length === 0) {
    return [];
  }
  if (!(input.token && input.url)) {
    throw new Error(
      "Owned feed cache verification requires the protected Redis pair"
    );
  }
  const found = new Set<string>();
  for (const feedId of feedIds) {
    const prefix = `feed:${feedId}:`;
    let cursor = 0;
    let pages = 0;
    do {
      const result = await executeRedisRestCommand<unknown>({
        command: ["SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 100],
        token: input.token,
        url: input.url,
      });
      if (!result.ok) {
        throw new Error("Owned feed cache scan failed");
      }
      const [next, keys] = scanSchema.parse(result.value);
      for (const key of keys) {
        if (!key.startsWith(prefix)) {
          throw new Error("Owned feed cache scan returned a foreign key");
        }
        found.add(key);
      }
      cursor = next;
      pages += 1;
      if (pages > 100_000) {
        throw new Error("Owned feed cache scan exceeded its page bound");
      }
    } while (cursor !== 0);
  }
  return [...found].sort();
}

export async function purgeOwnedFeedCacheKeys(
  input: FeedCacheFixtureInput
): Promise<number> {
  const keys = await listOwnedFeedCacheKeys(input);
  if (keys.length === 0) {
    return 0;
  }
  if (!(input.token && input.url)) {
    throw new Error(
      "Owned feed cache cleanup requires the protected Redis pair"
    );
  }
  for (let offset = 0; offset < keys.length; offset += 100) {
    const result = await executeRedisRestCommand<unknown>({
      command: ["DEL", ...keys.slice(offset, offset + 100)],
      token: input.token,
      url: input.url,
    });
    if (!result.ok) {
      throw new Error("Owned feed cache deletion failed");
    }
  }
  if ((await listOwnedFeedCacheKeys(input)).length !== 0) {
    throw new Error("Owned feed cache residue remains");
  }
  return keys.length;
}
