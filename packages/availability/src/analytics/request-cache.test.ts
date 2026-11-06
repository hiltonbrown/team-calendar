import { describe, expect, it, vi } from "vitest";
import {
  aggregationFingerprint,
  createAggregationCache,
} from "./request-cache";

describe("createAggregationCache", () => {
  it("caches getOrLoad values by fingerprint", async () => {
    const cache = createAggregationCache();
    const loader = vi.fn().mockResolvedValue({ value: 1 });
    const key = aggregationFingerprint({
      accountId: "org_1",
      dateRangeKey: "2026",
      filterKey: { teamId: ["team_1"] },
      organisationId: "organisation_1",
      serviceMethod: "test",
    });

    await expect(cache.getOrLoad(key, loader)).resolves.toEqual({ value: 1 });
    await expect(cache.getOrLoad(key, loader)).resolves.toEqual({ value: 1 });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps different fingerprints separate", () => {
    const cache = createAggregationCache();
    cache.set("one", 1);
    cache.set("two", 2);

    expect(cache.get("one")).toBe(1);
    expect(cache.get("two")).toBe(2);
  });

  it("keeps cache instances independent", () => {
    const first = createAggregationCache();
    const second = createAggregationCache();

    first.set("key", "first");

    expect(second.get("key")).toBeUndefined();
  });
});
