import { beforeEach, describe, expect, it, vi } from "vitest";
import type { XeroTenantForWrite, XeroWriteError } from "../write/types";

const mocks = vi.hoisted(() => ({
  approveLeaveApplicationForRegion: vi.fn(),
  declineLeaveApplicationForRegion: vi.fn(),
  ensureFreshXeroConnection: vi.fn(),
  metricLog: vi.fn(),
  resolveXeroAccess: vi.fn(),
  submitLeaveApplicationForRegion: vi.fn(),
  tenantFindFirst: vi.fn(),
  withdrawLeaveApplicationForRegion: vi.fn(),
}));

vi.mock("@repo/observability/log", () => ({ log: { info: mocks.metricLog } }));
beforeEach(() => {
  mocks.metricLog.mockReset();
});

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

vi.mock("../oauth/credential-owner", () => ({
  resolveXeroAccess: mocks.resolveXeroAccess,
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
    accessToken: "access-token",
    bindingGeneration: 1,
    clerk_org_id: "org_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id,
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: "AU",
    tokenVersion: 1,
    xero_connection_id: "connection-1",
    xero_tenant_id: "xero-tenant-1",
  };
}

describe("XeroWriteAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveXeroAccess.mockResolvedValue({
      ok: true,
      value: {
        accessToken: "access-token",
        bindingGeneration: 1,
        deadline: { expiresAtMs: Date.now() + 120_000 },
        payrollRegion: "AU",
        tokenVersion: 1,
        xeroTenantDatabaseId: "tenant-1",
        xeroTenantId: "xero-tenant-1",
      },
    });
  });

  it("returns auth_error when submit cannot find a connected Xero tenant", async () => {
    mocks.resolveXeroAccess.mockResolvedValueOnce({
      error: { code: "not_connected", message: "Xero is not connected." },
      ok: false,
    });

    const result = await XeroWriteAdapter.submitLeaveApplication(submitInput);

    expect(result).toEqual({
      error: {
        certainty: "definitive_failure",
        code: "auth_error",
        dispatchPhase: "before_dispatch",
        message: "Xero is not connected.",
        recoveryReason: "not_connected",
        retryAfterMs: undefined,
        userMessage: "Xero is not connected.",
      },
      ok: false,
    });
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("returns auth_error when approve cannot find a connected Xero tenant", async () => {
    mocks.resolveXeroAccess.mockResolvedValueOnce({
      error: { code: "not_connected", message: "Xero is not connected." },
      ok: false,
    });

    const result = await XeroWriteAdapter.approveLeaveApplication(approveInput);

    expect(result).toEqual({
      error: {
        certainty: "definitive_failure",
        code: "auth_error",
        dispatchPhase: "before_dispatch",
        message: "Xero is not connected.",
        recoveryReason: "not_connected",
        retryAfterMs: undefined,
        userMessage: "Xero is not connected.",
      },
      ok: false,
    });
    expect(mocks.approveLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("uses resolved access and the operation capability without selecting credentials", async () => {
    mocks.submitLeaveApplicationForRegion.mockResolvedValueOnce({
      ok: true,
      value: { rawResponse: {}, xeroLeaveApplicationId: "remote" },
    });
    expect(
      (await XeroWriteAdapter.submitLeaveApplication(submitInput)).ok
    ).toBe(true);
    expect(mocks.resolveXeroAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "payroll.employees",
        clerkOrgId: submitInput.clerkOrgId,
        deadline: expect.objectContaining({ expiresAtMs: expect.any(Number) }),
        organisationId: submitInput.organisationId,
      })
    );
    expect(mocks.tenantFindFirst).not.toHaveBeenCalled();
    expect(mocks.submitLeaveApplicationForRegion).toHaveBeenCalledWith(
      "AU",
      expect.objectContaining({
        xeroTenant: expect.objectContaining({
          accessToken: "access-token",
          bindingGeneration: 1,
        }),
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
      error: xeroError,
      ok: false,
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
      error: xeroError,
      ok: false,
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

describe("161g recovery regression", () => {
  it.each([
    ["admission_unavailable", "operational_incident"],
    ["configuration_error", "operational_incident"],
    ["capability_missing", "update_permissions"],
  ])(
    "preserves %s rather than reporting not connected",
    async (code, recoveryReason) => {
      mocks.tenantFindFirst.mockResolvedValue(buildTenant("tenant-1"));
      mocks.ensureFreshXeroConnection.mockResolvedValue({
        error: { code, message: "safe failure" },
        ok: false,
      });
      mocks.resolveXeroAccess.mockResolvedValue({
        error: { code, message: "safe failure" },
        ok: false,
      });
      const result = await XeroWriteAdapter.submitLeaveApplication(submitInput);
      expect(result).toMatchObject({ error: { recoveryReason }, ok: false });
      if (recoveryReason === "update_permissions") {
        expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
          "Xero lifecycle metric",
          {
            metric: "xero.binding.permission_required",
            reason: "update_permissions",
            value: 1,
          }
        );
      } else {
        expect(mocks.metricLog).not.toHaveBeenCalled();
      }
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    }
  );
});

describe("safe neutral resolution failures", () => {
  it.each(["resolveEmployeeId", "resolveLeaveTypeId"] as const)(
    "returns safe recovery copy from %s without diagnostics",
    async (method) => {
      mocks.resolveXeroAccess.mockResolvedValue({
        error: {
          code: "configuration_error",
          message: "Sensitive transport diagnostic",
          retryAfterMs: 5000,
        },
        ok: false,
      });
      const input = {
        clerkOrgId: submitInput.clerkOrgId,
        organisationId: submitInput.organisationId,
        personId: "person-1",
        recordType: "annual_leave",
      };
      const result = await XeroWriteAdapter[method](input);
      expect(result).toEqual({
        error: {
          code: "unknown_error",
          message:
            "We cannot reach Xero right now. Try again later or contact support.",
          recoveryReason: "operational_incident",
          retryAfterMs: 5000,
        },
        ok: false,
      });
      if (result.ok) {
        throw new Error("Resolution unexpectedly succeeded");
      }
      expect(result.error.message).not.toContain("Sensitive");
      expect(result.error).not.toHaveProperty("rawPayload");
      expect(result.error).not.toHaveProperty("dispatchPhase");
      expect(result.error).not.toHaveProperty("certainty");
      expect(result.error).not.toHaveProperty("correlationId");
    }
  );
});

describe("permission metric outcome safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("retains a definite pre-dispatch permissions failure when metric logging throws", async () => {
    mocks.metricLog.mockImplementation(() => {
      throw new Error("telemetry unavailable");
    });
    mocks.resolveXeroAccess.mockResolvedValue({
      error: { code: "capability_missing", message: "missing permission" },
      ok: false,
    });
    const result = await XeroWriteAdapter.submitLeaveApplication(submitInput);
    expect(result).toMatchObject({
      error: {
        certainty: "definitive_failure",
        dispatchPhase: "before_dispatch",
        recoveryReason: "update_permissions",
      },
      ok: false,
    });
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
      "Xero lifecycle metric",
      {
        metric: "xero.binding.permission_required",
        reason: "update_permissions",
        value: 1,
      }
    );
  });
  it("records returned permission errors without copying provider diagnostics into metric labels", async () => {
    mocks.resolveXeroAccess.mockResolvedValue({
      ok: true,
      value: {
        accessToken: "synthetic-access",
        bindingGeneration: 1,
        deadline: { expiresAtMs: Date.now() + 120_000 },
        payrollRegion: "AU",
        tokenVersion: 1,
        xeroTenantDatabaseId: "tenant",
        xeroTenantId: "external-tenant",
      },
    });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      error: {
        code: "permission_error",
        dispatchPhase: "provider_response_received",
        httpStatus: 403,
        message: "private provider diagnostic",
        rawPayload: { secret: "private payload" },
        recoveryReason: "update_permissions",
      },
      ok: false,
    });
    expect(
      await XeroWriteAdapter.approveLeaveApplication(approveInput)
    ).toMatchObject({
      error: {
        certainty: "definitive_failure",
        recoveryReason: "update_permissions",
      },
      ok: false,
    });
    expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
      "Xero lifecycle metric",
      {
        metric: "xero.binding.permission_required",
        reason: "update_permissions",
        value: 1,
      }
    );
  });
});

// These tests isolate provider behaviour; runtime fencing is tested in the database protocol suite.
vi.mock("@repo/database/xero-campaign-access", () => ({
  withXeroCampaignCredentialScope: (
    _scope: unknown,
    _tenant: string,
    operation: () => Promise<unknown>
  ) => operation(),
  withXeroCampaignProviderEffect: (
    _target: unknown,
    operation: () => Promise<unknown>
  ) => operation(),
}));
