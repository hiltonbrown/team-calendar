import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  auditFind: vi.fn(),
  dispatch: vi.fn(),
  fence: vi.fn(),
  materialise: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        auditEvent: { create: mocks.auditCreate, findFirst: mocks.auditFind },
      }),
    auditEvent: { create: mocks.auditCreate, findFirst: mocks.auditFind },
  },
  fenceSubmitRecoverySideEffectClaim: mocks.fence,
}));
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialise,
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatch,
}));

const { completeSubmitSideEffects } = await import("./submit-side-effects");
const input = {
  actorUserId: "user_1",
  attempt: {
    attemptGeneration: 1,
    availabilityRecordId: "00000000-0000-4000-8000-000000000099",
    clerkOrgId: "org_1",
    organisationId: "00000000-0000-4000-8000-000000000001",
  },
  claimedAt: new Date("2026-09-19T00:00:00Z"),
  clerkOrgId: "org_1",
  manager: {
    clerkUserId: "manager_1",
    personId: "00000000-0000-4000-8000-000000000011",
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
    mocks.dispatch.mockResolvedValue({ ok: true, value: {} });
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
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { publishRealtime: false }
    );
  });
});
