import { Prisma } from "@repo/database/generated/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  leaveBalanceCreate: vi.fn(),
  leaveBalanceFindFirst: vi.fn(),
  leaveBalanceUpdateMany: vi.fn(),
  personFindFirst: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  scopedQuery: mocks.scopedQuery,
  tenantDatabase: vi.fn((accountId: string) => {
    if (!accountId) {
      throw new Error("Missing tenant context");
    }
    return {
      auditEvent: {
        create: mocks.auditCreate,
      },
      leaveBalance: {
        create: mocks.leaveBalanceCreate,
        findFirst: mocks.leaveBalanceFindFirst,
        updateMany: mocks.leaveBalanceUpdateMany,
      },
      person: {
        findFirst: mocks.personFindFirst,
      },
    };
  }),
  tenantTransaction: vi.fn(
    (accountId: string, transactionCallback: unknown, options?: unknown) => {
      if (!accountId) {
        throw new Error("Missing tenant context");
      }
      return {
        auditEvent: {
          create: mocks.auditCreate,
        },
        leaveBalance: {
          create: mocks.leaveBalanceCreate,
          findFirst: mocks.leaveBalanceFindFirst,
          updateMany: mocks.leaveBalanceUpdateMany,
        },
        person: {
          findFirst: mocks.personFindFirst,
        },
      }.$transaction(transactionCallback, options);
    }
  ),
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
const { setManualLeaveBalance } = await import("./manual-balance-service");
const input = {
  actingRole: "admin" as const,
  actingUserId: "user_1",
  balance: 76,
  balanceUnit: "hours" as const,
  clerkOrgId: "org_1",
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
    mocks.leaveBalanceCreate.mockResolvedValue({ id: "balance_1" });
    mocks.leaveBalanceFindFirst.mockResolvedValue(null);
    mocks.leaveBalanceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.personFindFirst.mockResolvedValue({ id: input.personId });
  });
  it("cannot fall back to manual balances when the state lookup is unavailable", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    const result = await setManualLeaveBalance(input);
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
    const result = await setManualLeaveBalance(input);
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
    const result = await setManualLeaveBalance(input);
    expect(result).toEqual({ ok: true, value: { id: "balance_1" } });
    expect(mocks.leaveBalanceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        balance: "76.0000",
        clerk_org_id: input.clerkOrgId,
        currency_code: null,
        leave_type_xero_id: input.leaveTypeXeroId,
        organisation_id: input.organisationId,
        person_id: input.personId,
        source_payload_json: Prisma.DbNull,
        xero_connection_id: null,
      }),
      select: { id: true },
    });
  });
  it("updates the existing manual row by person and leave type", async () => {
    mocks.leaveBalanceFindFirst.mockResolvedValue({ id: "balance_existing" });
    const result = await setManualLeaveBalance(input);
    expect(result).toEqual({
      ok: true,
      value: { id: "balance_existing" },
    });
    expect(mocks.leaveBalanceFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        clerk_org_id: input.clerkOrgId,
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
        clerk_org_id: input.clerkOrgId,
        id: "balance_existing",
        organisation_id: input.organisationId,
      },
    });
  });
  it("rejects a currency balance unit; manual balances are hours/days only", async () => {
    const result = await setManualLeaveBalance({
      ...input,
      balanceUnit: "currency",
    });
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
