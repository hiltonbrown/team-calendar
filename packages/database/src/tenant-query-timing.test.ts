import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { summaries } = vi.hoisted(() => ({
  summaries: vi.fn(),
}));
vi.mock("@repo/observability/log", () => ({
  log: { info: summaries },
}));

import { startTenantQuery, withTenantQueryTiming } from "./tenant-query-timing";

let clock = 0;
beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

const recordQuery = (duration: number) => {
  const complete = startTenantQuery();
  clock += duration;
  complete();
};

afterEach(() => {
  vi.unstubAllEnvs();
  summaries.mockClear();
  vi.restoreAllMocks();
});

describe("tenant query timing", () => {
  it("is inert when the flag is absent", async () => {
    vi.stubEnv("TENANT_QUERY_TIMING", undefined);
    const result = await withTenantQueryTiming("calendar", async () => {
      await Promise.resolve();
      recordQuery(5);
      return "data";
    });
    expect(result).toBe("data");
    expect(summaries).not.toHaveBeenCalled();
  });

  it("counts statements and sums database time for one scope", async () => {
    vi.stubEnv("TENANT_QUERY_TIMING", "1");
    await withTenantQueryTiming("sync-step", async () => {
      recordQuery(3);
      await Promise.resolve();
      recordQuery(7);
    });
    expect(summaries).toHaveBeenCalledWith("tenant_query_timing", {
      database_duration_ms: 10,
      operation: "sync-step",
      statement_count: 2,
      wall_time_ms: expect.any(Number),
    });
  });

  it("keeps simultaneous requests separate", async () => {
    vi.stubEnv("TENANT_QUERY_TIMING", "1");
    await Promise.all([
      withTenantQueryTiming("people", async () => {
        recordQuery(2);
        await Promise.resolve();
        recordQuery(4);
      }),
      withTenantQueryTiming("approvals", async () => {
        await Promise.resolve();
        recordQuery(9);
      }),
    ]);
    expect(summaries.mock.calls.map(([, summary]) => summary)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          database_duration_ms: 6,
          operation: "people",
          statement_count: 2,
        }),
        expect.objectContaining({
          database_duration_ms: 9,
          operation: "approvals",
          statement_count: 1,
        }),
      ])
    );
  });

  it("records failed scopes and preserves the original failure", async () => {
    vi.stubEnv("TENANT_QUERY_TIMING", "1");
    const failure = new Error("database unavailable");
    await expect(
      withTenantQueryTiming("settings", async () => {
        await Promise.resolve();
        recordQuery(8);
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(summaries).toHaveBeenCalledWith(
      "tenant_query_timing",
      expect.objectContaining({ statement_count: 1 })
    );
  });

  it("keeps measurement failures from changing a successful query result", async () => {
    vi.stubEnv("TENANT_QUERY_TIMING", "1");
    summaries.mockImplementationOnce(() => {
      throw new Error("logger unavailable");
    });
    await expect(
      withTenantQueryTiming("calendar", () => Promise.resolve("data"))
    ).resolves.toBe("data");
  });
});
