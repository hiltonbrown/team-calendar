import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  findFirst: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.capture, flush: mocks.flush },
}));
vi.mock("@repo/database", () => ({
  database: { syncRun: { findFirst: mocks.findFirst } },
}));
vi.mock("@repo/observability/log", () => ({
  log: { warn: vi.fn() },
}));

const { captureInitialSyncCompleted } = await import("./activation");

describe("captureInitialSyncCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flush.mockResolvedValue(undefined);
  });

  it("uses three bounded first-success queries and the final milestone time", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:02:00.000Z"),
      })
      .mockResolvedValueOnce({
        completed_at: new Date("2026-09-19T00:01:00.000Z"),
      });

    await captureInitialSyncCompleted({
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mocks.findFirst).toHaveBeenCalledTimes(3);
    expect(
      mocks.findFirst.mock.calls.map(([query]) => query.where.run_type)
    ).toEqual(["people", "leave_records", "leave_balances"]);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: new Date("2026-09-19T00:02:00.000Z"),
      })
    );
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });

  it("does not capture until every required successful run exists", async () => {
    mocks.findFirst
      .mockResolvedValueOnce({ completed_at: new Date() })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ completed_at: new Date() });

    await captureInitialSyncCompleted({
      clerkOrgId: "org_1",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
