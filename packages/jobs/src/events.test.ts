import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ ids: ["event_1"] })),
}));

vi.mock("./client", () => ({
  inngest: {
    send: mocks.send,
  },
}));

const {
  dispatchCancelSyncRun,
  dispatchSyncEvent,
  getRegisteredSyncEventName,
  getScheduledSyncEventId,
  getUtcCadenceSlot,
} = await import("./events");

describe("jobs events", () => {
  it("only exposes wired sync handlers for manual dispatch", () => {
    expect(getRegisteredSyncEventName("approval_state_reconciliation")).toBe(
      "reconcile-xero-approval-state"
    );
    expect(getRegisteredSyncEventName("leave_records")).toBe(
      "sync-xero-leave-records"
    );
    expect(getRegisteredSyncEventName("leave_balances")).toBe(
      "sync-xero-leave-balances"
    );
    expect(getRegisteredSyncEventName("people")).toBe("sync-xero-people");
  });

  it("dispatches approval reconciliation with full tenant payload", async () => {
    const result = await dispatchSyncEvent({
      bindingGeneration: 1,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      runType: "approval_state_reconciliation",
      triggeredByUserId: "user_1",
      triggerType: "manual",
      xeroTenantId: "00000000-0000-4000-8000-000000000010",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        eventName: "reconcile-xero-approval-state",
        ids: ["event_1"],
        queued: true,
      },
    });
  });

  it("passes optional eventId to inngest.send when provided", async () => {
    mocks.send.mockClear();
    const eventId = "scheduled-sync:tenant_1:people:2026-08-10T19:45Z";
    await dispatchSyncEvent(
      {
        bindingGeneration: 1,
        clerkOrgId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        runType: "people",
        triggerType: "scheduled",
        xeroTenantId: "00000000-0000-4000-8000-000000000010",
      },
      { eventId }
    );

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: eventId,
        name: "sync-xero-people",
      })
    );
  });

  it("calculates stable UTC cadence slots and deterministic event IDs without collisions", () => {
    const d1 = new Date("2026-08-10T10:12:30.000Z"); // In 10:00-10:15 slot
    const d2 = new Date("2026-08-10T10:14:59.000Z"); // Still in 10:00-10:15 slot
    const d3 = new Date("2026-08-10T10:15:00.000Z"); // Next 10:15-10:30 slot

    // 15-min slot stability
    expect(getUtcCadenceSlot("people", d1)).toBe("2026-08-10T10:00Z");
    expect(getUtcCadenceSlot("people", d2)).toBe("2026-08-10T10:00Z");
    expect(getUtcCadenceSlot("people", d3)).toBe("2026-08-10T10:15Z");

    // Hourly slot
    expect(getUtcCadenceSlot("leave_balances", d1)).toBe("2026-08-10T10:00Z");
    expect(getUtcCadenceSlot("leave_balances", d3)).toBe("2026-08-10T10:00Z");

    // Nightly slot
    expect(getUtcCadenceSlot("approval_state_reconciliation", d1)).toBe(
      "2026-08-10Z"
    );

    // Non-collision check
    const idTenantA = getScheduledSyncEventId("tenant_a", "people", d1);
    const idTenantB = getScheduledSyncEventId("tenant_b", "people", d1);
    const idRunTypeB = getScheduledSyncEventId("tenant_a", "leave_records", d1);

    expect(idTenantA).toBe("scheduled-sync:tenant_a:people:2026-08-10T10:00Z");
    expect(idTenantA).not.toBe(idTenantB);
    expect(idTenantA).not.toBe(idRunTypeB);
  });

  it("dispatches sync cancellation events", async () => {
    const result = await dispatchCancelSyncRun({
      bindingGeneration: 1,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      runId: "00000000-0000-4000-8000-000000000020",
    });

    expect(result).toEqual({ ok: true, value: { queued: true } });
  });
});

it("rejects a sync event missing the binding generation before queueing", async () => {
  mocks.send.mockClear();
  const missingGeneration: unknown = {
    clerkOrgId: "org_1",
    organisationId: "00000000-0000-4000-8000-000000000001",
    runType: "people",
    xeroTenantId: "00000000-0000-4000-8000-000000000010",
  };
  const result = await dispatchSyncEvent(
    missingGeneration as Parameters<typeof dispatchSyncEvent>[0]
  ); // Runtime input deliberately omits required generation.
  expect(result.ok).toBe(false);
  expect(mocks.send).not.toHaveBeenCalled();
});
