import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchEmployees,
  fetchLeaveApplicationStatus,
  fetchNzLeaveApplicationStatus,
  fetchNzLeaveBalancesForEmployee,
  fetchNzLeaveForEmployee,
  mapNzLeaveRecords,
} from "./read";

const ORIGINAL_ENV = process.env.XERO_TOKEN_ENCRYPTION_KEY;
const TEST_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

function restoreEncryptionKey() {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.XERO_TOKEN_ENCRYPTION_KEY;
    return;
  }
  process.env.XERO_TOKEN_ENCRYPTION_KEY = ORIGINAL_ENV;
}

function buildXeroTenant() {
  return {
    accessToken: "access-token",
    bindingGeneration: 1,
    clerk_org_id: "org_nz_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id: "tenant_nz_1",
    organisation_id: "00000000-0000-4000-8000-000000000002",
    payroll_region: "NZ" as const,
    tokenVersion: 1,
    xero_tenant_id: "xero-tenant-nz-1",
  };
}

function employeeListResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ employees: items }), { status: 200 });
}

function validEmployeeItem(employeeId: string, overrides: object = {}) {
  return {
    email: "aroha@example.co.nz",
    employeeID: employeeId,
    engagementType: "Employee",
    firstName: "Aroha",
    jobTitle: "Software Engineer",
    lastName: "Tane",
    startDate: "2026-01-15",
    status: "Active",
    ...overrides,
  };
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    statusText: message,
  });
}

function nzLeaveResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ leave: items }), { status: 200 });
}

function nzLeaveBalancesResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ leaveBalances: items }), {
    status: 200,
  });
}

describe("NZ employee reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEncryptionKey();
  });

  it("marks a single short page as complete and preserves valid neighbours of a malformed record", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        employeeListResponse([
          validEmployeeItem("11111111-1111-4111-8111-111111111111"),
          null,
          validEmployeeItem("22222222-2222-4222-8222-222222222222"),
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmployees({ xeroTenant: buildXeroTenant() });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.complete).toBe(true);
    expect(result.value.employees.map((e) => e.employeeId)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(result.value.failures).toHaveLength(1);
    expect(result.value.rawItemCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/payroll.xro/2.0/employees?page=1"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Xero-Tenant-Id": "xero-tenant-nz-1",
        }),
      })
    );
  });

  it("uses raw page length, not valid employee count, to continue pagination", async () => {
    const firstPageItems = Array.from({ length: 100 }, (_, index) =>
      index % 2 === 0
        ? validEmployeeItem(
            `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`
          )
        : null
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(employeeListResponse(firstPageItems))
      .mockResolvedValueOnce(
        employeeListResponse([
          validEmployeeItem("22222222-2222-4222-8222-222222222222"),
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmployees({ xeroTenant: buildXeroTenant() });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.complete).toBe(true);
    expect(result.value.rawItemCount).toBe(101);
    expect(result.value.employees).toHaveLength(51);
    expect(result.value.failures).toHaveLength(50);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining("/payroll.xro/2.0/employees?page=1"),
      expect.stringContaining("/payroll.xro/2.0/employees?page=2"),
    ]);
  });

  it("handles empty page correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(employeeListResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmployees({ xeroTenant: buildXeroTenant() });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.complete).toBe(true);
    expect(result.value.employees).toHaveLength(0);
    expect(result.value.rawItemCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns complete: false and preserves gathered employees when a page envelope cannot be read", async () => {
    const fullFirstPage = Array.from({ length: 100 }, (_, index) =>
      validEmployeeItem(
        `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`
      )
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(employeeListResponse(fullFirstPage))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ employees: "not an array" }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmployees({ xeroTenant: buildXeroTenant() });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.complete).toBe(false);
    expect(result.value.employees).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps 401 to auth_error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(errorResponse(401, "Unauthorised"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmployees({ xeroTenant: buildXeroTenant() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("auth_error");
    }
  });

  it("maps 403 to permission_error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(errorResponse(403, "Forbidden"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmployees({ xeroTenant: buildXeroTenant() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("permission_error");
    }
  });

  it("maps 429 to rate_limit_error", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(errorResponse(429, "Too Many Requests"))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEmployees({ xeroTenant: buildXeroTenant() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
  });

  it("returns an incident without dispatch when resolved access is missing", async () => {
    const tenant = buildXeroTenant();
    tenant.accessToken = "";

    await expect(fetchEmployees({ xeroTenant: tenant })).resolves.toMatchObject(
      {
        error: {
          code: "unknown_error",
          dispatchPhase: "before_dispatch",
          message: "Xero access is unavailable.",
          recoveryReason: "operational_incident",
        },
        ok: false,
      }
    );
  });
});

describe("NZ leave record reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEncryptionKey();
  });

  it("fetches and maps multi-period leave records for an employee", async () => {
    const rawLeave = [
      {
        description: "Holiday in Queenstown",
        endDate: "2026-07-10",
        leaveID: "leave-nz-1",
        leaveTypeID: "annual-nz-type",
        leaveTypeName: "Annual Leave",
        periods: [
          {
            numberOfUnits: 8,
            periodEndDate: "2026-07-09",
            periodStartDate: "2026-07-09",
            periodStatus: "Approved",
          },
          {
            numberOfUnits: 4,
            periodEndDate: "2026-07-10",
            periodStartDate: "2026-07-10",
            periodStatus: "Approved",
          },
        ],
        startDate: "2026-07-09",
        updatedDateUTC: "2026-07-01T04:00:00.000Z",
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue(nzLeaveResponse(rawLeave));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "emp-nz-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.complete).toBe(true);
    expect(result.value.leaveRecords).toHaveLength(1);
    const [record] = result.value.leaveRecords;
    expect(record).toEqual({
      employeeId: "emp-nz-1",
      endDate: "2026-07-10",
      leaveApplicationId: "leave-nz-1",
      leaveTypeId: "annual-nz-type",
      leaveTypeName: "Annual Leave",
      rawPayload: rawLeave[0],
      startDate: "2026-07-09",
      status: "APPROVED",
      title: "Holiday in Queenstown",
      units: 12,
      updatedDateUtc: "2026-07-01T04:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/payroll.xro/2.0/employees/emp-nz-1/leave"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Xero-Tenant-Id": "xero-tenant-nz-1",
        }),
      })
    );
  });

  it("maps Completed and Estimated period statuses to APPROVED", () => {
    const records = mapNzLeaveRecords(
      {
        leave: [
          {
            endDate: "2026-08-01",
            leaveID: "l-1",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 8, periodStatus: "Completed" }],
            startDate: "2026-08-01",
          },
          {
            endDate: "2026-08-02",
            leaveID: "l-2",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 8, periodStatus: "Estimated" }],
            startDate: "2026-08-02",
          },
          {
            endDate: "2026-08-03",
            leaveID: "l-3",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 8, periodStatus: "Declined" }],
            startDate: "2026-08-03",
          },
        ],
      },
      "emp-1"
    );

    expect(records.map((r) => r.status)).toEqual([
      "APPROVED",
      "APPROVED",
      "REJECTED",
    ]);
  });

  it("handles empty leave array gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(nzLeaveResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "emp-nz-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complete).toBe(true);
      expect(result.value.leaveRecords).toEqual([]);
    }
  });

  it("returns complete: false when envelope is unparseable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ leave: "not an array" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "emp-nz-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complete).toBe(false);
      expect(result.value.leaveRecords).toEqual([]);
    }
  });

  it("returns validation_error when xeroEmployeeId is missing", async () => {
    const result = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("maps 401, 403, and 404 for leave reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401, "Unauthorised"))
      .mockResolvedValueOnce(errorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(errorResponse(404, "Employee not found"));
    vi.stubGlobal("fetch", fetchMock);

    const tenant = buildXeroTenant();

    const r401 = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r401.ok).toBe(false);
    if (!r401.ok) {
      expect(r401.error.code).toBe("auth_error");
    }

    const r403 = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r403.ok).toBe(false);
    if (!r403.ok) {
      expect(r403.error.code).toBe("permission_error");
    }

    const r404 = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r404.ok).toBe(false);
    if (!r404.ok) {
      expect(r404.error.code).toBe("not_found_error");
    }
  });

  it("maps 429 to rate_limit_error for leave reads", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(errorResponse(429, "Rate limited"))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
  });
});

describe("NZ leave balance reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEncryptionKey();
  });

  it("maps Dollars to unitType: currency and currencyCode: NZD", async () => {
    const rawBalances = [
      {
        leaveBalanceID: "lb-1",
        leaveName: "Holiday Pay",
        leaveTypeID: "lt-holiday-pay",
        numberOfUnits: 1540.5,
        typeOfUnits: "Dollars",
      },
      {
        leaveBalanceID: "lb-2",
        leaveName: "Annual Leave",
        leaveTypeID: "lt-annual-leave",
        numberOfUnits: 160,
        typeOfUnits: "Hours",
      },
      {
        leaveBalanceID: "lb-3",
        leaveName: "Alternative Leave",
        leaveTypeID: "lt-alt-leave",
        numberOfUnits: 3,
        typeOfUnits: "Days",
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue(nzLeaveBalancesResponse(rawBalances));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-nz-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.leaveBalances).toEqual([
      {
        balance: 1540.5,
        currencyCode: "NZD",
        employeeId: "emp-nz-1",
        leaveTypeId: "lt-holiday-pay",
        leaveTypeName: "Holiday Pay",
        rawPayload: rawBalances[0],
        unitType: "currency",
      },
      {
        balance: 160,
        currencyCode: null,
        employeeId: "emp-nz-1",
        leaveTypeId: "lt-annual-leave",
        leaveTypeName: "Annual Leave",
        rawPayload: rawBalances[1],
        unitType: "hours",
      },
      {
        balance: 3,
        currencyCode: null,
        employeeId: "emp-nz-1",
        leaveTypeId: "lt-alt-leave",
        leaveTypeName: "Alternative Leave",
        rawPayload: rawBalances[2],
        unitType: "days",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/payroll.xro/2.0/employees/emp-nz-1/leaveBalances"
      ),
      expect.any(Object)
    );
  });

  it("handles empty balance array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(nzLeaveBalancesResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-nz-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toEqual([]);
    }
  });

  it("returns validation_error when balances envelope is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ leaveBalances: "not an array" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-nz-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("maps 401, 403, and 404 for balance reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401, "Unauthorised"))
      .mockResolvedValueOnce(errorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(errorResponse(404, "Employee not found"));
    vi.stubGlobal("fetch", fetchMock);

    const tenant = buildXeroTenant();

    const r401 = await fetchNzLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r401.ok).toBe(false);
    if (!r401.ok) {
      expect(r401.error.code).toBe("auth_error");
    }

    const r403 = await fetchNzLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r403.ok).toBe(false);
    if (!r403.ok) {
      expect(r403.error.code).toBe("permission_error");
    }

    const r404 = await fetchNzLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r404.ok).toBe(false);
    if (!r404.ok) {
      expect(r404.error.code).toBe("not_found_error");
    }
  });

  it("maps 429 to rate_limit_error for balance reads", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(errorResponse(429, "Rate limited"))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
  });
});

describe("NZ leave application status reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEncryptionKey();
  });

  it("fetches single application status using employeeId and leaveApplicationId", async () => {
    const rawPayload = {
      leaveID: "leave-app-1",
      periods: [
        {
          numberOfUnits: 8,
          periodEndDate: "2026-09-01",
          periodStartDate: "2026-09-01",
          periodStatus: "Approved",
        },
      ],
      updatedDateUTC: "2026-09-02T10:00:00.000Z",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(rawPayload), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveApplicationStatus({
      xeroEmployeeId: "emp-nz-1",
      xeroLeaveApplicationId: "leave-app-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe("APPROVED");
    expect(result.value.approvedAt).toEqual(
      new Date("2026-09-02T10:00:00.000Z")
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/payroll.xro/2.0/employees/emp-nz-1/leave/leave-app-1"
      ),
      expect.any(Object)
    );
  });

  it("requires xeroEmployeeId on generic fetchLeaveApplicationStatus caller", async () => {
    const result = await fetchLeaveApplicationStatus({
      xeroLeaveApplicationId: "leave-app-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
      expect(result.error.message).toContain("requires xeroEmployeeId");
    }
  });

  it("maps 401, 403, and 404 for status reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401, "Unauthorised"))
      .mockResolvedValueOnce(errorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(errorResponse(404, "Leave not found"));
    vi.stubGlobal("fetch", fetchMock);

    const tenant = buildXeroTenant();

    const r401 = await fetchNzLeaveApplicationStatus({
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: tenant,
    });
    expect(r401.ok).toBe(false);
    if (!r401.ok) {
      expect(r401.error.code).toBe("auth_error");
    }

    const r403 = await fetchNzLeaveApplicationStatus({
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: tenant,
    });
    expect(r403.ok).toBe(false);
    if (!r403.ok) {
      expect(r403.error.code).toBe("permission_error");
    }

    const r404 = await fetchNzLeaveApplicationStatus({
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: tenant,
    });
    expect(r404.ok).toBe(false);
    if (!r404.ok) {
      expect(r404.error.code).toBe("not_found_error");
    }
  });

  it("maps 429 to rate_limit_error for status reads", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(errorResponse(429, "Rate limited"))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNzLeaveApplicationStatus({
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
  });
});
