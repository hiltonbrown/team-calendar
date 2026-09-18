import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityUpdateMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

const transactionClient = {
  availabilityRecord: { updateMany: mocks.availabilityUpdateMany },
  outboundOperation: {
    count: mocks.count,
    create: mocks.create,
    findFirst: mocks.findFirst,
    updateMany: mocks.updateMany,
  },
};

vi.mock("../client", () => ({
  database: {
    $transaction: async (
      callback: (client: typeof transactionClient) => unknown
    ) => await callback(transactionClient),
    outboundOperation: transactionClient.outboundOperation,
  },
}));

const {
  hasUnresolvedSubmitOperation,
  markSubmitDispatchStarted,
  prepareAndClaimSubmitOperation,
} = await import("./outbound-operations");

const scope = {
  availabilityRecordId: "00000000-0000-4000-8000-000000000099",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};

describe("outbound operation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates one prepared operation with both tenant boundaries", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "operation_1" });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      prepareAndClaimSubmitOperation({
        ...scope,
        actorUserId: "user_1",
        claimableBefore: new Date("2026-05-01T00:00:00.000Z"),
        expectedFailedAction: null,
        expectedSequence: 2,
        expectedStatus: "draft",
        requestFingerprint: "fingerprint",
      })
    ).resolves.toEqual({
      attemptGeneration: 1,
      claimedAt: expect.any(Date),
    });

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        availability_record_id: scope.availabilityRecordId,
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        request_fingerprint: "fingerprint",
        status: "prepared",
      }),
    });
  });

  it("blocks a second create while the existing outcome is unresolved", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "operation_1",
      status: "outcome_unknown",
    });

    await expect(
      prepareAndClaimSubmitOperation({
        ...scope,
        actorUserId: "user_2",
        claimableBefore: new Date("2026-05-01T00:00:00.000Z"),
        expectedFailedAction: null,
        expectedSequence: 2,
        expectedStatus: "draft",
        requestFingerprint: "fingerprint",
      })
    ).resolves.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("uses a conditional transition before network dispatch", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      markSubmitDispatchStarted({ ...scope, attemptGeneration: 1 })
    ).resolves.toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: {
        dispatch_started_at: expect.any(Date),
        status: "outcome_unknown",
      },
      where: {
        action: "submit",
        attempt_generation: 1,
        availability_record_id: scope.availabilityRecordId,
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        status: "prepared",
      },
    });
  });

  it("detects unresolved operations only inside the requested tenant", async () => {
    mocks.count.mockResolvedValue(1);

    await expect(hasUnresolvedSubmitOperation(scope)).resolves.toBe(true);
    expect(mocks.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        status: { in: ["prepared", "outcome_unknown", "provider_accepted"] },
      }),
    });
  });
});
