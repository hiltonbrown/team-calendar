import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureFreshXeroConnection: vi.fn(),
  failedRecordCreate: vi.fn(),
  fetchLeaveBalancesForRegion: vi.fn(),
  leaveBalanceUpsert: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  publishOrganisationNotificationEvent: vi.fn(),
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
    createFunction: vi.fn(() => ({ id: "sync-xero-leave-balances" })),
    send: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  },
}));
vi.mock("@repo/database", () => ({
  database: {
    failedRecord: { create: mocks.failedRecordCreate },
    leaveBalance: { upsert: mocks.leaveBalanceUpsert },
    person: {
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
    },
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
}));
vi.mock("@repo/database/generated/client", () => ({
  Prisma: { JsonNull: "JsonNull" },
}));
vi.mock("@repo/notifications", () => ({
  publishOrganisationNotificationEvent:
    mocks.publishOrganisationNotificationEvent,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@repo/xero", () => ({
  ensureFreshXeroConnection: mocks.ensureFreshXeroConnection,
  fetchLeaveBalancesForRegion: mocks.fetchLeaveBalancesForRegion,
  toPlainLanguageMessage: mocks.toPlainLanguageMessage,
}));

const { syncXeroLeaveBalances } = await import("./sync-xero-leave-balances");

const CLERK_ORG_ID = "org_balances_lifecycle";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "10000000-0000-4000-8000-000000000001";
const XERO_TENANT_ID = "20000000-0000-4000-8000-000000000001";

function input() {
  return {
    clerkOrgId: CLERK_ORG_ID,
    organisationId: ORGANISATION_ID,
    triggerType: "manual",
    xeroTenantId: XERO_TENANT_ID,
  };
}

describe("leave balances sync run lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: XERO_TENANT_ID,
      payroll_region: "AU",
      sync_paused_at: null,
      xero_connection: {},
      xero_connection_id: "40000000-0000-4000-8000-000000000001",
    });
    mocks.ensureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.personFindMany.mockResolvedValue([
      { id: "50000000-0000-4000-8000-000000000001", xero_employee_id: "emp_1" },
    ]);
    mocks.personFindFirst.mockResolvedValue({
      id: "50000000-0000-4000-8000-000000000001",
    });
    mocks.leaveBalanceUpsert.mockResolvedValue({});
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: { failures: [], leaveBalances: [], rawResponses: [] },
    });
  });

  it("bases the duplicate-run guard on the heartbeat, not started_at", async () => {
    const result = await syncXeroLeaveBalances(input());

    expect(result.ok).toBe(true);
    expect(mocks.syncRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          run_type: "leave_balances",
          status: "running",
          updated_at: { gte: expect.any(Date) },
          xero_tenant_id: XERO_TENANT_ID,
        }),
      })
    );
    const [guardCall] = mocks.syncRunFindFirst.mock.calls;
    expect(guardCall?.[0]?.where).not.toHaveProperty("started_at");
  });

  it("refreshes the run heartbeat while a long fetch is in flight", async () => {
    mocks.fetchLeaveBalancesForRegion.mockImplementation(
      async (_region, fetchInput) => {
        // Simulate the final employee completing, which always flushes a beat.
        await fetchInput.onProgress?.(1, 1);
        return {
          ok: true,
          value: { failures: [], leaveBalances: [], rawResponses: [] },
        };
      }
    );

    await syncXeroLeaveBalances(input());

    const heartbeatCall = mocks.syncRunUpdateMany.mock.calls.find(
      ([call]) =>
        call?.where?.status === "running" &&
        call?.where?.id === RUN_ID &&
        Object.keys(call?.data ?? {}).length === 1 &&
        call?.data?.updated_at instanceof Date
    );
    expect(heartbeatCall).toBeDefined();
  });

  it("upserts the derived record type for fetched balances", async () => {
    const employeeId = "60000000-0000-4000-8000-000000000001";
    mocks.personFindMany.mockResolvedValue([
      {
        id: "50000000-0000-4000-8000-000000000001",
        xero_employee_id: employeeId,
      },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [
          {
            balance: 12.5,
            employeeId,
            leaveTypeId: "annual-leave",
            leaveTypeName: "Annual Leave",
            rawPayload: { LeaveType: "Annual Leave" },
            unitType: "hours",
          },
        ],
        rawResponses: [],
      },
    });

    const result = await syncXeroLeaveBalances(input());

    expect(result.ok).toBe(true);
    expect(mocks.leaveBalanceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          leave_type_name: "Annual Leave",
          record_type: "annual_leave",
        }),
        update: expect.objectContaining({
          leave_type_name: "Annual Leave",
          record_type: "annual_leave",
        }),
      })
    );
  });
});
