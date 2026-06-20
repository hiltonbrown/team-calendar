import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  dispatchSyncEvent: vi.fn(),
  failedRecordFindMany: vi.fn(),
  getRegisteredSyncEventName: vi.fn(),
  syncRunFindMany: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
  xeroTenantFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    auditEvent: { create: mocks.auditCreate },
    failedRecord: { findMany: mocks.failedRecordFindMany },
    syncRun: { findMany: mocks.syncRunFindMany },
    xeroTenant: {
      findFirst: mocks.xeroTenantFindFirst,
      findMany: mocks.xeroTenantFindMany,
    },
  },
}));
vi.mock("./sync-events", () => ({
  dispatchCancelSyncRun: vi.fn(),
  dispatchSyncEvent: mocks.dispatchSyncEvent,
  getRegisteredSyncEventName: mocks.getRegisteredSyncEventName,
  syncEventNames: {
    approval_state_reconciliation:
      "availability.sync.approval_state_reconciliation",
    leave_balances: "availability.sync.leave_balances",
    leave_records: "availability.sync.leave_records",
    people: "availability.sync.people",
  },
}));

const { dispatchManualSync, listTenantSummaries } = await import(
  "./sync-monitor-service"
);

const baseInput = {
  actingRole: "admin" as const,
  actingUserId: "user_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};

describe("sync-monitor-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.xeroTenantFindMany.mockResolvedValue([
      {
        id: "tenant_1",
        payroll_region: "AU",
        sync_paused_at: new Date("2026-04-19T10:00:00.000Z"),
        tenant_name: "Acme Payroll",
        xero_connection: {
          access_token_encrypted: "token",
          refresh_token_encrypted: "refresh",
          revoked_at: null,
          token_expires_at: new Date("2026-04-20T10:00:00.000Z"),
        },
      },
    ]);
    mocks.syncRunFindMany.mockResolvedValue([]);
    mocks.failedRecordFindMany.mockResolvedValue([]);
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: "tenant_1",
      organisation_id: baseInput.organisationId,
      sync_paused_at: new Date("2026-04-19T10:00:00.000Z"),
      xero_connection: {
        access_token_encrypted: "token",
        revoked_at: null,
        token_expires_at: new Date("2026-04-20T10:00:00.000Z"),
      },
    });
    mocks.getRegisteredSyncEventName.mockReturnValue(
      "availability.sync.approval_state_reconciliation"
    );
    mocks.dispatchSyncEvent.mockResolvedValue({
      ok: true,
      value: undefined,
    });
  });

  it("includes syncPausedAt in tenant summaries", async () => {
    const result = await listTenantSummaries(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          syncPausedAt: new Date("2026-04-19T10:00:00.000Z"),
          tenantName: "Acme Payroll",
        },
      ],
    });
  });

  it("bounds tenant summary run and failed-record queries to the 30-day window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const startedAt = new Date("2026-04-19T12:00:00.000Z");
    const completedAt = new Date("2026-04-19T12:05:00.000Z");
    mocks.syncRunFindMany.mockResolvedValue([
      {
        completed_at: completedAt,
        failed_records: [{ id: "failed_record_1" }],
        id: "run_1",
        records_failed: 1,
        records_upserted: 4,
        run_type: "people",
        started_at: startedAt,
        status: "partial_success",
        xero_tenant_id: "tenant_1",
      },
    ]);
    mocks.failedRecordFindMany.mockResolvedValue([
      {
        created_at: new Date("2026-04-19T12:01:00.000Z"),
        id: "failed_record_1",
        sync_run: {
          run_type: "people",
          started_at: startedAt,
          xero_tenant_id: "tenant_1",
        },
      },
    ]);

    try {
      const result = await listTenantSummaries(baseInput);
      const since = new Date("2026-03-21T12:00:00.000Z");

      expect(mocks.syncRunFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            started_at: { gte: since },
            xero_tenant_id: { in: ["tenant_1"] },
          }),
        })
      );
      expect(mocks.failedRecordFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sync_run: {
              started_at: { gte: since },
              xero_tenant_id: { in: ["tenant_1"] },
            },
          }),
        })
      );
      expect(result).toMatchObject({
        ok: true,
        value: [
          {
            failedRunsLast30Days: 1,
            lastPeopleSync: completedAt,
            lastRun: {
              id: "run_1",
              recordsFailed: 1,
              recordsUpserted: 4,
              runType: "people",
              startedAt,
              status: "partial_success",
            },
            pendingFailedRecords: 1,
            totalRunsLast30Days: 1,
          },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses manual sync for paused tenants", async () => {
    const result = await dispatchManualSync({
      ...baseInput,
      runType: "approval_state_reconciliation",
      xeroTenantId: "00000000-0000-4000-8000-000000000201",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        eventName: "availability.sync.approval_state_reconciliation",
        queued: false,
        reason: "tenant_sync_paused",
      },
    });
    expect(mocks.dispatchSyncEvent).not.toHaveBeenCalled();
  });
});
