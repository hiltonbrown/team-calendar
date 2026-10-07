import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  fetchAuEmployees: vi.fn(),
  fetchAuLeaveApplicationStatus: vi.fn(),
  fetchAuLeaveBalances: vi.fn(),
  fetchAuLeaveRecords: vi.fn(),
  fetchNzEmployees: vi.fn(),
  fetchNzLeaveApplicationStatus: vi.fn(),
  fetchNzLeaveBalancesForEmployee: vi.fn(),
  fetchNzLeaveForEmployee: vi.fn(),
  fetchUkEmployees: vi.fn(),
  fetchUkLeaveApplicationStatus: vi.fn(),
  fetchUkLeaveBalancesForEmployee: vi.fn(),
  fetchUkLeaveForEmployee: vi.fn(),
}));
vi.mock("../adapter/auth-recovery", () => ({
  executeWithXeroAuthRecovery: (
    _tenant: unknown,
    operation: (tenant: unknown) => unknown
  ) => operation(_tenant),
}));
vi.mock("../au/read", () => ({
  fetchEmployees: mocks.fetchAuEmployees,
  fetchLeaveApplicationStatus: mocks.fetchAuLeaveApplicationStatus,
  fetchLeaveBalances: mocks.fetchAuLeaveBalances,
  fetchLeaveRecords: mocks.fetchAuLeaveRecords,
}));
vi.mock("../nz/read", () => ({
  fetchEmployees: mocks.fetchNzEmployees,
  fetchLeaveApplicationStatus: mocks.fetchNzLeaveApplicationStatus,
  fetchLeaveBalancesForEmployee: mocks.fetchNzLeaveBalancesForEmployee,
  fetchLeaveForEmployee: mocks.fetchNzLeaveForEmployee,
}));
vi.mock("../uk/read", () => ({
  fetchEmployees: mocks.fetchUkEmployees,
  fetchLeaveApplicationStatus: mocks.fetchUkLeaveApplicationStatus,
  fetchLeaveBalancesForEmployee: mocks.fetchUkLeaveBalancesForEmployee,
  fetchLeaveForEmployee: mocks.fetchUkLeaveForEmployee,
}));

import {
  fetchEmployeesForRegion,
  fetchLeaveApplicationStatusForRegion,
  fetchLeaveBalancesForRegion,
  fetchLeaveForEmployeeForRegion,
  fetchLeaveRecordsForRegion,
} from "./dispatch";

function buildTenant(region: "AU" | "NZ" | "UK") {
  return {
    accessToken: "access-token",
    clerk_org_id: "org_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id: "tenant_1",
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: region,
    xero_tenant_id: "xero-tenant-1",
  };
}
describe("fetchEmployeesForRegion dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("dispatches to AU reader for AU region", async () => {
    mocks.fetchAuEmployees.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [],
        failures: [],
        rawItemCount: 0,
        rawResponse: {},
        seenEmployeeIds: [],
      },
    });
    const tenant = buildTenant("AU");
    const result = await fetchEmployeesForRegion("AU", {
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchAuEmployees).toHaveBeenCalledWith({
      xeroConnection: tenant,
    });
  });
  it("dispatches to NZ reader for NZ region", async () => {
    mocks.fetchNzEmployees.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [],
        failures: [],
        rawItemCount: 0,
        rawResponse: {},
        seenEmployeeIds: [],
      },
    });
    const tenant = buildTenant("NZ");
    const result = await fetchEmployeesForRegion("NZ", {
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchNzEmployees).toHaveBeenCalledWith({
      xeroConnection: tenant,
    });
  });
  it("dispatches to UK reader for UK region", async () => {
    mocks.fetchUkEmployees.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [],
        failures: [],
        rawItemCount: 0,
        rawResponse: {},
        seenEmployeeIds: [],
      },
    });
    const tenant = buildTenant("UK");
    const result = await fetchEmployeesForRegion("UK", {
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchUkEmployees).toHaveBeenCalledWith({
      xeroConnection: tenant,
    });
  });
  it("returns unsupported payroll region error for unknown regions", async () => {
    const tenant = buildTenant("AU");
    const result = await fetchEmployeesForRegion("US", {
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
      expect(result.error.message).toBe("Unsupported payroll region.");
    }
  });
});
describe("fetchLeaveRecordsForRegion dispatch", () => {
  it("dispatches to AU reader for AU region", async () => {
    mocks.fetchAuLeaveRecords.mockResolvedValueOnce({
      ok: true,
      value: { complete: true, leaveRecords: [], rawResponse: {} },
    });
    const tenant = buildTenant("AU");
    const result = await fetchLeaveRecordsForRegion("AU", {
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchAuLeaveRecords).toHaveBeenCalledWith({
      xeroConnection: tenant,
    });
  });
  it("returns per-employee requirement error for NZ leave records", async () => {
    const result = await fetchLeaveRecordsForRegion("NZ", {
      xeroConnection: buildTenant("NZ"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        "NZ payroll requires per-employee leave reads."
      );
    }
  });
  it("returns per-employee requirement error for UK leave records", async () => {
    const result = await fetchLeaveRecordsForRegion("UK", {
      xeroConnection: buildTenant("UK"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        "UK payroll requires per-employee leave reads."
      );
    }
  });
  it("returns unsupported payroll region error for unknown regions", async () => {
    const result = await fetchLeaveRecordsForRegion("US", {
      xeroConnection: buildTenant("AU"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
      expect(result.error.message).toBe("Unsupported payroll region.");
    }
  });
});
describe("fetchLeaveForEmployeeForRegion dispatch", () => {
  it("dispatches to NZ reader for NZ region", async () => {
    mocks.fetchNzLeaveForEmployee.mockResolvedValueOnce({
      ok: true,
      value: { complete: true, leaveRecords: [], rawResponse: {} },
    });
    const tenant = buildTenant("NZ");
    const result = await fetchLeaveForEmployeeForRegion("NZ", {
      xeroConnection: tenant,
      xeroEmployeeId: "emp-nz-1",
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchNzLeaveForEmployee).toHaveBeenCalledWith({
      xeroConnection: tenant,
      xeroEmployeeId: "emp-nz-1",
    });
  });
  it("dispatches to UK reader for UK region", async () => {
    mocks.fetchUkLeaveForEmployee.mockResolvedValueOnce({
      ok: true,
      value: { complete: true, leaveRecords: [], rawResponse: {} },
    });
    const tenant = buildTenant("UK");
    const result = await fetchLeaveForEmployeeForRegion("UK", {
      xeroConnection: tenant,
      xeroEmployeeId: "emp-uk-1",
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchUkLeaveForEmployee).toHaveBeenCalledWith({
      xeroConnection: tenant,
      xeroEmployeeId: "emp-uk-1",
    });
  });
  it("returns unsupported for AU per-employee leave reads", async () => {
    const tenant = buildTenant("AU");
    const result = await fetchLeaveForEmployeeForRegion("AU", {
      xeroConnection: tenant,
      xeroEmployeeId: "emp-au-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
      expect(result.error.message).toContain(
        "AU payroll does not support per-employee leave reads."
      );
    }
  });
  it("returns unsupported payroll region error for unknown regions", async () => {
    const tenant = buildTenant("AU");
    const result = await fetchLeaveForEmployeeForRegion("US", {
      xeroConnection: tenant,
      xeroEmployeeId: "emp-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
      expect(result.error.message).toBe("Unsupported payroll region.");
    }
  });
});
describe("fetchLeaveBalancesForRegion dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("dispatches to AU reader for AU region", async () => {
    const tenant = buildTenant("AU");
    mocks.fetchAuLeaveBalances.mockResolvedValueOnce({
      ok: true,
      value: {
        failures: [],
        leaveBalances: [],
        rawResponses: [],
      },
    });
    const result = await fetchLeaveBalancesForRegion("AU", {
      employeeIds: ["emp-au-1", "emp-au-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchAuLeaveBalances).toHaveBeenCalledWith({
      employeeIds: ["emp-au-1", "emp-au-2"],
      xeroConnection: tenant,
    });
  });
  it("dispatches to NZ reader per employee for NZ region", async () => {
    const tenant = buildTenant("NZ");
    mocks.fetchNzLeaveBalancesForEmployee
      .mockResolvedValueOnce({
        ok: true,
        value: {
          leaveBalances: [
            {
              balance: 80,
              currencyCode: null,
              employeeId: "emp-nz-1",
              leaveTypeId: "lt-1",
              leaveTypeName: "Annual Leave",
              rawPayload: {},
              unitType: "hours",
            },
            {
              balance: 1500.5,
              currencyCode: "NZD",
              employeeId: "emp-nz-1",
              leaveTypeId: "lt-2",
              leaveTypeName: "Holiday Pay",
              rawPayload: {},
              unitType: "currency",
            },
          ],
          rawResponse: { raw: "nz-1" },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          leaveBalances: [
            {
              balance: 40,
              currencyCode: null,
              employeeId: "emp-nz-2",
              leaveTypeId: "lt-3",
              leaveTypeName: "Sick Leave",
              rawPayload: {},
              unitType: "hours",
            },
          ],
          rawResponse: { raw: "nz-2" },
        },
      });
    const progressCalls: [number, number][] = [];
    const result = await fetchLeaveBalancesForRegion("NZ", {
      employeeIds: ["emp-nz-1", "emp-nz-2"],
      onProgress: (p, t) => {
        progressCalls.push([p, t]);
      },
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toHaveLength(3);
      expect(result.value.rawResponses).toEqual([
        { raw: "nz-1" },
        { raw: "nz-2" },
      ]);
      expect(result.value.failures).toHaveLength(0);
    }
    expect(mocks.fetchNzLeaveBalancesForEmployee).toHaveBeenCalledTimes(2);
    expect(progressCalls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
  it("aborts NZ balance fetch on blanket auth failure (401)", async () => {
    const tenant = buildTenant("NZ");
    mocks.fetchNzLeaveBalancesForEmployee.mockResolvedValueOnce({
      error: {
        code: "auth_error",
        httpStatus: 401,
        message: "Unauthorized",
      },
      ok: false,
    });
    const result = await fetchLeaveBalancesForRegion("NZ", {
      employeeIds: ["emp-nz-1", "emp-nz-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("auth_error");
    }
    expect(mocks.fetchNzLeaveBalancesForEmployee).toHaveBeenCalledTimes(1);
  });
  it("aborts NZ balance fetch on blanket permission failure (403)", async () => {
    const tenant = buildTenant("NZ");
    mocks.fetchNzLeaveBalancesForEmployee.mockResolvedValueOnce({
      error: {
        code: "permission_error",
        httpStatus: 403,
        message: "Forbidden",
      },
      ok: false,
    });
    const result = await fetchLeaveBalancesForRegion("NZ", {
      employeeIds: ["emp-nz-1", "emp-nz-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("permission_error");
    }
    expect(mocks.fetchNzLeaveBalancesForEmployee).toHaveBeenCalledTimes(1);
  });
  it("isolates NZ employee failure and continues to next employee", async () => {
    const tenant = buildTenant("NZ");
    mocks.fetchNzLeaveBalancesForEmployee
      .mockResolvedValueOnce({
        error: {
          code: "not_found_error",
          httpStatus: 404,
          message: "Employee not found",
        },
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          leaveBalances: [
            {
              balance: 10,
              currencyCode: null,
              employeeId: "emp-nz-2",
              leaveTypeId: "lt-1",
              leaveTypeName: "Annual Leave",
              rawPayload: {},
              unitType: "hours",
            },
          ],
          rawResponse: { raw: "nz-2" },
        },
      });
    const result = await fetchLeaveBalancesForRegion("NZ", {
      employeeIds: ["emp-nz-1", "emp-nz-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toHaveLength(1);
      expect(result.value.failures).toHaveLength(1);
      expect(result.value.failures[0]?.employeeId).toBe("emp-nz-1");
    }
    expect(mocks.fetchNzLeaveBalancesForEmployee).toHaveBeenCalledTimes(2);
  });
  it("dispatches to UK reader per employee for UK region", async () => {
    const tenant = buildTenant("UK");
    mocks.fetchUkLeaveBalancesForEmployee
      .mockResolvedValueOnce({
        ok: true,
        value: {
          leaveBalances: [
            {
              balance: 37.5,
              currencyCode: null,
              employeeId: "emp-uk-1",
              leaveTypeId: "lt-uk-1",
              leaveTypeName: "Holiday",
              rawPayload: {},
              unitType: "hours",
            },
          ],
          rawResponse: { raw: "uk-1" },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          leaveBalances: [
            {
              balance: 5,
              currencyCode: null,
              employeeId: "emp-uk-2",
              leaveTypeId: "lt-uk-2",
              leaveTypeName: "Maternity",
              rawPayload: {},
              unitType: "days",
            },
          ],
          rawResponse: { raw: "uk-2" },
        },
      });
    const result = await fetchLeaveBalancesForRegion("UK", {
      employeeIds: ["emp-uk-1", "emp-uk-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toHaveLength(2);
      expect(result.value.rawResponses).toEqual([
        { raw: "uk-1" },
        { raw: "uk-2" },
      ]);
      expect(result.value.failures).toHaveLength(0);
    }
    expect(mocks.fetchUkLeaveBalancesForEmployee).toHaveBeenCalledTimes(2);
  });
  it("aborts UK balance fetch on blanket rate-limit failure (429)", async () => {
    const tenant = buildTenant("UK");
    mocks.fetchUkLeaveBalancesForEmployee.mockResolvedValueOnce({
      error: {
        code: "rate_limit_error",
        httpStatus: 429,
        message: "Rate limited",
      },
      ok: false,
    });
    const result = await fetchLeaveBalancesForRegion("UK", {
      employeeIds: ["emp-uk-1", "emp-uk-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
    expect(mocks.fetchUkLeaveBalancesForEmployee).toHaveBeenCalledTimes(1);
  });
  it("aborts UK balance fetch on blanket permission failure (403)", async () => {
    const tenant = buildTenant("UK");
    mocks.fetchUkLeaveBalancesForEmployee.mockResolvedValueOnce({
      error: {
        code: "permission_error",
        httpStatus: 403,
        message: "Forbidden",
      },
      ok: false,
    });
    const result = await fetchLeaveBalancesForRegion("UK", {
      employeeIds: ["emp-uk-1", "emp-uk-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("permission_error");
    }
    expect(mocks.fetchUkLeaveBalancesForEmployee).toHaveBeenCalledTimes(1);
  });
  it("stops balance collection on an operational incident before the next employee", async () => {
    mocks.fetchUkLeaveBalancesForEmployee.mockResolvedValue({
      ok: true,
      value: { leaveBalances: [], rawResponse: {} },
    });
    mocks.fetchUkLeaveBalancesForEmployee.mockResolvedValueOnce({
      error: {
        code: "unknown_error",
        message: "Admission unavailable",
        recoveryReason: "operational_incident",
      },
      ok: false,
    });
    const result = await fetchLeaveBalancesForRegion("UK", {
      employeeIds: ["emp-uk-1", "emp-uk-2"],
      xeroConnection: buildTenant("UK"),
    });
    expect(result).toMatchObject({
      error: { recoveryReason: "operational_incident" },
      ok: false,
    });
    expect(mocks.fetchUkLeaveBalancesForEmployee).toHaveBeenCalledTimes(1);
  });
  it("isolates UK employee validation failure and continues to next employee", async () => {
    const tenant = buildTenant("UK");
    mocks.fetchUkLeaveBalancesForEmployee
      .mockResolvedValueOnce({
        error: {
          code: "validation_error",
          message: "UK leave balances response could not be parsed.",
          rawPayload: { bad: "payload" },
        },
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          leaveBalances: [
            {
              balance: 25,
              currencyCode: null,
              employeeId: "emp-uk-2",
              leaveTypeId: "lt-uk-2",
              leaveTypeName: "Annual Leave",
              rawPayload: {},
              unitType: "days",
            },
          ],
          rawResponse: { raw: "uk-2" },
        },
      });
    const result = await fetchLeaveBalancesForRegion("UK", {
      employeeIds: ["emp-uk-1", "emp-uk-2"],
      xeroConnection: tenant,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toHaveLength(1);
      expect(result.value.failures).toHaveLength(1);
      expect(result.value.failures[0]?.employeeId).toBe("emp-uk-1");
      expect(result.value.rawResponses).toEqual([
        { bad: "payload" },
        { raw: "uk-2" },
      ]);
    }
    expect(mocks.fetchUkLeaveBalancesForEmployee).toHaveBeenCalledTimes(2);
  });
  it("returns unsupported payroll region error for unknown regions", async () => {
    const result = await fetchLeaveBalancesForRegion("US", {
      employeeIds: ["emp-1"],
      xeroConnection: buildTenant("AU"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
      expect(result.error.message).toBe("Unsupported payroll region.");
    }
  });
});
describe("fetchLeaveApplicationStatusForRegion dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("dispatches to AU reader for AU region", async () => {
    const auTenant = buildTenant("AU");
    mocks.fetchAuLeaveApplicationStatus.mockResolvedValueOnce({
      ok: true,
      value: {
        approvedAt: new Date("2026-06-10T00:00:00.000Z"),
        rawResponse: {},
        status: "APPROVED",
      },
    });
    const result = await fetchLeaveApplicationStatusForRegion("AU", {
      xeroConnection: auTenant,
      xeroEmployeeId: "emp-au-1",
      xeroLeaveApplicationId: "app-au-1",
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchAuLeaveApplicationStatus).toHaveBeenCalledWith({
      xeroConnection: auTenant,
      xeroEmployeeId: "emp-au-1",
      xeroLeaveApplicationId: "app-au-1",
    });
  });
  it("dispatches to NZ reader for NZ region with employee and leave IDs", async () => {
    const nzTenant = buildTenant("NZ");
    mocks.fetchNzLeaveApplicationStatus.mockResolvedValueOnce({
      ok: true,
      value: {
        approvedAt: null,
        rawResponse: {},
        status: "REJECTED",
      },
    });
    const result = await fetchLeaveApplicationStatusForRegion("NZ", {
      xeroConnection: nzTenant,
      xeroEmployeeId: "emp-nz-1",
      xeroLeaveApplicationId: "app-nz-1",
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchNzLeaveApplicationStatus).toHaveBeenCalledWith({
      xeroConnection: nzTenant,
      xeroEmployeeId: "emp-nz-1",
      xeroLeaveApplicationId: "app-nz-1",
    });
  });
  it("dispatches to UK reader for UK region with employee and leave IDs", async () => {
    const ukTenant = buildTenant("UK");
    mocks.fetchUkLeaveApplicationStatus.mockResolvedValueOnce({
      ok: true,
      value: {
        approvedAt: null,
        rawResponse: {},
        status: "WITHDRAWN",
      },
    });
    const result = await fetchLeaveApplicationStatusForRegion("UK", {
      xeroConnection: ukTenant,
      xeroEmployeeId: "emp-uk-1",
      xeroLeaveApplicationId: "app-uk-1",
    });
    expect(result.ok).toBe(true);
    expect(mocks.fetchUkLeaveApplicationStatus).toHaveBeenCalledWith({
      xeroConnection: ukTenant,
      xeroEmployeeId: "emp-uk-1",
      xeroLeaveApplicationId: "app-uk-1",
    });
  });
  it("returns unsupported payroll region error for unknown regions", async () => {
    const result = await fetchLeaveApplicationStatusForRegion("US", {
      xeroConnection: buildTenant("AU"),
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "app-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_error");
      expect(result.error.message).toBe("Unsupported payroll region.");
    }
  });
  it("propagates permission_error (403) from regional readers", async () => {
    mocks.fetchNzLeaveApplicationStatus.mockResolvedValueOnce({
      error: {
        code: "permission_error",
        httpStatus: 403,
        message: "Forbidden",
      },
      ok: false,
    });
    const result = await fetchLeaveApplicationStatusForRegion("NZ", {
      xeroConnection: buildTenant("NZ"),
      xeroEmployeeId: "emp-nz-1",
      xeroLeaveApplicationId: "app-nz-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("permission_error");
      expect(result.error.httpStatus).toBe(403);
    }
  });
  it("propagates not_found_error (404) from regional readers", async () => {
    mocks.fetchUkLeaveApplicationStatus.mockResolvedValueOnce({
      error: {
        code: "not_found_error",
        httpStatus: 404,
        message: "Not found",
      },
      ok: false,
    });
    const result = await fetchLeaveApplicationStatusForRegion("UK", {
      xeroConnection: buildTenant("UK"),
      xeroEmployeeId: "emp-uk-1",
      xeroLeaveApplicationId: "app-uk-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found_error");
      expect(result.error.httpStatus).toBe(404);
    }
  });
});
