import { database } from "@repo/database";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deriveXeroStableSourceKey: vi.fn(),
  fetchLeaveRecordsForRegion: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  materialiseAvailabilityPublication: vi.fn(),
  normaliseInboundLeaveRecord: vi.fn(),
  publishOrganisationNotificationEvent: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  syncRunCreate: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncRunUpdateMany: vi.fn(),
  toPlainLanguageMessage: vi.fn(() => "Xero request failed"),
  xeroConnectionFindFirst: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-leave-records" })),
    send: mocks.inngestSend,
  },
}));
vi.mock("@repo/availability", () => ({
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord: mocks.normaliseInboundLeaveRecord,
}));
vi.mock("@repo/database", () => ({
  database: {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (callback) => callback(database)),
    syncRun: {
      create: mocks.syncRunCreate,
      findFirst: mocks.syncRunFindFirst,
      updateMany: mocks.syncRunUpdateMany,
    },
    xeroConnection: {
      findFirst: mocks.xeroConnectionFindFirst,
    },
  },
  scopedTo: mocks.scopedTo,
}));
vi.mock("@repo/notifications", () => ({
  publishOrganisationNotificationEvent:
    mocks.publishOrganisationNotificationEvent,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@repo/xero", () => ({
  deriveXeroStableSourceKey: mocks.deriveXeroStableSourceKey,
  fetchLeaveRecordsForRegion: mocks.fetchLeaveRecordsForRegion,
  toPlainLanguageMessage: mocks.toPlainLanguageMessage,
}));
const { syncXeroLeaveRecords } = await import("./sync-xero-leave-records");
const {
  acquireSyncRun,
  assertRunActive,
  isRunCancelled,
  XeroSyncRunFencedError,
} = await import("./sync-run-lifecycle");
const CLERK_ORG_ID = "org_sync_lifecycle";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "10000000-0000-4000-8000-000000000001";
const XERO_CONNECTION_ID = "20000000-0000-4000-8000-000000000001";
function input() {
  return {
    clerkOrgId: CLERK_ORG_ID,
    connectionId: XERO_CONNECTION_ID,
    organisationId: ORGANISATION_ID,
    triggerType: "manual",
  };
}
describe("sync run lifecycle guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
  });
  it("finalises a created run as failed when work throws after creation", async () => {
    mocks.xeroConnectionFindFirst.mockRejectedValue(
      new Error("database hiccup")
    );
    const result = await syncXeroLeaveRecords(input());
    expect(result).toEqual({
      error: {
        code: "unknown_error",
        message: "Failed to sync Xero leave records.",
      },
      ok: false,
    });
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: "retry_later",
          status: "failed",
        }),
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          id: RUN_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });
  it("adds a staleness floor to the running-run guard and creates a new run when none is returned", async () => {
    mocks.xeroConnectionFindFirst.mockResolvedValue({
      sync_paused_at: new Date("2026-06-18T00:00:00.000Z"),
    });
    const result = await syncXeroLeaveRecords(input());
    expect(result.ok).toBe(true);
    expect(mocks.syncRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          run_type: "leave_records",
          started_at: {
            gte: expect.any(Date),
          },
          status: "running",
          xero_connection_id: XERO_CONNECTION_ID,
        }),
      })
    );
    expect(mocks.syncRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          run_type: "leave_records",
          status: "running",
          xero_connection_id: XERO_CONNECTION_ID,
        }),
      })
    );
    expect(
      mocks.syncRunCreate.mock.calls.some(
        ([call]) => call.data.status === "cancelled"
      )
    ).toBe(false);
  });
});
describe("acquireSyncRun and fencing lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 0 });
  });
  it("returns terminal snapshot when run with matching runId already completed (idempotent duplicate delivery)", async () => {
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      id: RUN_ID,
      records_failed: 2,
      records_fetched: 10,
      records_skipped: 1,
      records_synced: 8,
      records_upserted: 7,
      status: "partial_success",
    });
    const result = await acquireSyncRun(
      { ...input(), runId: RUN_ID },
      "leave_records",
      new Date()
    );
    expect(result).toEqual({
      kind: "terminal",
      run: {
        id: RUN_ID,
        records_failed: 2,
        records_fetched: 10,
        records_skipped: 1,
        records_synced: 8,
        records_upserted: 7,
        status: "partial_success",
      },
    });
    expect(mocks.syncRunCreate).not.toHaveBeenCalled();
  });
  it("returns active run when run with matching runId is currently running (same-execution retry resumption)", async () => {
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      id: RUN_ID,
      records_failed: 0,
      records_fetched: 5,
      records_skipped: 0,
      records_synced: 5,
      records_upserted: 5,
      status: "running",
    });
    const result = await acquireSyncRun(
      { ...input(), runId: RUN_ID },
      "leave_records",
      new Date()
    );
    expect(result).toEqual({
      kind: "active",
      run: { id: RUN_ID },
    });
    expect(mocks.syncRunCreate).not.toHaveBeenCalled();
  });
  it("cancels execution and returns cancelled_competing when another run is running within stale window", async () => {
    const COMPETING_ID = "10000000-0000-4000-8000-000000000099";
    const CANCELLED_ID = "10000000-0000-4000-8000-000000000088";
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      id: COMPETING_ID,
      started_at: new Date(),
    });
    mocks.syncRunCreate.mockResolvedValueOnce({ id: CANCELLED_ID });
    const result = await acquireSyncRun(input(), "leave_records", new Date());
    expect(result).toEqual({
      kind: "cancelled_competing",
      run: { id: CANCELLED_ID },
    });
    expect(mocks.syncRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary:
            "Another leave records sync run is already in progress",
          run_type: "leave_records",
          status: "cancelled",
        }),
      })
    );
  });
  it("checks updated_at for leave_balances competing runs", async () => {
    const COMPETING_ID = "10000000-0000-4000-8000-000000000099";
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      id: COMPETING_ID,
      started_at: new Date(),
    });
    await acquireSyncRun(input(), "leave_balances", new Date());
    expect(mocks.syncRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          run_type: "leave_balances",
          status: "running",
          updated_at: { gte: expect.any(Date) },
        }),
      })
    );
  });
  it("reclaims expired running runs (>30m) by updating status to failed", async () => {
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 2 });
    await acquireSyncRun(input(), "people", new Date());
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: "lease_expired",
          status: "failed",
        }),
        where: expect.objectContaining({
          run_type: "people",
          started_at: { lt: expect.any(Date) },
          status: "running",
        }),
      })
    );
  });
  it("handles P2002 race condition on creation by returning existing run", async () => {
    const error = new Error("Unique constraint failed");
    (
      error as unknown as {
        code: string;
      }
    ).code = "P2002";
    mocks.syncRunCreate.mockRejectedValueOnce(error);
    mocks.syncRunFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: RUN_ID,
        records_failed: 0,
        records_fetched: 0,
        records_skipped: 0,
        records_synced: 0,
        records_upserted: 0,
        status: "succeeded",
      });
    const result = await acquireSyncRun(
      { ...input(), runId: RUN_ID },
      "leave_records",
      new Date()
    );
    expect(result).toEqual({
      kind: "terminal",
      run: expect.objectContaining({
        id: RUN_ID,
        status: "succeeded",
      }),
    });
  });
  it("assertRunActive resolves when run is running without cancel request", async () => {
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      cancel_requested_at: null,
      status: "running",
    });
    await expect(
      assertRunActive(
        { clerkOrgId: CLERK_ORG_ID, organisationId: ORGANISATION_ID },
        RUN_ID
      )
    ).resolves.toBeUndefined();
  });
  it("assertRunActive throws XeroSyncRunFencedError when run is not found", async () => {
    mocks.syncRunFindFirst.mockResolvedValueOnce(null);
    await expect(
      assertRunActive(
        { clerkOrgId: CLERK_ORG_ID, organisationId: ORGANISATION_ID },
        RUN_ID
      )
    ).rejects.toThrow(XeroSyncRunFencedError);
  });
  it("assertRunActive throws XeroSyncRunFencedError when run is not in running status", async () => {
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      cancel_requested_at: null,
      status: "cancelled",
    });
    await expect(
      assertRunActive(
        { clerkOrgId: CLERK_ORG_ID, organisationId: ORGANISATION_ID },
        RUN_ID
      )
    ).rejects.toThrow(XeroSyncRunFencedError);
  });
  it("assertRunActive throws XeroSyncRunFencedError when cancel_requested_at is set", async () => {
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      cancel_requested_at: new Date(),
      status: "running",
    });
    await expect(
      assertRunActive(
        { clerkOrgId: CLERK_ORG_ID, organisationId: ORGANISATION_ID },
        RUN_ID
      )
    ).rejects.toThrow(XeroSyncRunFencedError);
  });
  it("isRunCancelled returns true when cancel_requested_at is set and false when null", async () => {
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      cancel_requested_at: new Date(),
    });
    const cancelled = await isRunCancelled(
      { clerkOrgId: CLERK_ORG_ID, organisationId: ORGANISATION_ID },
      RUN_ID
    );
    expect(cancelled).toBe(true);
    mocks.syncRunFindFirst.mockResolvedValueOnce({
      cancel_requested_at: null,
    });
    const notCancelled = await isRunCancelled(
      { clerkOrgId: CLERK_ORG_ID, organisationId: ORGANISATION_ID },
      RUN_ID
    );
    expect(notCancelled).toBe(false);
  });
});
