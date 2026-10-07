import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureInitialSyncCompleted: vi.fn(),
  inngestCreateFunction: vi.fn(
    (
      config: {
        id: string;
      },
      handler: (...args: unknown[]) => unknown
    ) => {
      const fn = { fn: handler, opts: config };
      return fn;
    }
  ),
  inngestSend: vi.fn(async () => ({ ids: ["event_1"] })),
  syncXeroLeaveBalances: vi.fn(),
  syncXeroLeaveRecords: vi.fn(),
  syncXeroPeople: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: mocks.inngestCreateFunction,
    send: mocks.inngestSend,
  },
}));
vi.mock("../activation", () => ({
  captureInitialSyncCompleted: mocks.captureInitialSyncCompleted,
}));
vi.mock("./sync-xero-people", () => ({
  syncXeroPeople: mocks.syncXeroPeople,
  syncXeroPeopleFunction: { id: "sync-xero-people" },
}));
vi.mock("./sync-xero-leave-records", () => ({
  syncXeroLeaveRecords: mocks.syncXeroLeaveRecords,
  syncXeroLeaveRecordsFunction: { id: "sync-xero-leave-records" },
}));
vi.mock("./sync-xero-leave-balances", () => ({
  syncXeroLeaveBalances: mocks.syncXeroLeaveBalances,
  syncXeroLeaveBalancesFunction: { id: "sync-xero-leave-balances" },
}));
const { initialXeroSync, initialXeroSyncFunction } = await import(
  "./initial-xero-sync"
);
const { functions } = await import("../functions");
describe("initialXeroSyncFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncXeroPeople.mockResolvedValue({
      ok: true,
      value: { upserted: 5 },
    });
    mocks.syncXeroLeaveRecords.mockResolvedValue({
      ok: true,
      value: { upserted: 10 },
    });
    mocks.syncXeroLeaveBalances.mockResolvedValue({
      ok: true,
      value: { upserted: 15 },
    });
    mocks.captureInitialSyncCompleted.mockResolvedValue(undefined);
  });
  it("is registered with id initial-xero-sync in functions list", () => {
    expect(functions).toContain(initialXeroSyncFunction);
    expect(initialXeroSyncFunction.opts.id).toBe("initial-xero-sync");
    expect(initialXeroSyncFunction.opts.triggers).toEqual({
      event: "initial-xero-sync",
    });
  });
  it("executes the four stages in strict durable order: people, records, balances, activation", async () => {
    const handler: unknown = Reflect.get(initialXeroSyncFunction, "fn");
    if (typeof handler !== "function") {
      throw new Error("Expected registered Inngest handler");
    }
    const stepOrder: string[] = [];
    const mockStep = {
      run: vi.fn(async (stepName: string, stepFn: () => Promise<unknown>) => {
        stepOrder.push(stepName);
        return await stepFn();
      }),
    };
    const eventPayload = {
      clerkOrgId: "org_1",
      connectionId: "33333333-3333-4333-8333-333333333333",
      organisationId: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      triggeredByUserId: "user_1",
      triggerType: "manual" as const,
    };
    const result = await handler({
      event: { data: eventPayload },
      runId: "worker-run-1",
      step: mockStep,
    });
    expect(stepOrder).toEqual([
      "sync-people",
      "sync-leave-records",
      "sync-leave-balances",
      "finalise-activation",
    ]);
    expect(mocks.syncXeroPeople).toHaveBeenCalledWith(eventPayload);
    expect(mocks.syncXeroLeaveRecords).toHaveBeenCalledWith(eventPayload);
    expect(mocks.syncXeroLeaveBalances).toHaveBeenCalledWith(eventPayload);
    expect(mocks.captureInitialSyncCompleted).toHaveBeenCalledWith(
      eventPayload
    );
    expect(result).toMatchObject({
      leaveBalances: { ok: true, value: { upserted: 15 } },
      leaveRecords: { ok: true, value: { upserted: 10 } },
      people: { ok: true, value: { upserted: 5 } },
    });
  });
  it("direct invocation runs all stages sequentially and returns results", async () => {
    const input = {
      clerkOrgId: "org_1",
      connectionId: "33333333-3333-4333-8333-333333333333",
      organisationId: "11111111-1111-4111-8111-111111111111",
    };
    const result = await initialXeroSync(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(mocks.syncXeroPeople).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
      })
    );
    expect(mocks.syncXeroLeaveRecords).toHaveBeenCalled();
    expect(mocks.syncXeroLeaveBalances).toHaveBeenCalled();
    expect(mocks.captureInitialSyncCompleted).toHaveBeenCalled();
    expect(result.value.completedAt).toBeInstanceOf(Date);
  });
  it("direct invocation validates required inputs", async () => {
    const invalid = {
      clerkOrgId: "org_1",
    };
    const result = await initialXeroSync(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });
});
