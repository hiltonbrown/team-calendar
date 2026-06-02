import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  inngest: {
    send: vi.fn(async () => ({ ids: ["event_1"] })),
  },
}));

const { dispatchCancelSyncRun, dispatchSyncEvent, getRegisteredSyncEventName } =
  await import("./events");

describe("jobs events", () => {
  it("only exposes wired sync handlers for manual dispatch", () => {
    expect(getRegisteredSyncEventName("approval_state_reconciliation")).toBe(
      "reconcile-xero-approval-state"
    );
    expect(getRegisteredSyncEventName("people")).toBe("sync-xero-people");
  });

  it("dispatches approval reconciliation with full tenant payload", async () => {
    const result = await dispatchSyncEvent({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      runType: "approval_state_reconciliation",
      triggerType: "manual",
      triggeredByUserId: "user_1",
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

  it("dispatches sync cancellation events", async () => {
    const result = await dispatchCancelSyncRun({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      runId: "00000000-0000-4000-8000-000000000020",
    });

    expect(result).toEqual({ ok: true, value: { queued: true } });
  });
});
