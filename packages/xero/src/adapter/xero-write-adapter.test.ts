import { beforeEach, describe, expect, it, vi } from "vitest";
import type { XeroTenantForWrite, XeroWriteError } from "../write/types";

const mocks = vi.hoisted(() => ({
  approveLeaveApplicationForRegion: vi.fn(),
  declineLeaveApplicationForRegion: vi.fn(),
  ensureFreshXeroConnection: vi.fn(),
  submitLeaveApplicationForRegion: vi.fn(),
  tenantFindFirst: vi.fn(),
  withdrawLeaveApplicationForRegion: vi.fn(),
}));

vi.mock("@repo/database", () => ({
  database: {
    xeroTenant: {
      findFirst: mocks.tenantFindFirst,
    },
  },
}));

vi.mock("../oauth/service", () => ({
  ensureFreshXeroConnection: mocks.ensureFreshXeroConnection,
}));

vi.mock("../write/dispatch", () => ({
  approveLeaveApplicationForRegion: mocks.approveLeaveApplicationForRegion,
  declineLeaveApplicationForRegion: mocks.declineLeaveApplicationForRegion,
  submitLeaveApplicationForRegion: mocks.submitLeaveApplicationForRegion,
  withdrawLeaveApplicationForRegion: mocks.withdrawLeaveApplicationForRegion,
}));

const { XeroWriteAdapter } = await import("./xero-write-adapter");
const { toPlainLanguageMessage } = await import("../write/types");

const submitInput = {
  clerkOrgId: "org_1",
  employeeId: "employee-1",
  endsAt: new Date("2026-05-05T00:00:00.000Z"),
  leaveTypeId: "leave-type-1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  startsAt: new Date("2026-05-04T00:00:00.000Z"),
  title: "Annual leave",
  units: 7.6,
};

const approveInput = {
  clerkOrgId: "org_1",
  employeeId: "employee-1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  remoteId: "leave-application-1",
};

function buildTenant(id: string): XeroTenantForWrite & {
  xero_connection_id: string;
} {
  return {
    clerk_org_id: "org_1",
    id,
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: "AU",
    xero_connection: {
      access_token_auth_tag: "auth-tag",
      access_token_encrypted: "encrypted-token",
      access_token_iv: "iv",
      revoked_at: null,
    },
    xero_connection_id: "connection-1",
    xero_tenant_id: "xero-tenant-1",
  };
}

describe("XeroWriteAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
  });

  it("returns auth_error when submit cannot find a connected Xero tenant", async () => {
    mocks.tenantFindFirst.mockResolvedValueOnce(null);

    const result = await XeroWriteAdapter.submitLeaveApplication(submitInput);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "auth_error",
        message: "Xero is not connected.",
        userMessage: "Xero is not connected.",
      },
    });
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("returns auth_error when approve cannot find a connected Xero tenant", async () => {
    mocks.tenantFindFirst.mockResolvedValueOnce(null);

    const result = await XeroWriteAdapter.approveLeaveApplication(approveInput);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "auth_error",
        message: "Xero is not connected.",
        userMessage: "Xero is not connected.",
      },
    });
    expect(mocks.approveLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("reloads the tenant after a proactive refresh before submitting leave", async () => {
    const staleTenant = buildTenant("tenant-stale");
    const freshTenant = buildTenant("tenant-fresh");
    mocks.tenantFindFirst
      .mockResolvedValueOnce(staleTenant)
      .mockResolvedValueOnce(freshTenant);
    mocks.ensureFreshXeroConnection.mockResolvedValueOnce({
      ok: true,
      value: { refreshed: true },
    });
    mocks.submitLeaveApplicationForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        rawResponse: { LeaveApplications: [] },
        xeroLeaveApplicationId: "leave-application-1",
      },
    });

    const result = await XeroWriteAdapter.submitLeaveApplication(submitInput);

    expect(result).toEqual({
      ok: true,
      value: {
        rawResponse: { LeaveApplications: [] },
        remoteId: "leave-application-1",
      },
    });
    expect(mocks.tenantFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.ensureFreshXeroConnection).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      connectionId: "connection-1",
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(mocks.submitLeaveApplicationForRegion).toHaveBeenCalledWith(
      "AU",
      expect.objectContaining({
        xeroTenant: freshTenant,
      })
    );
  });

  it("translates submit errors into plain-language user messages without raw Xero details", async () => {
    const tenant = buildTenant("tenant-1");
    const xeroError: XeroWriteError = {
      code: "validation_error",
      correlationId: "xero-correlation-1",
      httpStatus: 400,
      message: "Xero raw validation failure CODE_XERO_42",
      rawPayload: {
        ErrorNumber: 42,
        Message: "PayrollCalendarID is invalid",
      },
    };
    mocks.tenantFindFirst.mockResolvedValueOnce(tenant);
    mocks.submitLeaveApplicationForRegion.mockResolvedValueOnce({
      ok: false,
      error: xeroError,
    });

    const result = await XeroWriteAdapter.submitLeaveApplication(submitInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe(toPlainLanguageMessage(xeroError));
      expect(result.error.userMessage).not.toContain("CODE_XERO_42");
      expect(result.error.userMessage).not.toContain("PayrollCalendarID");
      expect(result.error.userMessage).not.toContain("400");
      expect(result.error.correlationId).toBe("xero-correlation-1");
      expect(result.error.rawPayload).toEqual(xeroError.rawPayload);
    }
  });

  it("translates approve errors into plain-language user messages without raw Xero details", async () => {
    const tenant = buildTenant("tenant-1");
    const xeroError: XeroWriteError = {
      code: "conflict_error",
      correlationId: "xero-correlation-2",
      httpStatus: 409,
      message: "Xero conflict failure CODE_XERO_99",
      rawPayload: {
        Message: "The leave request overlaps another leave request",
      },
    };
    mocks.tenantFindFirst.mockResolvedValueOnce(tenant);
    mocks.approveLeaveApplicationForRegion.mockResolvedValueOnce({
      ok: false,
      error: xeroError,
    });

    const result = await XeroWriteAdapter.approveLeaveApplication(approveInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe(toPlainLanguageMessage(xeroError));
      expect(result.error.userMessage).not.toContain("CODE_XERO_99");
      expect(result.error.userMessage).not.toContain("overlaps another");
      expect(result.error.userMessage).not.toContain("409");
      expect(result.error.correlationId).toBe("xero-correlation-2");
      expect(result.error.rawPayload).toEqual(xeroError.rawPayload);
    }
  });
});
