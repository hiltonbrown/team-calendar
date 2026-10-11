import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  leaveBalanceFindFirst: vi.fn(),
  personFindFirst: vi.fn(),
}));
vi.mock("@repo/database", () => {
  const exports = {
    database: {
      leaveBalance: { findFirst: mocks.leaveBalanceFindFirst },
      person: { findFirst: mocks.personFindFirst },
    },
  };
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
    tenantDatabase: vi.fn(() => exports.database),
    tenantTransaction: vi.fn((_clerkOrgId, callback) =>
      "$transaction" in exports.database
        ? exports.database.$transaction(callback)
        : callback(exports.database)
    ),
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
    const result = await resolveXeroLeaveTypeId({
      personId: "00000000-0000-4000-8000-000000000011",
      recordType: "annual_leave",
      xeroConnection,
    });
    expect(result).toEqual({ ok: true, value: "leave-type-1" });
  });
  it("returns missing_mapping when no balance mapping exists", async () => {
    mocks.leaveBalanceFindFirst.mockResolvedValue(null);
    const result = await resolveXeroLeaveTypeId({
      personId: "00000000-0000-4000-8000-000000000011",
      recordType: "annual_leave",
      xeroConnection,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("missing_mapping");
    }
  });
  it("rejects cross-tenant people", async () => {
    mocks.personFindFirst.mockResolvedValue(null);
    const result = await resolveXeroLeaveTypeId({
      personId: "00000000-0000-4000-8000-000000000011",
      recordType: "annual_leave",
      xeroConnection,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("person_not_in_tenant");
    }
  });
});
