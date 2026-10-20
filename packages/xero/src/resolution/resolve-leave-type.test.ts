import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  leaveBalanceFindFirst: vi.fn(),
  personFindFirst: vi.fn(),
}));
const tenantTestState = vi.hoisted(() => ({ client: null as object | null }));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) => {
      if (!tenantTestState.client) {
        throw new Error("Missing fixture delegates");
      }
      return await executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...tenantTestState.client,
      });
    },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", async () => {
  const actualTenantCore = await vi.importActual<
    typeof import("../../../database/src/tenant-db")
  >("../../../database/src/tenant-db");

  const exports = {
    database: {
      leaveBalance: { findFirst: mocks.leaveBalanceFindFirst },
      person: { findFirst: mocks.personFindFirst },
    },
  };
  tenantTestState.client = exports.database;
  return {
    ...exports,
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,

    ...actualTenantCore,
  };
});
const { resolveXeroLeaveTypeId } = await import("./resolve-leave-type");
const xeroConnection = {
  accessToken: "access-token",
  clerk_org_id: "org_1",
  deadline: { expiresAtMs: Date.now() + 120_000 },
  id: "tenant_1",
  organisation_id: "00000000-0000-4000-8000-000000000001",
  payroll_region: "AU" as const,
  xero_tenant_id: "xero-tenant-1",
};
describe("resolveXeroLeaveTypeId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindFirst.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000011",
    });
  });
  it("returns the mapped Xero leave type ID", async () => {
    mocks.leaveBalanceFindFirst.mockResolvedValue({
      leave_type_xero_id: "leave-type-1",
    });
    const result = await withTestTenantResult(
      tenantTestAccount({
        personId: "00000000-0000-4000-8000-000000000011",
        recordType: "annual_leave",
        xeroConnection,
      }),
      (db) =>
        resolveXeroLeaveTypeId(
          {
            personId: "00000000-0000-4000-8000-000000000011",
            recordType: "annual_leave",
            xeroConnection,
          },
          db
        )
    );
    expect(result).toEqual({ ok: true, value: "leave-type-1" });
  });
  it("returns missing_mapping when no balance mapping exists", async () => {
    mocks.leaveBalanceFindFirst.mockResolvedValue(null);
    const result = await withTestTenantResult(
      tenantTestAccount({
        personId: "00000000-0000-4000-8000-000000000011",
        recordType: "annual_leave",
        xeroConnection,
      }),
      (db) =>
        resolveXeroLeaveTypeId(
          {
            personId: "00000000-0000-4000-8000-000000000011",
            recordType: "annual_leave",
            xeroConnection,
          },
          db
        )
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("missing_mapping");
    }
  });
  it("rejects cross-tenant people", async () => {
    mocks.personFindFirst.mockResolvedValue(null);
    const result = await withTestTenantResult(
      tenantTestAccount({
        personId: "00000000-0000-4000-8000-000000000011",
        recordType: "annual_leave",
        xeroConnection,
      }),
      (db) =>
        resolveXeroLeaveTypeId(
          {
            personId: "00000000-0000-4000-8000-000000000011",
            recordType: "annual_leave",
            xeroConnection,
          },
          db
        )
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("person_not_in_tenant");
    }
  });
});
