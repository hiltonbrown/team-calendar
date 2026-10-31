import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  auditFind: vi.fn(),
  committed: vi.fn(),
  dispatch: vi.fn(),
  fence: vi.fn(),
  materialise: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) => {
      const result = await run(buildTestDatabase());
      mocks.committed();
      return result;
    },
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),

  fenceSubmitRecoverySideEffectClaim: mocks.fence,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      $transaction: async (callback: (tx: unknown) => unknown) => {
        const result = await callback({
          auditEvent: { create: mocks.auditCreate, findFirst: mocks.auditFind },
        });
        mocks.committed();
        return result;
      },
      auditEvent: { create: mocks.auditCreate, findFirst: mocks.auditFind },
    },
  };
}
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialise,
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatch,
  prepareNotificationPublication: vi.fn(
    async (requestInput: unknown) => requestInput
  ),
  sendPreparedNotificationPublication: mocks.publish,
}));

const { completeSubmitSideEffects } = await import("./submit-side-effects");
const input = {
  accountId: "org_1",
  actorUserId: "user_1",
  attempt: {
    accountId: "org_1",
    attemptGeneration: 1,
    availabilityRecordId: "00000000-0000-4000-8000-000000000099",
    organisationId: "00000000-0000-4000-8000-000000000001",
  },
  claimedAt: new Date("2026-09-19T00:00:00Z"),
  manager: {
    personId: "00000000-0000-4000-8000-000000000011",
    userId: "manager_1",
  },
  notifyManager: true,
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000099",
};

describe("submit side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFind.mockResolvedValue(null);
    mocks.fence.mockResolvedValue(true);
    mocks.materialise.mockResolvedValue({ ok: true, value: undefined });
    mocks.dispatch.mockResolvedValue({
      ok: true,
      value: { notificationId: "notification_1" },
    });
    mocks.publish.mockResolvedValue(undefined);
  });
  it("does not dispatch after the exact claim fence loses a takeover", async () => {
    mocks.fence.mockResolvedValue(false);
    const result = await completeSubmitSideEffects(input);
    expect(result.ok).toBe(false);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("throws inside the transaction when dispatch reports a partial failure", async () => {
    mocks.dispatch.mockResolvedValue({
      error: { message: "partial" },
      ok: false,
    });
    const result = await completeSubmitSideEffects(input);
    expect(result.ok).toBe(false);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.anything(),
      { publishRealtime: false },
      expect.anything()
    );
  });
  it("delivers approval realtime after commit and reuses the checkpoint row on retry", async () => {
    const approval = {
      ...input,
      approvalRecipient: {
        personId: "00000000-0000-4000-8000-000000000022",
        userId: "employee_1",
      },
      attempt: { ...input.attempt, action: "approve" as const },
      notifyManager: false,
    };
    mocks.publish.mockRejectedValueOnce(new Error("stream unavailable"));
    expect((await completeSubmitSideEffects(approval)).ok).toBe(false);
    expect(mocks.committed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.publish.mock.invocationCallOrder[0]
    );
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "employee_1",
        type: "leave_approved",
      }),
      { publishRealtime: false },
      expect.anything()
    );
    mocks.auditFind.mockResolvedValue({
      id: "checkpoint_1",
      metadata: { notificationId: "notification_1" },
    });
    expect((await completeSubmitSideEffects(approval)).ok).toBe(true);
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledTimes(2);
  });
  it("uses the journal's original decline reason and actor in its durable notification", async () => {
    const result = await completeSubmitSideEffects({
      ...input,
      actorUserId: "original_manager",
      approvalRecipient: { personId: "person", userId: "employee" },
      attempt: { ...input.attempt, action: "decline" },
      declineReason: "Original coverage decision",
    });
    expect(result.ok).toBe(true);
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "original_manager",
        body: "Original coverage decision",
        type: "leave_declined",
      }),
      { publishRealtime: false },
      expect.anything()
    );
  });
});
