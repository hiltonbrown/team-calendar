import { randomUUID } from "node:crypto";
import type { PrepareLeaveMutationInput } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareAuLeaveMutation } from "../au/write";
import type { XeroAccessContext, XeroWriteError } from "../write/types";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  approveLeaveApplicationForRegion: vi.fn(),
  declineLeaveApplicationForRegion: vi.fn(),
  fetchLeaveForEmployeeForRegion: vi.fn(),
  fetchLeaveRecordsForRegion: vi.fn(),
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
    xeroConnection: {
      findFirst: mocks.tenantFindFirst,
    },
  },
}));
vi.mock("../oauth/authorisation", () => ({
  resolveXeroAccess: mocks.resolveXeroAccess,
}));
vi.mock("../write/dispatch", () => ({
  approveLeaveApplicationForRegion: mocks.approveLeaveApplicationForRegion,
  declineLeaveApplicationForRegion: mocks.declineLeaveApplicationForRegion,
  submitLeaveApplicationForRegion: mocks.submitLeaveApplicationForRegion,
  withdrawLeaveApplicationForRegion: mocks.withdrawLeaveApplicationForRegion,
}));
vi.mock("../read/dispatch", () => ({
  fetchLeaveForEmployeeForRegion: mocks.fetchLeaveForEmployeeForRegion,
  fetchLeaveRecordsForRegion: mocks.fetchLeaveRecordsForRegion,
}));
const { XeroWriteAdapter } = await import("./xero-write-adapter");
const { toPlainLanguageMessage } = await import("../write/types");
const submitInput = withPortMutation("create", {
  clerkOrgId: "org_1",
  employeeId: "employee-1",
  endsAt: new Date("2026-05-05T00:00:00.000Z"),
  leaveTypeId: "leave-type-1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  startsAt: new Date("2026-05-04T00:00:00.000Z"),
  title: "Annual leave",
  units: 7.6,
});
const approveInput = withPortMutation("approve", {
  clerkOrgId: "org_1",
  employeeId: "employee-1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  remoteId: "leave-application-1",
});
function buildTenant(id: string): XeroAccessContext & {
  xero_connection_id: string;
} {
  return {
    accessToken: "access-token",
    clerk_org_id: "org_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id,
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: "AU",
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
        connectionId: "tenant-1",
        deadline: { expiresAtMs: Date.now() + 120_000 },
        payrollRegion: "AU",
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
        xeroConnection: expect.objectContaining({
          accessToken: "access-token",
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
        connectionId: "tenant",
        deadline: { expiresAtMs: Date.now() + 120_000 },
        payrollRegion: "AU",
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

describe("mutation request preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveXeroAccess.mockResolvedValue({
      ok: true,
      value: {
        accessToken: "access-token",
        connectionId: "connection-1",
        deadline: { expiresAtMs: Date.now() + 120_000 },
        payrollRegion: "AU",
        xeroTenantId: "xero-tenant-1",
      },
    });
  });
  it("prepares exact AU date-only array bytes without a provider mutation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(
        await XeroWriteAdapter.prepareLeaveMutation({
          ...submitInput,
          action: "create",
        })
      ).toEqual({
        ok: true,
        value: {
          body: JSON.stringify([
            {
              EmployeeID: "employee-1",
              EndDate: "2026-05-05",
              LeaveTypeID: "leave-type-1",
              StartDate: "2026-05-04",
              Title: "Annual leave",
            },
          ]),
          method: "POST",
          url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
          xeroTenantId: "xero-tenant-1",
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    ["approve", "approve", null],
    ["decline", "reject", JSON.stringify({ Reason: "Declined" })],
    [
      "withdraw",
      "reject",
      JSON.stringify({ Reason: "Withdrawn by employee in Team Calendar." }),
    ],
  ] as const)(
    "prepares imported %s with its documented target and body",
    async (action, endpoint, body) => {
      expect(
        await XeroWriteAdapter.prepareLeaveMutation({
          ...approveInput,
          action,
          reason: "Declined",
          remoteId: "leave/id",
        })
      ).toEqual({
        ok: true,
        value: {
          body,
          method: "POST",
          url: `https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave%2Fid/${endpoint}`,
          xeroTenantId: "xero-tenant-1",
        },
      });
    }
  );
  it.each(["NZ", "UK"])(
    "does not prepare unsupported %s writes",
    async (payrollRegion) => {
      mocks.resolveXeroAccess.mockResolvedValueOnce({
        ok: true,
        value: {
          accessToken: "access-token",
          connectionId: "connection-1",
          deadline: { expiresAtMs: Date.now() + 120_000 },
          payrollRegion,
          xeroTenantId: "xero-tenant-1",
        },
      });
      expect(
        await XeroWriteAdapter.prepareLeaveMutation({
          ...submitInput,
          action: "create",
        })
      ).toMatchObject({
        error: {
          code: "region_not_supported_error",
          dispatchPhase: "before_dispatch",
        },
        ok: false,
      });
    }
  );
  it("passes the recorded identity into the provider adapter", async () => {
    const now = Date.now();
    const mutation = {
      firstDispatchedAt: new Date(now),
      idempotencyKey: "3890e6b4-47d0-40b9-ad47-c802f92c836a",
      replayBefore: new Date(now + 300_000),
      request: {
        body: null,
        method: "POST" as const,
        url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-application-1/approve",
        xeroTenantId: "xero-tenant-1",
      },
    };
    mocks.approveLeaveApplicationForRegion.mockResolvedValueOnce({
      ok: true,
      value: { rawResponse: {} },
    });
    expect(
      (
        await XeroWriteAdapter.approveLeaveApplication({
          ...approveInput,
          mutation,
        })
      ).ok
    ).toBe(true);
    expect(mocks.approveLeaveApplicationForRegion).toHaveBeenCalledWith(
      "AU",
      expect.objectContaining({ mutation })
    );
  });
});

it("rejects an unjournaled supported mutation before resolving access or dispatching", async () => {
  vi.clearAllMocks();
  mocks.approveLeaveApplicationForRegion.mockResolvedValue({
    ok: true,
    value: { rawResponse: {} },
  });
  expect(
    await XeroWriteAdapter.approveLeaveApplication({
      ...approveInput,
      mutation: undefined,
    })
  ).toMatchObject({
    error: { code: "validation_error", dispatchPhase: "before_dispatch" },
    ok: false,
  });
  expect(mocks.resolveXeroAccess).not.toHaveBeenCalled();
  expect(mocks.approveLeaveApplicationForRegion).not.toHaveBeenCalled();
});

function withPortMutation<T extends Omit<PrepareLeaveMutationInput, "action">>(
  action: PrepareLeaveMutationInput["action"],
  input: T
) {
  const prepared = prepareAuLeaveMutation(
    { ...input, action },
    "xero-tenant-1"
  );
  if (!prepared.ok) {
    throw new Error(prepared.error.message);
  }
  const now = Date.now();
  return {
    ...input,
    mutation: {
      firstDispatchedAt: new Date(now),
      idempotencyKey: randomUUID(),
      replayBefore: new Date(now + 300_000),
      request: prepared.value,
    },
  };
}

it("rejects recovery candidate reads when the current tenant differs from the journal target", async () => {
  vi.clearAllMocks();
  mocks.resolveXeroAccess.mockResolvedValueOnce({
    ok: true,
    value: {
      accessToken: "access-token",
      connectionId: "connection-1",
      deadline: { expiresAtMs: Date.now() + 120_000 },
      payrollRegion: "AU",
      xeroTenantId: "changed-tenant",
    },
  });
  mocks.fetchLeaveRecordsForRegion.mockResolvedValueOnce({
    ok: true,
    value: { complete: true, leaveRecords: [] },
  });
  expect(
    await XeroWriteAdapter.findLeaveApplicationCandidates?.({
      clerkOrgId: "org_1",
      employeeId: "employee-1",
      expectedXeroTenantId: "original-tenant",
      organisationId: "00000000-0000-4000-8000-000000000001",
    })
  ).toMatchObject({
    error: { code: "validation_error", dispatchPhase: "before_dispatch" },
    ok: false,
  });
  expect(mocks.fetchLeaveRecordsForRegion).not.toHaveBeenCalled();
  expect(mocks.fetchLeaveForEmployeeForRegion).not.toHaveBeenCalled();
});
