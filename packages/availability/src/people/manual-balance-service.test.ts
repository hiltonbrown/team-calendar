import { Prisma } from "@repo/database/generated/client";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  leaveBalanceCreate: vi.fn(),
  leaveBalanceFindFirst: vi.fn(),
  leaveBalanceUpdateMany: vi.fn(),
  personFindFirst: vi.fn(),
  scopedQuery: vi.fn((accountId: string, organisationId: string) => ({
    account_id: accountId,
    organisation_id: organisationId,
  })),
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

  scopedQuery: mocks.scopedQuery,
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      auditEvent: {
        create: mocks.auditCreate,
      },
      leaveBalance: {
        createMany: mocks.leaveBalanceCreate,
        findFirst: mocks.leaveBalanceFindFirst,
        updateMany: mocks.leaveBalanceUpdateMany,
      },
      person: {
        findFirst: mocks.personFindFirst,
      },
    },
  };
}
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
const { setManualLeaveBalance } = await import("./manual-balance-service");
const input = {
  accountId: "org_1",
  actingRole: "admin" as const,
  actingUserId: "user_1",
  balance: 76,
  balanceUnit: "hours" as const,
  leaveTypeName: "Annual Leave",
  leaveTypeXeroId: "annual",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000002",
};
describe("manual balance service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditCreate.mockResolvedValue({});
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    mocks.leaveBalanceCreate.mockResolvedValue({ count: 1 });
    mocks.leaveBalanceFindFirst.mockResolvedValue(null);
    mocks.leaveBalanceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.personFindFirst.mockResolvedValue({ id: input.personId });
  });
  it("cannot fall back to manual balances when the state lookup is unavailable", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      setManualLeaveBalance(input, db)
    );
    expect(result).toMatchObject({
      error: {
        message:
          "We cannot reach Xero right now. Try again later or contact support.",
      },
      ok: false,
    });
    expect(mocks.leaveBalanceCreate).not.toHaveBeenCalled();
    expect(mocks.leaveBalanceUpdateMany).not.toHaveBeenCalled();
  });
  it("blocks manual edits while Xero is connected", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      setManualLeaveBalance(input, db)
    );
    expect(result).toEqual({
      error: {
        code: "xero_connected",
        message:
          "Manual balances can only be edited when Xero is disconnected.",
      },
      ok: false,
    });
    expect(mocks.leaveBalanceCreate).not.toHaveBeenCalled();
  });
  it("creates a scoped manual balance while Xero is disconnected", async () => {
    mocks.leaveBalanceFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "balance_1" });
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      setManualLeaveBalance(input, db)
    );
    expect(result).toEqual({ ok: true, value: { id: "balance_1" } });
    expect(mocks.leaveBalanceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        account_id: input.accountId,
        balance: "76.0000",
        currency_code: null,
        leave_type_xero_id: input.leaveTypeXeroId,
        organisation_id: input.organisationId,
        person_id: input.personId,
        source_payload_json: Prisma.DbNull,
        xero_connection_id: null,
      }),
      skipDuplicates: true,
    });
  });
  it("updates the existing manual row by person and leave type", async () => {
    mocks.leaveBalanceFindFirst.mockResolvedValue({ id: "balance_existing" });
    const result = await withTestTenantResult(tenantTestAccount(input), (db) =>
      setManualLeaveBalance(input, db)
    );
    expect(result).toEqual({
      ok: true,
      value: { id: "balance_existing" },
    });
    expect(mocks.leaveBalanceFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        account_id: input.accountId,
        leave_type_xero_id: input.leaveTypeXeroId,
        organisation_id: input.organisationId,
        person_id: input.personId,
        xero_connection_id: null,
      },
    });
    expect(mocks.leaveBalanceUpdateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        balance: "76.0000",
        currency_code: null,
        source_payload_json: Prisma.DbNull,
      }),
      where: {
        account_id: input.accountId,
        id: "balance_existing",
        organisation_id: input.organisationId,
      },
    });
  });
  it("rejects a currency balance unit; manual balances are hours/days only", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...input,
        balanceUnit: "currency",
      }),
      (db) =>
        setManualLeaveBalance(
          {
            ...input,
            balanceUnit: "currency",
          },
          db
        )
    );
    expect(result).toEqual({
      error: {
        code: "validation_error",
        message: expect.any(String),
      },
      ok: false,
    });
    expect(mocks.leaveBalanceCreate).not.toHaveBeenCalled();
    expect(mocks.leaveBalanceUpdateMany).not.toHaveBeenCalled();
  });
});
