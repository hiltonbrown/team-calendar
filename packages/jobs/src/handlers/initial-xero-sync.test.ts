import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  balances: vi.fn(),
  capture: vi.fn(),
  complete: vi.fn(),
  leave: vi.fn(),
  people: vi.fn(),
  request: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: { createFunction: (opts: unknown, fn: unknown) => ({ fn, opts }) },
}));
vi.mock("../activation", () => ({
  captureInitialSyncCompleted: mocks.capture,
}));
vi.mock("@repo/database/queries/xero-sync-cursors", () => ({
  completeXeroInitialSync: mocks.complete,
  ensureXeroInitialSyncRequested: mocks.request,
}));
vi.mock("./sync-xero-people", () => ({ syncXeroPeople: mocks.people }));
vi.mock("./sync-xero-leave-records", () => ({
  syncXeroLeaveRecords: mocks.leave,
}));
vi.mock("./sync-xero-leave-balances", () => ({
  syncXeroLeaveBalances: mocks.balances,
}));
const { initialXeroSync, initialXeroSyncFunction } = await import(
  "./initial-xero-sync"
);
const input = {
  clerkOrgId: "org_1",
  connectionId: "33333333-3333-4333-8333-333333333333",
  organisationId: "11111111-1111-4111-8111-111111111111",
  requestedAt: "2026-10-07T12:00:00.000Z",
  runId: "22222222-2222-4222-8222-222222222222",
};
describe("one durable full initial import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.mockResolvedValue(input.requestedAt);
    mocks.people.mockResolvedValue({
      ok: true,
      value: { status: "succeeded" },
    });
    mocks.leave.mockResolvedValue({ ok: true, value: { status: "succeeded" } });
    mocks.balances.mockResolvedValue({
      ok: true,
      value: { hasMore: false, status: "succeeded" },
    });
    mocks.complete.mockResolvedValue(new Date("2026-10-07T12:03:00Z"));
  });
  it("imports all 81 balance people in three durable pages before completing", async () => {
    let imported = 0;
    mocks.balances.mockImplementation(() => {
      const count = Math.min(40, 81 - imported);
      imported += count;
      return Promise.resolve({
        ok: true,
        value: { hasMore: imported < 81, status: "succeeded", upserted: count },
      });
    });
    const stages: string[] = [];
    const handler = Reflect.get(initialXeroSyncFunction, "fn");
    await handler({
      event: { data: input },
      step: {
        run: (name: string, operation: () => Promise<unknown>) => {
          stages.push(name);
          return operation();
        },
      },
    });
    expect(imported).toBe(81);
    expect(stages).toEqual([
      "sync-people",
      "sync-leave-records",
      "sync-leave-balances-0",
      "sync-leave-balances-1",
      "sync-leave-balances-2",
      "complete-initial-import",
    ]);
    expect(mocks.people.mock.calls[0][0]).toMatchObject({
      mode: "full",
      requestedAt: input.requestedAt,
    });
    expect(mocks.people.mock.calls[0][0].runId).not.toBe(input.runId);
    expect(mocks.leave.mock.calls[0][0].runId).not.toBe(
      mocks.people.mock.calls[0][0].runId
    );
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it.each(["failed", "partial_success", "cancelled"])(
    "does not complete or continue a %s phase",
    async (status) => {
      mocks.people.mockResolvedValue({ ok: true, value: { status } });
      const result = await initialXeroSync(input);
      expect(result.ok).toBe(false);
      expect(mocks.leave).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
    }
  );
  it("cannot complete an old requestedAt after reconnect", async () => {
    mocks.complete.mockResolvedValue(null);
    expect((await initialXeroSync(input)).ok).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
