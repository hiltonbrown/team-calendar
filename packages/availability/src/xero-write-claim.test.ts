import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: { availabilityRecord: { updateMany: mocks.updateMany } },
  scopedTo: mocks.scopedTo,
}));

const {
  acquireXeroWriteClaim,
  releaseXeroWriteClaim,
  unclaimedOrExpiredXeroWriteWhere,
  XERO_WRITE_CLAIM_LEASE_MS,
} = await import("./xero-write-claim");

const claimScope = {
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000099",
};
const now = new Date("2026-09-18T00:10:00.000Z");

describe("xero write claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ownership only to the atomic winner without changing sequence", async () => {
    mocks.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const winner = await acquireXeroWriteClaim({
      ...claimScope,
      claimedAt: now,
      expectedFailedAction: null,
      expectedSequence: 7,
      expectedStatus: "submitted",
      now,
    });
    const contender = await acquireXeroWriteClaim({
      ...claimScope,
      claimedAt: new Date(now.getTime() + 1),
      expectedFailedAction: null,
      expectedSequence: 7,
      expectedStatus: "submitted",
      now,
    });

    expect(winner).toEqual(now);
    expect(contender).toBeNull();
    expect(mocks.updateMany.mock.calls[0]?.[0]?.data).toEqual({
      xero_write_claimed_at: now,
    });
    expect(mocks.updateMany.mock.calls[0]?.[0]?.data).not.toHaveProperty(
      "derived_sequence"
    );
  });

  it("scopes acquisition by both tenants, state, retry action, archive and expiry", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await acquireXeroWriteClaim({
      ...claimScope,
      expectedFailedAction: "approve",
      expectedSequence: 3,
      expectedStatus: "xero_sync_failed",
      now,
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { xero_write_claimed_at: now },
      where: expect.objectContaining({
        approval_status: "xero_sync_failed",
        archived_at: null,
        clerk_org_id: claimScope.clerkOrgId,
        derived_sequence: 3,
        failed_action: "approve",
        id: claimScope.recordId,
        OR: [
          { xero_write_claimed_at: null },
          {
            xero_write_claimed_at: {
              lt: new Date(now.getTime() - XERO_WRITE_CLAIM_LEASE_MS),
            },
          },
        ],
        organisation_id: claimScope.organisationId,
      }),
    });
  });

  it("refuses an old owner's release after a successor takes over", async () => {
    const oldClaim = new Date("2026-09-18T00:00:00.000Z");
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const released = await releaseXeroWriteClaim({
      ...claimScope,
      claimedAt: oldClaim,
    });

    expect(released).toBe(false);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { xero_write_claimed_at: null },
      where: expect.objectContaining({
        clerk_org_id: claimScope.clerkOrgId,
        organisation_id: claimScope.organisationId,
        xero_write_claimed_at: oldClaim,
      }),
    });
  });

  it("uses the same five-minute boundary for non-claiming writers", () => {
    expect(unclaimedOrExpiredXeroWriteWhere(now)).toEqual({
      OR: [
        { xero_write_claimed_at: null },
        {
          xero_write_claimed_at: {
            lt: new Date(now.getTime() - XERO_WRITE_CLAIM_LEASE_MS),
          },
        },
      ],
    });
  });
});
