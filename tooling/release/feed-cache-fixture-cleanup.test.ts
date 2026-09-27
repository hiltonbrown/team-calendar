import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("../../packages/core/src/redis-rest-transport.js", () => ({
  executeRedisRestCommand: mocks.command,
}));

import {
  listOwnedFeedCacheKeys,
  purgeOwnedFeedCacheKeys,
} from "./feed-cache-fixture-cleanup.js";

const feedId = "10000000-0000-4000-8000-000000000001";
const input = {
  feedIds: [feedId],
  token: "fixture-secret",
  url: "https://redis.example.test",
};
beforeEach(() => vi.clearAllMocks());
it("coerces string zero, follows cursor pages and scans only owned UUID prefixes", async () => {
  mocks.command
    .mockResolvedValueOnce({ ok: true, value: ["4", [`feed:${feedId}:one`]] })
    .mockResolvedValueOnce({ ok: true, value: ["0", [`feed:${feedId}:two`]] });
  expect(await listOwnedFeedCacheKeys(input)).toHaveLength(2);
  expect(mocks.command).toHaveBeenCalledTimes(2);
  expect(mocks.command.mock.calls[0]?.[0].command).toEqual([
    "SCAN",
    0,
    "MATCH",
    `feed:${feedId}:*`,
    "COUNT",
    100,
  ]);
});
it("rejects foreign keys without deleting them", async () => {
  mocks.command.mockResolvedValue({
    ok: true,
    value: ["0", ["feed:foreign:one"]],
  });
  await expect(purgeOwnedFeedCacheKeys(input)).rejects.toThrow("foreign");
  expect(mocks.command).toHaveBeenCalledTimes(1);
});
it("deletes only scanned owned keys and proves zero residue", async () => {
  mocks.command
    .mockResolvedValueOnce({ ok: true, value: ["0", [`feed:${feedId}:one`]] })
    .mockResolvedValueOnce({ ok: true, value: 1 })
    .mockResolvedValueOnce({ ok: true, value: ["0", []] });
  expect(await purgeOwnedFeedCacheKeys(input)).toBe(1);
  expect(mocks.command.mock.calls[1]?.[0].command).toEqual([
    "DEL",
    `feed:${feedId}:one`,
  ]);
});
it("fails closed for Redis errors or absent protected credentials", async () => {
  mocks.command.mockResolvedValue({ ok: false });
  await expect(listOwnedFeedCacheKeys(input)).rejects.toThrow("scan failed");
  await expect(listOwnedFeedCacheKeys({ feedIds: [feedId] })).rejects.toThrow(
    "protected Redis pair"
  );
});
