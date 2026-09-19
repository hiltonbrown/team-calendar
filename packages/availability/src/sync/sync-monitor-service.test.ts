import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncRunStatus, SyncRunType } from "./sync-monitor-service";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  auditFindMany: vi.fn(),
  dispatchSyncEvent: vi.fn(),
  failedRecordCount: vi.fn(),
  failedRecordFindFirst: vi.fn(),
  failedRecordFindMany: vi.fn(),
  getRegisteredSyncEventName: vi.fn(),
  scopedTo: vi.fn((input: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  })),
  syncRunFindFirst: vi.fn(),
  syncRunFindMany: vi.fn(),
  syncRunGroupBy: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
  xeroTenantFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: vi.fn((callback) =>
      callback({
        auditEvent: { create: mocks.auditCreate },
        failedRecord: { findFirst: mocks.failedRecordFindFirst },
      })
    ),
    auditEvent: { create: mocks.auditCreate, findMany: mocks.auditFindMany },
    failedRecord: {
      count: mocks.failedRecordCount,
      findFirst: mocks.failedRecordFindFirst,
      findMany: mocks.failedRecordFindMany,
    },
    syncRun: {
      findFirst: mocks.syncRunFindFirst,
      findMany: mocks.syncRunFindMany,
      groupBy: mocks.syncRunGroupBy,
    },
    xeroTenant: {
      findFirst: mocks.xeroTenantFindFirst,
      findMany: mocks.xeroTenantFindMany,
    },
  },
  scopedTo: mocks.scopedTo,
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

const {
  dispatchManualSync,
  getRedactedFailedRecordPayload,
  getRunDetail,
  listTenantSummaries,
} = await import("./sync-monitor-service");

const baseInput = {
  actingRole: "admin" as const,
  actingUserId: "user_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};

function completedRunFixture(input: {
  completedAt?: Date;
  failedRecordIds?: string[];
  id: string;
  recordsFailed?: number;
  recordsUpserted?: number;
  runType: SyncRunType;
  startedAt: Date;
  status: Exclude<SyncRunStatus, "running">;
}) {
  return {
    completed_at:
      input.completedAt ?? new Date(input.startedAt.getTime() + 5 * 60_000),
    failed_records: (input.failedRecordIds ?? []).map((id) => ({ id })),
    id: input.id,
    records_failed: input.recordsFailed ?? 0,
    records_upserted: input.recordsUpserted ?? 5,
    run_type: input.runType,
    started_at: input.startedAt,
    status: input.status,
    xero_tenant_id: "tenant_1",
  };
}

function failedRecordFixture(input: {
  createdAt: Date;
  id: string;
  runType: SyncRunType;
  startedAt: Date;
}) {
  return {
    created_at: input.createdAt,
    id: input.id,
    sync_run: {
      run_type: input.runType,
      started_at: input.startedAt,
      xero_tenant_id: "tenant_1",
    },
  };
}

function mockSummaryRuns(runs: ReturnType<typeof completedRunFixture>[]): void {
  mocks.syncRunFindFirst.mockImplementation(
    ({ where }: { where: { run_type?: SyncRunType; status?: unknown } }) => {
      if (where.status === "running") {
        return null;
      }
      return (
        runs.find((run) => {
          if (where.run_type && run.run_type !== where.run_type) {
            return false;
          }
          if (
            typeof where.status === "object" &&
            where.status &&
            "in" in where.status
          ) {
            const statuses = (where.status as { in: SyncRunStatus[] }).in;
            return statuses.includes(run.status);
          }
          return true;
        }) ?? null
      );
    }
  );
}

describe("sync-monitor-service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    mockSummaryRuns([]);
    mocks.failedRecordFindMany.mockResolvedValue([]);
    mocks.failedRecordCount.mockResolvedValue(0);
    mocks.auditFindMany.mockResolvedValue([]);
    mocks.syncRunGroupBy.mockResolvedValue([]);
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

  it("bounds initial detail and excludes raw or arbitrary audit payloads", async () => {
    mocks.syncRunFindFirst.mockResolvedValue({
      _count: { failed_records: 0 },
      completed_at: new Date("2026-04-19T12:05:00.000Z"),
      error_summary: null,
      id: "00000000-0000-4000-8000-000000000021",
      records_failed: 0,
      records_fetched: 1,
      records_skipped: 0,
      records_upserted: 1,
      run_type: "people",
      started_at: new Date("2026-04-19T12:00:00.000Z"),
      status: "succeeded",
      trigger_type: "scheduled",
      triggered_by_user_id: null,
      xero_tenant: { id: "tenant_1", tenant_name: "Acme Payroll" },
      xero_tenant_id: "tenant_1",
    });

    const result = await getRunDetail({
      ...baseInput,
      runId: "00000000-0000-4000-8000-000000000021",
    });

    expect(result.ok).toBe(true);
    expect(mocks.failedRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ raw_payload: true }),
        take: 51,
      })
    );
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          action: true,
          actor_user_id: true,
          created_at: true,
          id: true,
        },
        take: 51,
      })
    );
  });

  it("loads and audits only a run-bound redacted failure payload", async () => {
    mocks.failedRecordFindFirst.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000031",
      raw_payload: { access_token: "secret", safe: "visible" },
    });

    const result = await getRedactedFailedRecordPayload({
      ...baseInput,
      failureId: "00000000-0000-4000-8000-000000000031",
      runId: "00000000-0000-4000-8000-000000000021",
    });

    expect(mocks.failedRecordFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: baseInput.clerkOrgId,
          id: "00000000-0000-4000-8000-000000000031",
          organisation_id: baseInput.organisationId,
          sync_run_id: "00000000-0000-4000-8000-000000000021",
        }),
      })
    );
    expect(result).toEqual({
      ok: true,
      value: { payload: { access_token: "[SCRUBBED]", safe: "visible" } },
    });
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
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
    mockSummaryRuns([
      completedRunFixture({
        completedAt,
        failedRecordIds: ["failed_record_1"],
        id: "run_1",
        recordsFailed: 1,
        recordsUpserted: 4,
        runType: "people",
        startedAt,
        status: "partial_success",
      }),
    ]);
    mocks.failedRecordFindMany.mockResolvedValue([
      failedRecordFixture({
        createdAt: new Date("2026-04-19T12:01:00.000Z"),
        id: "failed_record_1",
        runType: "people",
        startedAt,
      }),
    ]);
    mocks.failedRecordCount.mockImplementation(({ where }) =>
      where.sync_run.run_type === "people" ? 1 : 0
    );
    mocks.syncRunGroupBy.mockResolvedValue([
      {
        _count: { _all: 1 },
        status: "partial_success",
        xero_tenant_id: "tenant_1",
      },
    ]);

    try {
      const result = await listTenantSummaries(baseInput);
      const since = new Date("2026-03-21T12:00:00.000Z");

      expect(mocks.syncRunGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            started_at: { gte: since },
            xero_tenant_id: { in: ["tenant_1"] },
          }),
        })
      );
      expect(mocks.failedRecordCount).toHaveBeenCalledTimes(4);
      expect(result).toMatchObject({
        ok: true,
        value: [
          {
            currentFailedRuns: 0,
            currentPartialSuccessRuns: 1,
            failedRunsLast30Days: 0,
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

  it("keeps failed runs as history after a later successful run resolves the current issue", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const failedAt = new Date("2026-04-18T12:00:00.000Z");
    const succeededAt = new Date("2026-04-19T12:00:00.000Z");
    mockSummaryRuns([
      completedRunFixture({
        id: "run_succeeded",
        runType: "people",
        startedAt: succeededAt,
        status: "succeeded",
      }),
      completedRunFixture({
        failedRecordIds: ["failed_record_1"],
        id: "run_failed",
        recordsFailed: 1,
        recordsUpserted: 0,
        runType: "people",
        startedAt: failedAt,
        status: "failed",
      }),
    ]);
    mocks.failedRecordFindMany.mockResolvedValue([
      failedRecordFixture({
        createdAt: new Date("2026-04-18T12:01:00.000Z"),
        id: "failed_record_1",
        runType: "people",
        startedAt: failedAt,
      }),
    ]);
    mocks.syncRunGroupBy.mockResolvedValue([
      { _count: { _all: 1 }, status: "failed", xero_tenant_id: "tenant_1" },
      { _count: { _all: 1 }, status: "succeeded", xero_tenant_id: "tenant_1" },
    ]);

    const result = await listTenantSummaries(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          currentFailedRuns: 0,
          currentPartialSuccessRuns: 0,
          failedRunsLast30Days: 1,
          lastRun: { id: "run_succeeded", status: "succeeded" },
          pendingFailedRecords: 0,
        },
      ],
    });
  });

  it("tracks the latest completed outcome independently for each run type", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const oldestAt = new Date("2026-04-17T12:00:00.000Z");
    const failedAt = new Date("2026-04-18T12:00:00.000Z");
    const succeededAt = new Date("2026-04-19T12:00:00.000Z");
    mockSummaryRuns([
      completedRunFixture({
        id: "run_leave_records_succeeded",
        runType: "leave_records",
        startedAt: succeededAt,
        status: "succeeded",
      }),
      completedRunFixture({
        failedRecordIds: ["failed_record_1"],
        id: "run_people_failed",
        recordsFailed: 1,
        recordsUpserted: 0,
        runType: "people",
        startedAt: failedAt,
        status: "failed",
      }),
      completedRunFixture({
        failedRecordIds: ["failed_record_2"],
        id: "run_leave_records_partial",
        recordsFailed: 1,
        recordsUpserted: 4,
        runType: "leave_records",
        startedAt: oldestAt,
        status: "partial_success",
      }),
    ]);
    mocks.failedRecordFindMany.mockResolvedValue([
      failedRecordFixture({
        createdAt: new Date("2026-04-18T12:01:00.000Z"),
        id: "failed_record_1",
        runType: "people",
        startedAt: failedAt,
      }),
      failedRecordFixture({
        createdAt: new Date("2026-04-17T12:01:00.000Z"),
        id: "failed_record_2",
        runType: "leave_records",
        startedAt: oldestAt,
      }),
    ]);
    mocks.failedRecordCount.mockImplementation(({ where }) =>
      where.sync_run.run_type === "people" ? 1 : 0
    );
    mocks.syncRunGroupBy.mockResolvedValue([
      { _count: { _all: 1 }, status: "failed", xero_tenant_id: "tenant_1" },
      { _count: { _all: 1 }, status: "succeeded", xero_tenant_id: "tenant_1" },
      {
        _count: { _all: 1 },
        status: "partial_success",
        xero_tenant_id: "tenant_1",
      },
    ]);

    const result = await listTenantSummaries(baseInput);

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          currentFailedRuns: 1,
          currentPartialSuccessRuns: 0,
          failedRunsLast30Days: 1,
          pendingFailedRecords: 1,
        },
      ],
    });
  });

  it("dispatches manual sync for active connection even if access token expires_at is past", async () => {
    const validTenantId = "00000000-0000-4000-8000-000000000010";
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: validTenantId,
      organisation_id: baseInput.organisationId,
      sync_paused_at: null,
      xero_connection: {
        access_token_encrypted: "token",
        expires_at: new Date("2020-01-01T00:00:00.000Z"),
        refresh_token_encrypted: "refresh",
        revoked_at: null,
        status: "active",
      },
    });

    const result = await dispatchManualSync({
      ...baseInput,
      runType: "people",
      xeroTenantId: validTenantId,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        eventName: "availability.sync.people",
        queued: true,
      },
    });
    expect(mocks.dispatchSyncEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: baseInput.clerkOrgId,
        organisationId: baseInput.organisationId,
        runType: "people",
        triggerType: "manual",
        xeroTenantId: validTenantId,
      })
    );
  });
});
