import { z } from "zod";
import { executeRedisRestCommand } from "../../packages/core/src/redis-rest-transport.js";
import { sharedStoreFixtureEpoch } from "./shared-store-namespace.js";

const NAMESPACE_PREFIX = "shared_store_namespace:";
const CURSOR = /^(0|[1-9][0-9]{0,19})$/;
const OWNED_KEY = /^xero:\{[^{}]+\}:([a-f0-9]{32}):.+$/;
const scanSchema = z.tuple([z.string().regex(CURSOR), z.array(z.string())]);
const deleteSchema = z.number().int().nonnegative();
const MAX_KEYS = 20_000;
const MAX_PAGES = 10_000;
const CLEANUP_BUDGET_MS = 60_000;

export interface SharedStoreCleanupInput {
  globalKeys: readonly string[];
  token?: string;
  url?: string;
}
export interface SharedStoreCleanupDependencies {
  command?: (command: readonly string[], timeoutMs: number) => Promise<unknown>;
  now?: () => number;
}

function ownedEpochs(globalKeys: readonly string[]) {
  const namespaces = globalKeys
    .filter((key) => key.startsWith(NAMESPACE_PREFIX))
    .map((key) => key.slice(NAMESPACE_PREFIX.length));
  return [...new Set(namespaces.map(sharedStoreFixtureEpoch))];
}
function commands(
  input: SharedStoreCleanupInput,
  deps?: SharedStoreCleanupDependencies
) {
  const now = deps?.now ?? Date.now;
  const expiresAt = now() + CLEANUP_BUDGET_MS;
  return async (command: readonly string[]): Promise<unknown> => {
    const remaining = expiresAt - now();
    if (remaining <= 0) {
      throw new Error("Shared-store cleanup deadline exceeded");
    }
    if (deps?.command) {
      return deps.command(command, Math.min(remaining, 5000));
    }
    if (!(input.url && input.token)) {
      throw new Error("Shared-store cleanup KV configuration is required");
    }
    const result = await executeRedisRestCommand<unknown>({
      command,
      timeoutMs: Math.min(remaining, 5000),
      token: input.token,
      url: input.url,
    });
    if (!result.ok) {
      throw new Error("Shared-store cleanup command failed");
    }
    return result.value;
  };
}
async function scanOwnedKeys(
  epochs: readonly string[],
  command: (command: readonly string[]) => Promise<unknown>
) {
  const keys = new Set<string>();
  for (const epoch of epochs) {
    let cursor = "0";
    const cursors = new Set<string>();
    let pages = 0;
    do {
      pages += 1;
      if (cursors.has(cursor) || pages > MAX_PAGES) {
        throw new Error("Shared-store cleanup cursor did not terminate");
      }
      cursors.add(cursor);
      const page = scanSchema.safeParse(
        await command([
          "SCAN",
          cursor,
          "MATCH",
          `xero:{*}:${epoch}:*`,
          "COUNT",
          "1000",
        ])
      );
      if (!page.success) {
        throw new Error(
          "Shared-store cleanup returned an invalid scan response"
        );
      }
      const [nextCursor, pageKeys] = page.data;
      for (const key of pageKeys) {
        assertOwnedKey(key, epoch);
        keys.add(key);
        if (keys.size > MAX_KEYS) {
          throw new Error("Shared-store cleanup key limit exceeded");
        }
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  }
  return [...keys];
}

export async function countSharedStoreFixtureKeys(
  input: SharedStoreCleanupInput,
  deps?: SharedStoreCleanupDependencies
): Promise<number> {
  return (
    await scanOwnedKeys(ownedEpochs(input.globalKeys), commands(input, deps))
  ).length;
}

export async function deleteSharedStoreFixtureKeys(
  input: SharedStoreCleanupInput,
  deps?: SharedStoreCleanupDependencies
): Promise<number> {
  const command = commands(input, deps);
  const epochs = ownedEpochs(input.globalKeys);
  // Validate every SCAN page before deleting any key, including all owned epochs.
  const keys = await scanOwnedKeys(epochs, command);
  const keysByTag = new Map<string, string[]>();
  for (const key of keys) {
    const tag = key.slice(0, key.indexOf("}") + 1);
    const group = keysByTag.get(tag) ?? [];
    group.push(key);
    keysByTag.set(tag, group);
  }
  let deleted = 0;
  // Redis Cluster requires all keys in one DEL to share the same hash tag.
  for (const group of keysByTag.values()) {
    for (let offset = 0; offset < group.length; offset += 200) {
      const batch = group.slice(offset, offset + 200);
      const result = deleteSchema.safeParse(await command(["DEL", ...batch]));
      if (!result.success || result.data > batch.length) {
        throw new Error(
          "Shared-store cleanup returned an invalid delete response"
        );
      }
      deleted += result.data;
    }
  }
  if ((await scanOwnedKeys(epochs, command)).length) {
    throw new Error("Manifest-owned shared-store fixture residue remains");
  }
  return deleted;
}

function assertOwnedKey(key: string, epoch: string) {
  // biome-ignore lint/suspicious/noUnnecessaryConditions: Redis keys are untrusted; RegExp.exec returns null for malformed values.
  const parsedEpoch = OWNED_KEY.exec(key)?.[1];
  if (parsedEpoch !== epoch) {
    throw new Error(
      "Shared-store cleanup returned a key outside manifest ownership"
    );
  }
}
