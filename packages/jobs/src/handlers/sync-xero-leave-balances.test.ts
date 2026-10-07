import { database } from "@repo/database";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  failedRecordCreate: vi.fn(),
  fetchLeaveBalancesForRegion: vi.fn(),
  isSupportedCurrencyCode: vi.fn((value: unknown) => value === "NZD"),
  leaveBalanceUpsert: vi.fn(),
  mapXeroLeaveType: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  publishOrganisationNotificationEvent: vi.fn(),
  resolveXeroAccess: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  syncRunCreate: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncRunUpdateMany: vi.fn(),
  toPlainLanguageMessage: vi.fn(() => "Xero request failed"),
  toValidatedLeaveBalanceRawPayload: vi.fn((value: unknown) => value ?? null),
  xeroConnectionFindFirst: vi.fn(),
  xeroConnectionUpdateMany: vi.fn(),
  xeroSyncCursorCreate: vi.fn(),
  xeroSyncCursorFindFirst: vi.fn(),
  xeroSyncCursorUpdateMany: vi.fn(),
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
    xeroConnection: {
      findFirst: mocks.xeroConnectionFindFirst,
      updateMany: mocks.xeroConnectionUpdateMany,
    },
    xeroSyncCursor: {
      create: mocks.xeroSyncCursorCreate,
      findFirst: mocks.xeroSyncCursorFindFirst,
      updateMany: mocks.xeroSyncCursorUpdateMany,
    },
  },
  scopedTo: mocks.scopedTo,
}));
vi.mock("@repo/database/generated/client", () => ({
  Prisma: { DbNull: "DbNull", JsonNull: "JsonNull" },
}));
vi.mock("@repo/notifications", () => ({
  publishOrganisationNotificationEvent:
    mocks.publishOrganisationNotificationEvent,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@repo/xero", async () => ({
  classifyXeroFailure: (
    await vi.importActual<typeof import("@repo/xero")>("@repo/xero")
  ).classifyXeroFailure,
  fetchLeaveBalancesForRegion: mocks.fetchLeaveBalancesForRegion,
  isSupportedCurrencyCode: mocks.isSupportedCurrencyCode,
  mapXeroLeaveType: mocks.mapXeroLeaveType,
  resolveXeroAccess: async (scope) => {
    const result = await mocks.resolveXeroAccess(scope);
    if (!result?.ok) {
      return result;
    }
    const tenant =
      await mocks.xeroConnectionFindFirst.mock.results.at(-1)?.value;
    return {
      ok: true,
      value: {
        ...result.value,
        accessToken: "fake-access",
        capability: scope.capability,
        connectionId: tenant.id,
        deadline: scope.deadline,
        payrollRegion: tenant.payroll_region,
        providerTenantId: tenant.xero_tenant_id ?? "fake-tenant",
      },
    };
  },
  toPlainLanguageMessage: mocks.toPlainLanguageMessage,
  toResolvedXeroConnection: (scope, value) => ({
    ...value,
    clerk_org_id: scope.clerkOrgId,
    id: value.connectionId,
    organisation_id: scope.organisationId,
    payroll_region: value.payrollRegion,
    xero_tenant_id: value.providerTenantId,
  }),
  toValidatedLeaveBalanceRawPayload: mocks.toValidatedLeaveBalanceRawPayload,
}));
const { syncXeroLeaveBalances } = await import("./sync-xero-leave-balances");
const CLERK_ORG_ID = "org_balances_lifecycle";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "10000000-0000-4000-8000-000000000001";
const XERO_CONNECTION_ID = "20000000-0000-4000-8000-000000000001";
let connectionFixture: Record<string, unknown> = {};
function mockConnection(overrides: Record<string, unknown>) {
  connectionFixture = { ...connectionFixture, ...overrides };
  mocks.xeroConnectionFindFirst.mockResolvedValue(connectionFixture);
}
function expectRosterUnchanged() {
  expect(
    mocks.xeroConnectionUpdateMany.mock.calls.filter(([call]) =>
      Object.hasOwn(call.data, "balance_next_person_id")
    )
  ).toEqual([]);
}
function input() {
  return {
    clerkOrgId: CLERK_ORG_ID,
    connectionId: XERO_CONNECTION_ID,
    organisationId: ORGANISATION_ID,
    triggerType: "manual",
  };
}
describe("leave balances sync run lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionFixture = { balance_next_person_id: null };
    Object.assign(database, {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => []),
      $transaction: vi.fn(async (callback) => callback(database)),
    });
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroConnectionUpdateMany.mockResolvedValue({ count: 1 });
    mockConnection({
      id: XERO_CONNECTION_ID,
      payroll_region: "AU",
      sync_paused_at: null,
    });
    mocks.resolveXeroAccess.mockResolvedValue({
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
    mocks.mapXeroLeaveType.mockReturnValue({
      mapped: true,
      recordType: "annual_leave",
    });
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
          xero_connection_id: XERO_CONNECTION_ID,
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
            currencyCode: null,
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
    expect(mocks.personFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.personFindFirst).not.toHaveBeenCalled();
    expect(mocks.leaveBalanceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          currency_code: null,
          leave_type_name: "Annual Leave",
          record_type: "annual_leave",
          source_payload_json: { LeaveType: "Annual Leave" },
        }),
        update: expect.objectContaining({
          currency_code: null,
          leave_type_name: "Annual Leave",
          record_type: "annual_leave",
          source_payload_json: { LeaveType: "Annual Leave" },
        }),
      })
    );
  });
  it("upserts a currency balance with a supported currency code", async () => {
    const employeeId = "60000000-0000-4000-8000-000000000005";
    mocks.personFindMany.mockResolvedValue([
      {
        id: "50000000-0000-4000-8000-000000000005",
        xero_employee_id: employeeId,
      },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [
          {
            balance: 1234.56,
            currencyCode: "NZD",
            employeeId,
            leaveTypeId: "holiday-pay",
            leaveTypeName: "Holiday Pay",
            rawPayload: { TypeOfUnits: "Dollars" },
            unitType: "currency",
          },
        ],
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
    }
    expect(mocks.leaveBalanceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          balance_unit: "currency",
          currency_code: "NZD",
        }),
        update: expect.objectContaining({
          balance_unit: "currency",
          currency_code: "NZD",
        }),
      })
    );
  });
  it("rejects a currency balance without a supported currency code", async () => {
    const employeeId = "60000000-0000-4000-8000-000000000006";
    mocks.personFindMany.mockResolvedValue([
      {
        id: "50000000-0000-4000-8000-000000000006",
        xero_employee_id: employeeId,
      },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [
          {
            balance: 1234.56,
            currencyCode: null,
            employeeId,
            leaveTypeId: "holiday-pay",
            leaveTypeName: "Holiday Pay",
            rawPayload: { TypeOfUnits: "Dollars" },
            unitType: "currency",
          },
        ],
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("partial_success");
      expect(result.value.failed).toBe(1);
    }
    expect(mocks.leaveBalanceUpsert).not.toHaveBeenCalled();
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ error_code: "validation_error" }),
      })
    );
  });
  it("rejects an hours balance that carries a currency code", async () => {
    const employeeId = "60000000-0000-4000-8000-000000000007";
    mocks.personFindMany.mockResolvedValue([
      {
        id: "50000000-0000-4000-8000-000000000007",
        xero_employee_id: employeeId,
      },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [
          {
            balance: 76,
            currencyCode: "NZD",
            employeeId,
            leaveTypeId: "annual-leave",
            leaveTypeName: "Annual Leave",
            rawPayload: { TypeOfUnits: "Hours" },
            unitType: "hours",
          },
        ],
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("partial_success");
      expect(result.value.failed).toBe(1);
    }
    expect(mocks.leaveBalanceUpsert).not.toHaveBeenCalled();
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ error_code: "validation_error" }),
      })
    );
  });
  it("uses the upfront people query for multiple balances", async () => {
    const people = [
      {
        id: "50000000-0000-4000-8000-000000000001",
        xero_employee_id: "60000000-0000-4000-8000-000000000001",
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        xero_employee_id: "60000000-0000-4000-8000-000000000002",
      },
      {
        id: "50000000-0000-4000-8000-000000000003",
        xero_employee_id: "60000000-0000-4000-8000-000000000003",
      },
    ];
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: people.map((person, index) => ({
          balance: 10 + index,
          employeeId: person.xero_employee_id,
          leaveTypeId: `annual-${index}`,
          leaveTypeName: "Annual Leave",
          rawPayload: { LeaveType: "Annual Leave" },
          unitType: "hours",
        })),
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances(input());
    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.personFindFirst).not.toHaveBeenCalled();
    expect(mocks.leaveBalanceUpsert).toHaveBeenCalledTimes(3);
  });
  it("records person_not_found when a balance has no scoped person", async () => {
    mocks.personFindMany.mockResolvedValue([]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [
          {
            balance: 12.5,
            employeeId: "60000000-0000-4000-8000-000000000009",
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
    expect(mocks.personFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.personFindFirst).not.toHaveBeenCalled();
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_code: "person_not_found",
          source_id: "annual-leave",
        }),
      })
    );
    expect(mocks.leaveBalanceUpsert).not.toHaveBeenCalled();
  });
  it("pages 40 people on the first page and advances cursor and stale_since", async () => {
    // 41 people available (page size 40 + 1 probe)
    const people = Array.from({ length: 41 }, (_, i) => ({
      id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      xero_employee_id: `emp_${i + 1}`,
    }));
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: people.slice(0, 40).map((p) => ({
          balance: 10,
          employeeId: p.xero_employee_id,
          leaveTypeId: "annual",
          leaveTypeName: "Annual Leave",
          rawPayload: {},
          unitType: "hours",
        })),
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    // Queries with take: 41, orderBy: { id: "asc" }
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: "asc" },
        take: 41,
        where: expect.objectContaining({
          archived_at: null,
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          xero_employee_id: { not: null },
        }),
      })
    );
    // Fetches balances only for 40 people
    expect(mocks.fetchLeaveBalancesForRegion).toHaveBeenCalledWith(
      "AU",
      expect.objectContaining({
        employeeIds: people.slice(0, 40).map((p) => p.xero_employee_id),
      })
    );
    // Roster continuation stored with 40th person's ID
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance_next_person_id: people[39]?.id },
        where: expect.objectContaining({
          balance_next_person_id: null,
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
    // Sets leave_balances_stale_since and updates last_leave_balances_sync_at
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          last_leave_balances_sync_at: expect.any(Date),
          leave_balances_stale_since: expect.any(Date),
        }),
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });
  it("pages a middle page and retains existing stale_since", async () => {
    const cursorPersonId = "50000000-0000-4000-8000-000000000040";
    const staleSince = new Date("2026-08-20T00:00:00Z");
    mockConnection({
      id: XERO_CONNECTION_ID,
      leave_balances_stale_since: staleSince,
      payroll_region: "AU",
      sync_paused_at: null,
    });
    const continuation = {
      balance_next_person_id: cursorPersonId,
    };
    mockConnection({
      balance_next_person_id: continuation.balance_next_person_id,
    });
    const people = Array.from({ length: 41 }, (_, i) => ({
      id: `50000000-0000-4000-8000-${String(i + 41).padStart(12, "0")}`,
      xero_employee_id: `emp_${i + 41}`,
    }));
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: { failures: [], leaveBalances: [], rawResponses: [] },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    // Queries with id > cursorPersonId
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: "asc" },
        take: 41,
        where: expect.objectContaining({
          id: { gt: cursorPersonId },
        }),
      })
    );
    // CAS cursor update
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance_next_person_id: people[39]?.id },
        where: expect.objectContaining({
          balance_next_person_id: cursorPersonId,
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
    // Retains stale_since (does not overwrite)
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          leave_balances_stale_since: null,
        }),
      })
    );
  });
  it("completes cycle on final page, clearing cursor and stale_since", async () => {
    const cursorPersonId = "50000000-0000-4000-8000-000000000080";
    const continuation = {
      balance_next_person_id: cursorPersonId,
    };
    mockConnection({
      balance_next_person_id: continuation.balance_next_person_id,
    });
    // Only 15 people follow (less than 40)
    const people = Array.from({ length: 15 }, (_, i) => ({
      id: `50000000-0000-4000-8000-${String(i + 81).padStart(12, "0")}`,
      xero_employee_id: `emp_${i + 81}`,
    }));
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: { failures: [], leaveBalances: [], rawResponses: [] },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    // Cursor cleared to null
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance_next_person_id: null },
        where: expect.objectContaining({
          balance_next_person_id: cursorPersonId,
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
    // stale_since cleared to null
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          last_leave_balances_sync_at: expect.any(Date),
          leave_balances_stale_since: null,
        }),
      })
    );
  });
  it("handles wraparound / zero people after cursor by clearing cursor and stale_since", async () => {
    const cursorPersonId = "50000000-0000-4000-8000-000000000099";
    const continuation = {
      balance_next_person_id: cursorPersonId,
    };
    mockConnection({
      balance_next_person_id: continuation.balance_next_person_id,
    });
    mocks.personFindMany.mockResolvedValue([]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: { failures: [], leaveBalances: [], rawResponses: [] },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance_next_person_id: null },
        where: expect.objectContaining({
          balance_next_person_id: cursorPersonId,
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leave_balances_stale_since: null,
        }),
      })
    );
  });
  it("cancels the run when cursor compare-and-swap update loses a race", async () => {
    const continuation = {
      balance_next_person_id: "50000000-0000-4000-8000-000000000040",
    };
    mockConnection({
      balance_next_person_id: continuation.balance_next_person_id,
    });
    // updateMany returns count: 0 simulating CAS loss
    mocks.xeroConnectionUpdateMany.mockImplementation(async ({ data }) => ({
      count: Object.hasOwn(data, "balance_next_person_id") ? 0 : 1,
    }));
    const people = Array.from({ length: 41 }, (_, i) => ({
      id: `50000000-0000-4000-8000-${String(i + 41).padStart(12, "0")}`,
      xero_employee_id: `emp_${i + 41}`,
    }));
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: { failures: [], leaveBalances: [], rawResponses: [] },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("cancelled");
    }
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: expect.stringContaining("compare-and-swap"),
          status: "cancelled",
        }),
        where: expect.objectContaining({
          id: RUN_ID,
        }),
      })
    );
  });
  it("does not advance cursor after a blanket failure", async () => {
    const continuation = {
      balance_next_person_id: null,
    };
    mockConnection({
      balance_next_person_id: continuation.balance_next_person_id,
    });
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      error: {
        code: "rate_limit_error",
        httpStatus: 429,
        message: "Rate limit exceeded",
        recoveryReason: "retry_later",
      },
      ok: false,
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
    }
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expectRosterUnchanged();
  });
  it("fails and retries a per-employee operational incident without advancing canonical progress", async () => {
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [
          {
            employeeId: "emp_1",
            error: {
              code: "unknown_error",
              message: "Admission unavailable",
              recoveryReason: "operational_incident",
            },
          },
        ],
        leaveBalances: [],
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances(input());
    expect(result.ok).toBe(false);
    const { rejectRetryableSyncResult } = await import("./xero-sync-access");
    await expect(
      rejectRetryableSyncResult(Promise.resolve(result))
    ).rejects.toThrow();
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: "operational_incident",
          status: "failed",
        }),
      })
    );
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
    expectRosterUnchanged();
    expect(mocks.xeroConnectionUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          last_leave_balances_sync_at: expect.any(Date),
        }),
      })
    );
    expect(mocks.leaveBalanceUpsert).not.toHaveBeenCalled();
  });
  it("advances cursor after recorded employee-specific failures", async () => {
    const people = Array.from({ length: 41 }, (_, i) => ({
      id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      xero_employee_id: `emp_${i + 1}`,
    }));
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [
          {
            employeeId: "emp_1",
            error: { code: "not_found", httpStatus: 404, message: "Not found" },
          },
        ],
        leaveBalances: [],
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("partial_success");
      expect(result.value.failed).toBe(1);
    }
    // Failed record is recorded before advancing cursor
    expect(mocks.failedRecordCreate).toHaveBeenCalled();
    expect(
      mocks.xeroConnectionUpdateMany.mock.calls.filter(([call]) =>
        Object.hasOwn(call.data, "balance_next_person_id")
      )
    ).toHaveLength(1);
  });
  it("targeted person refresh bypasses shared cursor and does not alter tenant cycle timestamps", async () => {
    const personId = "50000000-0000-4000-8000-000000000099";
    const employeeId = "60000000-0000-4000-8000-000000000099";
    mocks.personFindMany.mockResolvedValue([
      { id: personId, xero_employee_id: employeeId },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [
          {
            balance: 20,
            currencyCode: null,
            employeeId,
            leaveTypeId: "annual",
            leaveTypeName: "Annual Leave",
            rawPayload: {},
            unitType: "hours",
          },
        ],
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      personId,
      triggerType: "manual",
    });
    expect(result.ok).toBe(true);
    expect(mocks.xeroSyncCursorFindFirst).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
    expectRosterUnchanged();
    expect(mocks.xeroConnectionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.leaveBalanceUpsert).toHaveBeenCalled();
  });
  it("syncs NZ balance page with 40 people, NZD currency balances, and advances cursor", async () => {
    mockConnection({
      id: XERO_CONNECTION_ID,
      payroll_region: "NZ",
      sync_paused_at: null,
    });
    const people = Array.from({ length: 41 }, (_, i) => ({
      id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      xero_employee_id: `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    }));
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: people.slice(0, 40).flatMap((p) => [
          {
            balance: 80,
            currencyCode: null,
            employeeId: p.xero_employee_id,
            leaveTypeId: "annual",
            leaveTypeName: "Annual Leave",
            rawPayload: { LeaveType: "Annual" },
            unitType: "hours",
          },
          {
            balance: 1500.5,
            currencyCode: "NZD",
            employeeId: p.xero_employee_id,
            leaveTypeId: "holiday-pay",
            leaveTypeName: "Holiday Pay",
            rawPayload: { TypeOfUnits: "Dollars" },
            unitType: "currency",
          },
        ]),
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
      expect(result.value.fetched).toBe(80);
      expect(result.value.upserted).toBe(80);
    }
    expect(mocks.fetchLeaveBalancesForRegion).toHaveBeenCalledWith(
      "NZ",
      expect.objectContaining({
        employeeIds: people.slice(0, 40).map((p) => p.xero_employee_id),
      })
    );
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance_next_person_id: people[39]?.id },
        where: expect.objectContaining({
          balance_next_person_id: null,
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });
  it("syncs UK balance page with 40 people, hour and day units, null currency code, and advances cursor", async () => {
    mockConnection({
      id: XERO_CONNECTION_ID,
      payroll_region: "UK",
      sync_paused_at: null,
    });
    const people = Array.from({ length: 41 }, (_, i) => ({
      id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      xero_employee_id: `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    }));
    mocks.personFindMany.mockResolvedValue(people);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: people.slice(0, 40).flatMap((p) => [
          {
            balance: 37.5,
            currencyCode: null,
            employeeId: p.xero_employee_id,
            leaveTypeId: "holiday",
            leaveTypeName: "Holiday",
            rawPayload: { UnitType: "Hours" },
            unitType: "hours",
          },
          {
            balance: 5,
            currencyCode: null,
            employeeId: p.xero_employee_id,
            leaveTypeId: "maternity",
            leaveTypeName: "Maternity",
            rawPayload: { UnitType: "Days" },
            unitType: "days",
          },
        ]),
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
      expect(result.value.fetched).toBe(80);
      expect(result.value.upserted).toBe(80);
    }
    expect(mocks.fetchLeaveBalancesForRegion).toHaveBeenCalledWith(
      "UK",
      expect.objectContaining({
        employeeIds: people.slice(0, 40).map((p) => p.xero_employee_id),
      })
    );
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance_next_person_id: people[39]?.id },
        where: expect.objectContaining({
          balance_next_person_id: null,
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });
  it("does not advance cursor after a blanket 403 permission error for regional tenant", async () => {
    mockConnection({
      id: XERO_CONNECTION_ID,
      payroll_region: "UK",
      sync_paused_at: null,
    });
    mocks.personFindMany.mockResolvedValue([
      { id: "50000000-0000-4000-8000-000000000001", xero_employee_id: "emp_1" },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      error: {
        code: "permission_error",
        httpStatus: 403,
        message: "Forbidden",
        recoveryReason: "access_denied",
      },
      ok: false,
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
    }
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expectRosterUnchanged();
  });
  it("does not advance cursor after a blanket network error", async () => {
    mockConnection({
      id: XERO_CONNECTION_ID,
      payroll_region: "NZ",
      sync_paused_at: null,
    });
    mocks.personFindMany.mockResolvedValue([
      { id: "50000000-0000-4000-8000-000000000001", xero_employee_id: "emp_1" },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      error: {
        code: "network_error",
        message: "Network failure",
        recoveryReason: "retry_later",
      },
      ok: false,
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
    }
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expectRosterUnchanged();
  });
  it("advances cursor once for an employee who has multiple balance records", async () => {
    const employeeId = "60000000-0000-4000-8000-000000000001";
    const personId = "50000000-0000-4000-8000-000000000001";
    mocks.personFindMany.mockResolvedValue([
      { id: personId, xero_employee_id: employeeId },
    ]);
    mocks.fetchLeaveBalancesForRegion.mockResolvedValue({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [
          {
            balance: 80,
            currencyCode: null,
            employeeId,
            leaveTypeId: "annual",
            leaveTypeName: "Annual Leave",
            rawPayload: {},
            unitType: "hours",
          },
          {
            balance: 40,
            currencyCode: null,
            employeeId,
            leaveTypeId: "sick",
            leaveTypeName: "Sick Leave",
            rawPayload: {},
            unitType: "hours",
          },
          {
            balance: 1200,
            currencyCode: "NZD",
            employeeId,
            leaveTypeId: "holiday-pay",
            leaveTypeName: "Holiday Pay",
            rawPayload: {},
            unitType: "currency",
          },
        ],
        rawResponses: [],
      },
    });
    const result = await syncXeroLeaveBalances({
      ...input(),
      triggerType: "scheduled",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
      expect(result.value.fetched).toBe(3);
      expect(result.value.upserted).toBe(3);
    }
    expect(mocks.leaveBalanceUpsert).toHaveBeenCalledTimes(3);
    // Even with 3 balances for 1 person on a 1-person final page, cursor is updated to null (isLastPage)
    expect(mocks.xeroConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance_next_person_id: null },
        where: expect.objectContaining({
          balance_next_person_id: null,
          clerk_org_id: CLERK_ORG_ID,
          id: XERO_CONNECTION_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });
});
