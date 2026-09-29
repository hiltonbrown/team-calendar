import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  createFunction: vi.fn(
    (
      _options: unknown,
      handler: (context: {
        step: {
          run: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
        };
      }) => Promise<unknown>
    ) => handler
  ),
  error: vi.fn(),
  list: vi.fn(),
  metric: vi.fn(),
  oldest: vi.fn(),
  process: vi.fn(),
  resolved: vi.fn(),
  retire: vi.fn(),
}));
vi.mock("@repo/database/queries/xero-cleanup", () => ({
  getOldestUnknownXeroCleanupUpdatedAt: mocks.oldest,
  listDueXeroCleanupAttempts: mocks.list,
  listResolvedXeroCleanupRequests: mocks.resolved,
}));
vi.mock("@repo/xero", () => ({
  emitXeroMetric: mocks.metric,
  processXeroCleanupAttempt: mocks.process,
  retireResolvedCleanupRequest: mocks.retire,
}));
vi.mock("@repo/observability/log", () => ({ log: { error: mocks.error } }));
vi.mock("../client", () => ({
  inngest: { createFunction: mocks.createFunction },
}));

import { reconcileXeroConnections } from "./reconcile-xero-connections";

const registeredHandler = mocks.createFunction.mock.calls[0]?.[1];
if (!registeredHandler) {
  throw new Error("Cleanup sweep was not registered");
}
afterEach(() => {
  vi.restoreAllMocks();
});

describe("cleanup sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.metric.mockReset();
    mocks.oldest.mockReset().mockResolvedValue(null);
    mocks.list.mockResolvedValue([]);
    mocks.resolved.mockReset().mockResolvedValue([]);
    mocks.retire.mockReset().mockResolvedValue(undefined);
    mocks.process.mockReset().mockResolvedValue(undefined);
  });
  it("isolates record failures and passes only scoped routing identifiers", async () => {
    const first = {
      attemptId: "a",
      clerkOrgId: "org",
      organisationId: "entity",
    };
    const second = { ...first, attemptId: "b" };
    mocks.list.mockResolvedValue([first, second]);
    mocks.process
      .mockRejectedValueOnce(new Error("failure"))
      .mockResolvedValueOnce(undefined);
    expect(await reconcileXeroConnections()).toEqual({
      failed: 1,
      processed: 1,
    });
    expect(mocks.process).toHaveBeenNthCalledWith(2, second);
    expect(mocks.oldest).toHaveBeenCalledOnce();
    expect(mocks.metric).toHaveBeenCalledExactlyOnceWith(
      "xero.cleanup.unknown_oldest_age_hours",
      0
    );
    expect(mocks.list).toHaveBeenCalledWith({
      limit: 50,
      now: expect.any(Date),
    });
  });
  it("revisits terminal requests after retirement failure without dispatching another DELETE", async () => {
    const request = {
      clerkOrgId: "org",
      organisationId: "entity",
      requestId: "request",
    };
    mocks.resolved.mockResolvedValue([request]);
    mocks.retire.mockRejectedValueOnce(new Error("retirement unavailable"));
    expect(await reconcileXeroConnections()).toEqual({
      failed: 1,
      processed: 0,
    });
    expect(await reconcileXeroConnections()).toEqual({
      failed: 0,
      processed: 1,
    });
    expect(mocks.retire).toHaveBeenNthCalledWith(1, request);
    expect(mocks.retire).toHaveBeenNthCalledWith(2, request);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it.each([
    [new Date("2026-09-26T04:30:00Z"), 7.5],
    [null, 0],
    [new Date("2026-09-26T13:00:00Z"), 0],
  ])(
    "records one bounded oldest-unknown age per manual sweep: %s",
    async (oldest, ageHours) => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-26T12:00:00Z"));
      mocks.oldest.mockResolvedValue(oldest);
      expect(await reconcileXeroConnections()).toEqual({
        failed: 0,
        processed: 0,
      });
      expect(mocks.oldest).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.metric).toHaveBeenCalledExactlyOnceWith(
        "xero.cleanup.unknown_oldest_age_hours",
        ageHours
      );
    }
  );
  it.each(["query", "metric"] as const)(
    "preserves processing counts when health %s fails",
    async (failure) => {
      const attempt = {
        attemptId: "attempt",
        clerkOrgId: "org",
        organisationId: "entity",
      };
      mocks.list.mockResolvedValue([attempt]);
      if (failure === "query") {
        mocks.oldest.mockRejectedValue(new Error("database unavailable"));
      } else {
        mocks.metric.mockImplementation(() => {
          throw new Error("metric unavailable");
        });
      }
      expect(await reconcileXeroConnections()).toEqual({
        failed: 0,
        processed: 1,
      });
      expect(mocks.process).toHaveBeenCalledExactlyOnceWith(attempt);
      if (failure === "query") {
        expect(mocks.metric).not.toHaveBeenCalled();
      }
    }
  );
  it("runs terminal recovery in its own durable scoped step and isolates retirement failure", async () => {
    const first = {
      clerkOrgId: "clerk",
      organisationId: "entity",
      requestId: "first",
    };
    const second = { ...first, requestId: "second" };
    mocks.resolved.mockResolvedValue([first, second]);
    mocks.retire.mockRejectedValueOnce(new Error("interrupted retirement"));
    const steps: string[] = [];
    const step = {
      run: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        steps.push(name);
        return await callback();
      },
    };
    expect(await registeredHandler({ step })).toEqual({
      failed: 1,
      processed: 1,
    });
    expect(steps).toEqual([
      "list-due-xero-cleanup",
      "list-resolved-xero-cleanup",
      "retire-cleanup-first",
      "retire-cleanup-second",
      "record-unknown-cleanup-age",
    ]);
    expect(mocks.retire).toHaveBeenNthCalledWith(1, first);
    expect(mocks.retire).toHaveBeenNthCalledWith(2, second);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("records health once through its durable job step after all cleanup steps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-26T12:00:00Z"));
    mocks.oldest.mockResolvedValue(new Date("2026-09-26T10:00:00Z"));
    const first = {
      attemptId: "a",
      clerkOrgId: "org",
      organisationId: "entity",
    };
    const second = { ...first, attemptId: "b" };
    mocks.list.mockResolvedValue([first, second]);
    const steps: string[] = [];
    const step = {
      run: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        steps.push(name);
        return await callback();
      },
    };
    expect(await registeredHandler({ step })).toEqual({
      failed: 0,
      processed: 2,
    });
    expect(steps).toEqual([
      "list-due-xero-cleanup",
      "cleanup-a",
      "cleanup-b",
      "list-resolved-xero-cleanup",
      "record-unknown-cleanup-age",
    ]);
    expect(mocks.metric).toHaveBeenCalledExactlyOnceWith(
      "xero.cleanup.unknown_oldest_age_hours",
      2
    );
    expect(mocks.oldest).toHaveBeenCalledOnce();
  });
});

// Campaign authority is verified in database runtime protocol tests; these tests isolate handler behaviour.
vi.mock("@repo/database/xero-campaign-access", () => ({
  assertXeroCampaignAccess: vi.fn(() => Promise.resolve()),
  assertXeroCampaignDispatch: vi.fn(() => Promise.resolve()),
  claimXeroCampaignScheduledDispatch: vi.fn(() => Promise.resolve(undefined)),
  currentXeroCampaignInvocation: vi.fn(() => undefined),
  lockXeroCampaignPersistence: vi.fn(() => Promise.resolve()),
  recordXeroCampaignDispatch: vi.fn(() => Promise.resolve()),
  withXeroCampaignInvocation: vi.fn(
    (_functionId: string, _input: unknown, operation: () => Promise<unknown>) =>
      operation()
  ),
  withXeroCampaignScopedEffect: (
    _scope: unknown,
    operation: () => Promise<unknown>
  ) => operation(),
  withXeroCampaignScopedInvocation: vi.fn(
    (_functionId: string, _input: unknown, operation: () => Promise<unknown>) =>
      operation()
  ),
  xeroCampaignAllowsOrdinaryMaintenance: vi.fn(() => Promise.resolve(true)),
}));
