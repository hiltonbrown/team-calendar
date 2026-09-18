import { Prisma } from "@repo/database/generated/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditEventCreate: vi.fn(),
  availabilityRecordFindMany: vi.fn(),
  availabilityRecordUpdateMany: vi.fn(),
  dispatchNotification: vi.fn(),
  ensureFreshXeroConnection: vi.fn(),
  failedRecordCreate: vi.fn(),
  fetchLeaveApplicationStatusForRegion: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  publishOrganisationNotificationEvent: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  syncRunCreate: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncRunUpdateMany: vi.fn(),
  toPlainLanguageMessage: vi.fn(() => "Xero request failed"),
  xeroTenantFindFirst: vi.fn(),
  xeroTenantUpdateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "reconcile-xero-approval-state" })),
    send: mocks.inngestSend,
  },
}));
vi.mock("@repo/auth/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: vi.fn(async (callback) =>
      callback({
        auditEvent: { create: mocks.auditEventCreate },
        availabilityRecord: { updateMany: mocks.availabilityRecordUpdateMany },
      })
    ),
    availabilityRecord: {
      findMany: mocks.availabilityRecordFindMany,
      updateMany: mocks.availabilityRecordUpdateMany,
    },
    failedRecord: { create: mocks.failedRecordCreate },
    syncRun: {
      create: mocks.syncRunCreate,
      findFirst: mocks.syncRunFindFirst,
      updateMany: mocks.syncRunUpdateMany,
    },
    xeroTenant: {
      findFirst: mocks.xeroTenantFindFirst,
      updateMany: mocks.xeroTenantUpdateMany,
    },
  },
  scopedTo: mocks.scopedTo,
}));
vi.mock("@repo/database/generated/client", () => ({
  Prisma: { DbNull: "DbNull" },
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatchNotification,
  publishOrganisationNotificationEvent:
    mocks.publishOrganisationNotificationEvent,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@repo/xero", () => ({
  ensureFreshXeroConnection: mocks.ensureFreshXeroConnection,
  fetchLeaveApplicationStatusForRegion:
    mocks.fetchLeaveApplicationStatusForRegion,
  toPlainLanguageMessage: mocks.toPlainLanguageMessage,
}));

const { reconcileXeroApprovalState } = await import(
  "./reconcile-xero-approval-state"
);

const CLERK_ORG_ID = "org_reconciliation_guard";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "10000000-0000-4000-8000-000000000001";
const XERO_TENANT_ID = "20000000-0000-4000-8000-000000000001";
const XERO_CONNECTION_ID = "40000000-0000-4000-8000-000000000001";
const RECORD_ID = "80000000-0000-4000-8000-000000000001";

function input() {
  return {
    clerkOrgId: CLERK_ORG_ID,
    organisationId: ORGANISATION_ID,
    triggerType: "manual",
    xeroTenantId: XERO_TENANT_ID,
  };
}

function record() {
  return {
    approval_status: "submitted",
    derived_sequence: 4,
    failed_action: null,
    id: RECORD_ID,
    person: {
      clerk_user_id: "user_record_owner",
      first_name: "Ada",
      id: "70000000-0000-4000-8000-000000000001",
      last_name: "Lovelace",
      xero_employee_id: "xero-employee-1",
    },
    record_type: "annual_leave",
    source_remote_id: "xero-leave-application-1",
  };
}

describe("reconcile Xero approval state optimistic concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: XERO_TENANT_ID,
      payroll_region: "AU",
      sync_paused_at: null,
      xero_connection_id: XERO_CONNECTION_ID,
    });
    mocks.ensureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.availabilityRecordFindMany.mockResolvedValue([record()]);
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditEventCreate.mockResolvedValue({});
    mocks.dispatchNotification.mockResolvedValue({});
    mocks.failedRecordCreate.mockResolvedValue({});
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: {
        approvedAt: null,
        rawResponse: {},
        status: "REJECTED",
      },
    });
  });

  it("counts a stale declined transition as matched without auditing or notifying", async () => {
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 0 });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ declined: 0, matched: 1 }),
      })
    );
    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ xero_write_claimed_at: null }]),
        }),
      })
    );
  });

  it("excludes active outbound claims from reconciliation selection", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([]);

    await reconcileXeroApprovalState(input());

    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          OR: expect.arrayContaining([{ xero_write_claimed_at: null }]),
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });

  it("audits and notifies after a guarded declined transition", async () => {
    const result = await reconcileXeroApprovalState(input());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ declined: 1, matched: 0 }),
      })
    );
    expect(mocks.auditEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "leave_declined" }),
      expect.anything()
    );
  });

  it("pins the snapshot state and tenant scope in the transition predicate", async () => {
    await reconcileXeroApprovalState(input());

    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approval_status: "submitted",
          clerk_org_id: CLERK_ORG_ID,
          derived_sequence: 4,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });

  it("does not audit an archive when the snapshot is stale", async () => {
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 0 });
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      error: { code: "not_found_error", rawPayload: null },
      ok: false,
    });

    await reconcileXeroApprovalState(input());

    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
  });

  it("clears the write-error fields on the decline branch", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([
      {
        ...record(),
        approval_status: "xero_sync_failed",
        failed_action: "decline",
      },
    ]);

    await reconcileXeroApprovalState(input());

    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "declined",
          failed_action: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        }),
      })
    );
  });

  it("clears the write-error fields on the final withdraw branch", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([
      { ...record(), approval_status: "approved" },
    ]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: {
        approvedAt: null,
        rawResponse: {},
        status: "WITHDRAWN",
      },
    });

    await reconcileXeroApprovalState(input());

    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "withdrawn",
          failed_action: null,
          xero_write_error: null,
          xero_write_error_raw: Prisma.DbNull,
        }),
      })
    );
  });
});

describe("reconcile Xero approval state bounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: XERO_TENANT_ID,
      payroll_region: "AU",
      sync_paused_at: null,
      xero_connection_id: XERO_CONNECTION_ID,
    });
    mocks.ensureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.auditEventCreate.mockResolvedValue({});
    mocks.dispatchNotification.mockResolvedValue({});
    mocks.failedRecordCreate.mockResolvedValue({});
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("windows candidates by ends_at and caps with take 500 ordered by xero_approval_checked_at nulls first then id", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: { approvedAt: null, rawResponse: {}, status: "APPROVED" },
    });

    await reconcileXeroApprovalState(input());

    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { xero_approval_checked_at: { nulls: "first", sort: "asc" } },
          { id: "asc" },
        ],
        take: 500,
        where: expect.objectContaining({
          ends_at: expect.objectContaining({ gte: expect.any(Date) }),
          source_remote_id: { not: null },
        }),
      })
    );
  });

  it("cap translates to partial_success with capped error summary and partial flag", async () => {
    vi.useFakeTimers();
    const records = Array.from({ length: 500 }, (_, i) => ({
      ...record(),
      approval_status: "submitted" as const,
      id: `80000000-0000-4000-8000-00000000${String(i).padStart(4, "0")}`.slice(
        0,
        36
      ),
      source_remote_id: `xero-leave-${i}`,
    }));
    mocks.availabilityRecordFindMany.mockResolvedValue(
      records as unknown as Awaited<
        ReturnType<typeof mocks.availabilityRecordFindMany>
      >
    );
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: { approvedAt: null, rawResponse: {}, status: "APPROVED" },
    });

    const promise = reconcileXeroApprovalState(input());
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (result.ok) {
      expect(result.value.partial).toBe(true);
      expect(result.value.status).toBe("partial_success");
    }
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: expect.stringContaining("capped at 500"),
          status: "partial_success",
        }),
      })
    );
  });

  it("non-capped run is succeeded when no failures and partial is false", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([record()]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: { approvedAt: null, rawResponse: {}, status: "REJECTED" },
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ partial: false, status: "succeeded" }),
      })
    );
  });

  it("partial run is distinct from failed and succeeded via status enum", async () => {
    vi.useFakeTimers();
    const records = Array.from({ length: 500 }, (_, i) => ({
      ...record(),
      id:
        `80000000-0000-4000-8000-00000001${String(i).padStart(4, "0")}`
          .slice(-4)
          .padStart(8, "0") + "-0000-4000-8000-000000000001".slice(8),
      source_remote_id: `xero-leave-partial-${i}`,
    }));
    mocks.availabilityRecordFindMany.mockResolvedValue(
      records as unknown as Awaited<
        ReturnType<typeof mocks.availabilityRecordFindMany>
      >
    );
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: {
        approvedAt: new Date("2026-06-10T00:00:00.000Z"),
        rawResponse: {},
        status: "APPROVED",
      },
    });

    const promise = reconcileXeroApprovalState(input());
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();
    expect(result.ok && result.value.status).toBe("partial_success");
    expect(result.ok && result.value.partial).toBe(true);
  });

  it("keeps processing other records when one Xero request fails under bounded concurrency", async () => {
    const second = {
      ...record(),
      id: "80000000-0000-4000-8000-000000000002",
      source_remote_id: "xero-leave-2",
    };
    mocks.availabilityRecordFindMany.mockResolvedValue([record(), second]);
    mocks.fetchLeaveApplicationStatusForRegion
      .mockResolvedValueOnce({
        error: { code: "network_error", message: "fail", rawPayload: null },
        ok: false,
      } as unknown as Awaited<
        ReturnType<typeof mocks.fetchLeaveApplicationStatusForRegion>
      >)
      .mockResolvedValueOnce({
        ok: true,
        value: { approvedAt: null, rawResponse: {}, status: "REJECTED" },
      } as unknown as Awaited<
        ReturnType<typeof mocks.fetchLeaveApplicationStatusForRegion>
      >);

    const result = await reconcileXeroApprovalState(input());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ declined: 1, failed: 1 }),
      })
    );
    expect(mocks.fetchLeaveApplicationStatusForRegion).toHaveBeenCalledTimes(2);
  });

  it("stops mid-way when cancellation is requested", async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 10 }, (_, i) => ({
      ...record(),
      id: `80000000-0000-4000-8000-00000000${String(i).padStart(4, "0")}`.slice(
        0,
        36
      ),
      source_remote_id: `xero-leave-cancel-${i}`,
    }));
    mocks.availabilityRecordFindMany.mockResolvedValue(
      many as unknown as Awaited<
        ReturnType<typeof mocks.availabilityRecordFindMany>
      >
    );
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: { approvedAt: null, rawResponse: {}, status: "REJECTED" },
    });
    let call = 0;
    mocks.syncRunFindFirst.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return null as unknown as Awaited<
          ReturnType<typeof mocks.syncRunFindFirst>
        >;
      }
      if (call === 2) {
        return null as unknown as Awaited<
          ReturnType<typeof mocks.syncRunFindFirst>
        >;
      }
      return { cancel_requested_at: new Date() } as unknown as Awaited<
        ReturnType<typeof mocks.syncRunFindFirst>
      >;
    });

    const promise = reconcileXeroApprovalState(input());
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ status: "cancelled" }),
      })
    );
    expect(mocks.fetchLeaveApplicationStatusForRegion).toHaveBeenCalledTimes(5);
  });

  it("uses BATCH_SIZE 5 to respect Xero five-concurrent limit", async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...record(),
      id: `80000000-0000-4000-8000-00000000${String(i).padStart(4, "0")}`.slice(
        0,
        36
      ),
      source_remote_id: `xero-leave-batch-${i}`,
    }));
    mocks.availabilityRecordFindMany.mockResolvedValue(
      many as unknown as Awaited<
        ReturnType<typeof mocks.availabilityRecordFindMany>
      >
    );
    let concurrent = 0;
    let peak = 0;
    mocks.fetchLeaveApplicationStatusForRegion.mockImplementation(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent -= 1;
      return {
        ok: true,
        value: { approvedAt: null, rawResponse: {}, status: "REJECTED" },
      } as unknown as Awaited<
        ReturnType<typeof mocks.fetchLeaveApplicationStatusForRegion>
      >;
    });

    const promise = reconcileXeroApprovalState(input());
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(peak).toBeLessThanOrEqual(5);
    expect(mocks.syncRunFindFirst).toHaveBeenCalledTimes(3);
  });

  it("prioritises never-checked records via xero_approval_checked_at nulls first ordering", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: { approvedAt: null, rawResponse: {}, status: "REJECTED" },
    });

    await reconcileXeroApprovalState(input());

    const call = mocks.availabilityRecordFindMany.mock.calls[0]?.[0] as {
      orderBy: unknown;
    };
    expect(call.orderBy).toEqual([
      { xero_approval_checked_at: { nulls: "first", sort: "asc" } },
      { id: "asc" },
    ]);
  });

  it("stamps a matched no-op with xero_approval_checked_at under dual-tenant scope", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([
      { ...record(), approval_status: "approved" },
    ]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: {
        approvedAt: new Date("2026-06-10T00:00:00.000Z"),
        rawResponse: {},
        status: "APPROVED",
      },
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ matched: 1 }),
      })
    );
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          xero_approval_checked_at: expect.any(Date),
        }),
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          id: RECORD_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });

  it("processes disjoint record sets across consecutive runs when candidates exceed MAX_REQUESTS_PER_RUN", async () => {
    vi.useFakeTimers();
    const candidateStore = Array.from({ length: 600 }, (_, i) => ({
      ...record(),
      approval_status: "submitted" as const,
      id: `80000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      source_remote_id: `xero-leave-${i}`,
      xero_approval_checked_at: null as Date | null,
    }));

    mocks.availabilityRecordFindMany.mockImplementation((args: any) => {
      const orderBy = args?.orderBy;
      const records = [...candidateStore];
      if (Array.isArray(orderBy)) {
        records.sort((a, b) => {
          for (const clause of orderBy) {
            if ("xero_approval_checked_at" in clause) {
              const aVal =
                a.xero_approval_checked_at?.getTime() ??
                Number.NEGATIVE_INFINITY;
              const bVal =
                b.xero_approval_checked_at?.getTime() ??
                Number.NEGATIVE_INFINITY;
              if (aVal !== bVal) {
                return aVal - bVal;
              }
            } else if ("approval_status" in clause) {
              if (a.approval_status !== b.approval_status) {
                return a.approval_status.localeCompare(b.approval_status);
              }
            } else if ("id" in clause) {
              return a.id.localeCompare(b.id);
            }
          }
          return 0;
        });
      }
      return records.slice(0, args?.take ?? records.length);
    });

    mocks.availabilityRecordUpdateMany.mockImplementation((args: any) => {
      if (args?.data?.xero_approval_checked_at) {
        const id = args.where?.id;
        if (id) {
          const rec = candidateStore.find((r) => r.id === id);
          if (rec) {
            rec.xero_approval_checked_at = args.data.xero_approval_checked_at;
          }
        }
      }
      return { count: 1 };
    });

    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: { approvedAt: null, rawResponse: {}, status: "APPROVED" },
    });

    const run1Promise = reconcileXeroApprovalState(input());
    await vi.runAllTimersAsync();
    await run1Promise;

    const firstRunFetchedIds = (
      mocks.fetchLeaveApplicationStatusForRegion.mock.calls as any[]
    ).map((c) => c[1]?.xeroLeaveApplicationId);
    mocks.fetchLeaveApplicationStatusForRegion.mockClear();

    const run2Promise = reconcileXeroApprovalState(input());
    await vi.runAllTimersAsync();
    await run2Promise;

    const secondRunFetchedIds = (
      mocks.fetchLeaveApplicationStatusForRegion.mock.calls as any[]
    ).map((c) => c[1]?.xeroLeaveApplicationId);
    vi.useRealTimers();

    expect(firstRunFetchedIds).toHaveLength(500);
    expect(secondRunFetchedIds).toHaveLength(500);
    expect(secondRunFetchedIds).toContain("xero-leave-500");
    expect(secondRunFetchedIds).toContain("xero-leave-599");
    expect(secondRunFetchedIds).not.toEqual(firstRunFetchedIds);
  });

  it("covers every candidate across full multi-run cycles without starvation", async () => {
    vi.useFakeTimers();
    const candidateStore = Array.from({ length: 1200 }, (_, i) => ({
      ...record(),
      approval_status: "submitted" as const,
      id: `80000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      source_remote_id: `xero-leave-${i}`,
      xero_approval_checked_at: null as Date | null,
    }));

    mocks.availabilityRecordFindMany.mockImplementation((args: any) => {
      const records = [...candidateStore];
      records.sort((a, b) => {
        const aVal =
          a.xero_approval_checked_at?.getTime() ?? Number.NEGATIVE_INFINITY;
        const bVal =
          b.xero_approval_checked_at?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (aVal !== bVal) {
          return aVal - bVal;
        }
        return a.id.localeCompare(b.id);
      });
      return records.slice(0, args?.take ?? records.length);
    });

    mocks.availabilityRecordUpdateMany.mockImplementation((args: any) => {
      if (args?.data?.xero_approval_checked_at) {
        const id = args.where?.id;
        if (id) {
          const rec = candidateStore.find((r) => r.id === id);
          if (rec) {
            rec.xero_approval_checked_at = args.data.xero_approval_checked_at;
          }
        }
      }
      return { count: 1 };
    });

    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: { approvedAt: null, rawResponse: {}, status: "APPROVED" },
    });

    const checkedRemoteIds = new Set<string>();

    // 3 runs of 500 cover 1500 slots, fully checking all 1200 records
    for (let run = 0; run < 3; run += 1) {
      const promise = reconcileXeroApprovalState(input());
      await vi.runAllTimersAsync();
      await promise;
      for (const call of mocks.fetchLeaveApplicationStatusForRegion.mock
        .calls as any[]) {
        checkedRemoteIds.add(call[1]?.xeroLeaveApplicationId);
      }
      mocks.fetchLeaveApplicationStatusForRegion.mockClear();
    }
    vi.useRealTimers();

    expect(checkedRemoteIds.size).toBe(1200);
    expect(
      candidateStore.every((c) => c.xero_approval_checked_at instanceof Date)
    ).toBe(true);
  });

  it("increments archivedMissing without incrementing failed on not_found_error and completes with succeeded", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([record()]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      error: { code: "not_found_error", rawPayload: null },
      ok: false,
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          archivedMissing: 1,
          failed: 0,
          status: "succeeded",
        }),
      })
    );
    expect(mocks.failedRecordCreate).not.toHaveBeenCalled();
  });

  it("increments failed, records failure, stamps checked marker, and forces partial_success on genuine upstream error", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([record()]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      error: { code: "network_error", message: "timeout", rawPayload: null },
      ok: false,
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          failed: 1,
          status: "partial_success",
        }),
      })
    );
    expect(mocks.failedRecordCreate).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          xero_approval_checked_at: expect.any(Date),
        }),
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          id: RECORD_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });
});

describe("regional approval state reconciliation (Plan 105)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: XERO_TENANT_ID,
      payroll_region: "NZ",
      sync_paused_at: null,
      xero_connection_id: XERO_CONNECTION_ID,
    });
    mocks.ensureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.availabilityRecordFindMany.mockResolvedValue([record()]);
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditEventCreate.mockResolvedValue({});
    mocks.dispatchNotification.mockResolvedValue({});
    mocks.failedRecordCreate.mockResolvedValue({});
    mocks.toPlainLanguageMessage.mockReturnValue(
      "Your Xero organisation does not have permission to access this payroll feature. Check your Xero subscription and permissions."
    );
  });

  it("selects xero_employee_id on person and passes it to dispatch for NZ region", async () => {
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: {
        approvedAt: new Date("2026-06-10T00:00:00.000Z"),
        rawResponse: {},
        status: "APPROVED",
      },
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toMatchObject({
      ok: true,
      value: { approved: 1, failed: 0, status: "succeeded" },
    });

    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          person: {
            select: {
              clerk_user_id: true,
              first_name: true,
              id: true,
              last_name: true,
              manager: { select: { clerk_user_id: true, id: true } },
              xero_employee_id: true,
            },
          },
        },
      })
    );

    expect(mocks.fetchLeaveApplicationStatusForRegion).toHaveBeenCalledWith(
      "NZ",
      expect.objectContaining({
        xeroEmployeeId: "xero-employee-1",
        xeroLeaveApplicationId: "xero-leave-application-1",
        xeroTenant: expect.objectContaining({
          id: XERO_TENANT_ID,
          payroll_region: "NZ",
        }),
      })
    );
  });

  it("selects xero_employee_id on person and passes it to dispatch for UK region", async () => {
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: XERO_TENANT_ID,
      payroll_region: "UK",
      sync_paused_at: null,
      xero_connection_id: XERO_CONNECTION_ID,
    });
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      ok: true,
      value: {
        approvedAt: null,
        rawResponse: {},
        status: "REJECTED",
      },
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toMatchObject({
      ok: true,
      value: { declined: 1, failed: 0, status: "succeeded" },
    });

    expect(mocks.fetchLeaveApplicationStatusForRegion).toHaveBeenCalledWith(
      "UK",
      expect.objectContaining({
        xeroEmployeeId: "xero-employee-1",
        xeroLeaveApplicationId: "xero-leave-application-1",
        xeroTenant: expect.objectContaining({
          id: XERO_TENANT_ID,
          payroll_region: "UK",
        }),
      })
    );
  });

  it("treats missing employee ID as a record failure that advances fairly without a raw provider call", async () => {
    mocks.availabilityRecordFindMany.mockResolvedValue([
      {
        ...record(),
        person: {
          ...record().person,
          xero_employee_id: null,
        },
      },
    ]);
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      error: {
        code: "validation_error",
        message: "NZ payroll approval-state read requires xeroEmployeeId.",
        rawPayload: null,
      },
      ok: false,
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toMatchObject({
      ok: true,
      value: {
        failed: 1,
        status: "partial_success",
      },
    });

    expect(mocks.fetchLeaveApplicationStatusForRegion).toHaveBeenCalledWith(
      "NZ",
      expect.objectContaining({
        xeroEmployeeId: undefined,
        xeroLeaveApplicationId: "xero-leave-application-1",
      })
    );

    expect(mocks.failedRecordCreate).toHaveBeenCalledTimes(1);
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_code: "validation_error",
          error_message: expect.any(String),
          source_remote_id: "xero-leave-application-1",
        }),
      })
    );

    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          xero_approval_checked_at: expect.any(Date),
        }),
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          id: RECORD_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });

  it("treats a 403 permission_error as a blanket run failure rather than a business status or not found", async () => {
    mocks.fetchLeaveApplicationStatusForRegion.mockResolvedValue({
      error: {
        code: "permission_error",
        httpStatus: 403,
        message: "Forbidden",
        rawPayload: { Message: "Forbidden" },
      },
      ok: false,
    });

    const result = await reconcileXeroApprovalState(input());

    expect(result).toMatchObject({
      ok: true,
      value: {
        approved: 0,
        archivedMissing: 0,
        declined: 0,
        failed: 0,
        status: "failed",
        withdrawn: 0,
      },
    });

    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary:
            "Your Xero organisation does not have permission to access this payroll feature. Check your Xero subscription and permissions.",
          records_failed: 0,
          records_synced: 0,
          status: "failed",
        }),
      })
    );

    expect(mocks.failedRecordCreate).not.toHaveBeenCalled();
    expect(mocks.auditEventCreate).not.toHaveBeenCalled();
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
  });
});
