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
