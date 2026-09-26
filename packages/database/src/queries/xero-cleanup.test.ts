import { beforeEach, describe, expect, it, vi } from "vitest";

const aggregate = vi.hoisted(() => vi.fn());
vi.mock("../client", () => ({
  database: { xeroCleanupAttempt: { aggregate } },
}));

import { getOldestUnknownXeroCleanupUpdatedAt } from "./xero-cleanup";

describe("oldest unknown cleanup health query", () => {
  beforeEach(() => {
    aggregate.mockReset();
  });
  it.each([new Date("2026-09-25T00:00:00Z"), null])(
    "returns only the MIN timestamp for unknown attempts: %s",
    async (oldest) => {
      aggregate.mockResolvedValue({ _min: { updated_at: oldest } });
      expect(await getOldestUnknownXeroCleanupUpdatedAt()).toEqual(oldest);
      expect(aggregate).toHaveBeenCalledExactlyOnceWith({
        _min: { updated_at: true },
        where: { state: "unknown" },
      });
    }
  );
  it("propagates unreadable health evidence rather than claiming no unknown attempts", async () => {
    const error = new Error("database unavailable");
    aggregate.mockRejectedValue(error);
    await expect(getOldestUnknownXeroCleanupUpdatedAt()).rejects.toBe(error);
    expect(aggregate).toHaveBeenCalledOnce();
  });
});
