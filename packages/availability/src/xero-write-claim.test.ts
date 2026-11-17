import { withTenantDb as withTestTenantDb } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lockActiveScopedXeroConnection: vi.fn(async () => true),
  scopedTo: vi.fn((scope: { accountId: string; organisationId: string }) => ({
    account_id: scope.accountId,
    organisation_id: scope.organisationId,
  })),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),

  lockActiveScopedXeroConnection: mocks.lockActiveScopedXeroConnection,
  scopedTo: mocks.scopedTo,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{ availabilityRecord: { updateMany: mocks.updateMany } },
  };
}

const {
  acquireXeroWriteClaim,
  releaseXeroWriteClaim,
  unclaimedOrExpiredXeroWriteWhere,
  XERO_WRITE_CLAIM_LEASE_MS,
} = await import("./xero-write-claim");

const claimScope = {
  accountId: "org_1",
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

    const winner = await withTestTenantDb(
      tenantTestAccount({
        ...claimScope,
        claimedAt: now,
        expectedFailedAction: null,
        expectedSequence: 7,
        expectedStatus: "submitted",
        now,
      }),
      (db) =>
        acquireXeroWriteClaim(
          {
            ...claimScope,
            claimedAt: now,
            expectedFailedAction: null,
            expectedSequence: 7,
            expectedStatus: "submitted",
            now,
          },
          db
        )
    );
    const contender = await withTestTenantDb(
      tenantTestAccount({
        ...claimScope,
        claimedAt: new Date(now.getTime() + 1),
        expectedFailedAction: null,
        expectedSequence: 7,
        expectedStatus: "submitted",
        now,
      }),
      (db) =>
        acquireXeroWriteClaim(
          {
            ...claimScope,
            claimedAt: new Date(now.getTime() + 1),
            expectedFailedAction: null,
            expectedSequence: 7,
            expectedStatus: "submitted",
            now,
          },
          db
        )
    );

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

    await withTestTenantDb(
      tenantTestAccount({
        ...claimScope,
        expectedFailedAction: "approve",
        expectedSequence: 3,
        expectedStatus: "xero_sync_failed",
        now,
      }),
      (db) =>
        acquireXeroWriteClaim(
          {
            ...claimScope,
            expectedFailedAction: "approve",
            expectedSequence: 3,
            expectedStatus: "xero_sync_failed",
            now,
          },
          db
        )
    );

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { xero_write_claimed_at: now },
      where: expect.objectContaining({
        account_id: claimScope.accountId,
        approval_status: "xero_sync_failed",
        archived_at: null,
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

    const released = await withTestTenantDb(
      tenantTestAccount({
        ...claimScope,
        claimedAt: oldClaim,
      }),
      (db) =>
        releaseXeroWriteClaim(
          {
            ...claimScope,
            claimedAt: oldClaim,
          },
          db
        )
    );

    expect(released).toBe(false);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { xero_write_claimed_at: null },
      where: expect.objectContaining({
        account_id: claimScope.accountId,
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
