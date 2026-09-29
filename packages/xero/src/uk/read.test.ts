import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchEmployees,
  fetchLeaveApplicationStatus,
  fetchUkLeaveApplicationStatus,
  fetchUkLeaveBalancesForEmployee,
  fetchUkLeaveForEmployee,
  mapUkLeaveBalances,
  mapUkLeaveRecords,
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
    clerk_org_id: "org_uk_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id: "tenant_uk_1",
    organisation_id: "00000000-0000-4000-8000-000000000003",
    payroll_region: "UK" as const,
    tokenVersion: 1,
    xero_tenant_id: "xero-tenant-uk-1",
  };
}

function employeeListResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ employees: items }), { status: 200 });
}

function validEmployeeItem(employeeId: string, overrides: object = {}) {
  return {
    email: "oliver@example.co.uk",
    employeeID: employeeId,
    employmentType: "Employee",
    firstName: "Oliver",
    jobTitle: "Product Designer",
    lastName: "Smith",
    startDate: "2026-02-01",
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

function ukLeaveResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ leave: items }), { status: 200 });
}

function ukLeaveBalancesResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ leaveBalances: items }), {
    status: 200,
  });
}

describe("UK employee reads", () => {
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
          "Xero-Tenant-Id": "xero-tenant-uk-1",
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

describe("UK leave record reads", () => {
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
        description: "Holiday in Edinburgh",
        endDate: "2026-07-10",
        leaveID: "leave-uk-1",
        leaveTypeID: "annual-uk-type",
        leaveTypeName: "Annual Leave",
        periods: [
          {
            numberOfUnits: 7.5,
            periodEndDate: "2026-07-09",
            periodStartDate: "2026-07-09",
            periodStatus: "Approved",
          },
          {
            numberOfUnits: 3.75,
            periodEndDate: "2026-07-10",
            periodStartDate: "2026-07-10",
            periodStatus: "Approved",
          },
        ],
        startDate: "2026-07-09",
        updatedDateUTC: "2026-07-01T04:00:00.000Z",
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue(ukLeaveResponse(rawLeave));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "emp-uk-1",
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
      employeeId: "emp-uk-1",
      endDate: "2026-07-10",
      leaveApplicationId: "leave-uk-1",
      leaveTypeId: "annual-uk-type",
      leaveTypeName: "Annual Leave",
      rawPayload: rawLeave[0],
      startDate: "2026-07-09",
      status: "APPROVED",
      title: "Holiday in Edinburgh",
      units: 11.25,
      updatedDateUtc: "2026-07-01T04:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/payroll.xro/2.0/employees/emp-uk-1/leave"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Xero-Tenant-Id": "xero-tenant-uk-1",
        }),
      })
    );
  });

  it("maps Completed and Estimated period statuses to APPROVED and maps other statuses correctly", () => {
    const records = mapUkLeaveRecords(
      {
        leave: [
          {
            endDate: "2026-08-01",
            leaveID: "l-1",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 7.5, periodStatus: "Completed" }],
            startDate: "2026-08-01",
          },
          {
            endDate: "2026-08-02",
            leaveID: "l-2",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 7.5, periodStatus: "Estimated" }],
            startDate: "2026-08-02",
          },
          {
            endDate: "2026-08-03",
            leaveID: "l-3",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 7.5, periodStatus: "Declined" }],
            startDate: "2026-08-03",
          },
          {
            endDate: "2026-08-04",
            leaveID: "l-4",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 7.5, periodStatus: "Submitted" }],
            startDate: "2026-08-04",
          },
          {
            endDate: "2026-08-05",
            leaveID: "l-5",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 7.5, periodStatus: "Withdrawn" }],
            startDate: "2026-08-05",
          },
          {
            endDate: "2026-08-06",
            leaveID: "l-6",
            leaveTypeID: "lt-1",
            periods: [{ numberOfUnits: 7.5, periodStatus: "Deleted" }],
            startDate: "2026-08-06",
          },
        ],
      },
      "emp-1"
    );

    expect(records.map((r) => r.status)).toEqual([
      "APPROVED",
      "APPROVED",
      "REJECTED",
      "SUBMITTED",
      "WITHDRAWN",
      "DELETED",
    ]);
  });

  it("handles empty leave array gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ukLeaveResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "emp-uk-1",
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

    const result = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "emp-uk-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complete).toBe(false);
      expect(result.value.leaveRecords).toEqual([]);
    }
  });

  it("returns validation_error when xeroEmployeeId is missing", async () => {
    const result = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("maps 400, 401, 403, and 404 for leave reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(400, "Bad Request"))
      .mockResolvedValueOnce(errorResponse(401, "Unauthorised"))
      .mockResolvedValueOnce(errorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(errorResponse(404, "Employee not found"));
    vi.stubGlobal("fetch", fetchMock);

    const tenant = buildXeroTenant();

    const r400 = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r400.ok).toBe(false);
    if (!r400.ok) {
      expect(r400.error.code).toBe("validation_error");
    }

    const r401 = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r401.ok).toBe(false);
    if (!r401.ok) {
      expect(r401.error.code).toBe("auth_error");
    }

    const r403 = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r403.ok).toBe(false);
    if (!r403.ok) {
      expect(r403.error.code).toBe("permission_error");
    }

    const r404 = await fetchUkLeaveForEmployee({
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

    const result = await fetchUkLeaveForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
  });
});

describe("UK leave balance reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEncryptionKey();
  });

  it("maps ordinary Hours and Days balances with null currencyCode", async () => {
    const rawBalances = [
      {
        leaveBalanceID: "lb-uk-1",
        leaveName: "Annual Leave",
        leaveTypeID: "lt-uk-annual",
        numberOfUnits: 172.5,
        typeOfUnits: "Hours",
      },
      {
        leaveBalanceID: "lb-uk-2",
        leaveName: "Time Off in Lieu",
        leaveTypeID: "lt-uk-toil",
        numberOfUnits: 4,
        typeOfUnits: "Days",
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue(ukLeaveBalancesResponse(rawBalances));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-uk-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.leaveBalances).toEqual([
      {
        balance: 172.5,
        currencyCode: null,
        employeeId: "emp-uk-1",
        leaveTypeId: "lt-uk-annual",
        leaveTypeName: "Annual Leave",
        rawPayload: rawBalances[0],
        unitType: "hours",
      },
      {
        balance: 4,
        currencyCode: null,
        employeeId: "emp-uk-1",
        leaveTypeId: "lt-uk-toil",
        leaveTypeName: "Time Off in Lieu",
        rawPayload: rawBalances[1],
        unitType: "days",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/payroll.xro/2.0/employees/emp-uk-1/leaveBalances"
      ),
      expect.any(Object)
    );
  });

  it("fails closed with validation_error when unexpected monetary unit is present", async () => {
    const rawBalances = [
      {
        leaveBalanceID: "lb-uk-1",
        leaveName: "Statutory Pay",
        leaveTypeID: "lt-uk-stat",
        numberOfUnits: 500,
        typeOfUnits: "Pounds",
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue(ukLeaveBalancesResponse(rawBalances));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-uk-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
      expect(result.error.message).toContain("could not be parsed");
    }
  });

  it("fails closed with validation_error when unexpected currencyCode is present", async () => {
    const rawBalances = [
      {
        currencyCode: "GBP",
        leaveBalanceID: "lb-uk-1",
        leaveName: "Statutory Pay",
        leaveTypeID: "lt-uk-stat",
        numberOfUnits: 500,
        typeOfUnits: "Hours",
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue(ukLeaveBalancesResponse(rawBalances));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-uk-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("fails closed in mapUkLeaveBalances when unexpected unit is present", () => {
    const balances = mapUkLeaveBalances(
      {
        leaveBalances: [
          {
            leaveName: "Monetary Leave",
            leaveTypeID: "lt-1",
            numberOfUnits: 100,
            typeOfUnits: "Dollars",
          },
        ],
      },
      "emp-1"
    );
    expect(balances).toEqual([]);
  });

  it("handles null or empty typeOfUnits safely with null unitType and null currencyCode", async () => {
    const rawBalances = [
      {
        leaveBalanceID: "lb-uk-1",
        leaveName: "Generic Leave",
        leaveTypeID: "lt-uk-gen",
        numberOfUnits: 10,
        typeOfUnits: null,
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValue(ukLeaveBalancesResponse(rawBalances));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-uk-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.leaveBalances).toEqual([
      {
        balance: 10,
        currencyCode: null,
        employeeId: "emp-uk-1",
        leaveTypeId: "lt-uk-gen",
        leaveTypeName: "Generic Leave",
        rawPayload: rawBalances[0],
        unitType: null,
      },
    ]);
  });

  it("handles empty balance array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ukLeaveBalancesResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-uk-1",
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

    const result = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-uk-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("maps 400, 401, 403, and 404 for balance reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(400, "Bad Request"))
      .mockResolvedValueOnce(errorResponse(401, "Unauthorised"))
      .mockResolvedValueOnce(errorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(errorResponse(404, "Employee not found"));
    vi.stubGlobal("fetch", fetchMock);

    const tenant = buildXeroTenant();

    const r400 = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r400.ok).toBe(false);
    if (!r400.ok) {
      expect(r400.error.code).toBe("validation_error");
    }

    const r401 = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r401.ok).toBe(false);
    if (!r401.ok) {
      expect(r401.error.code).toBe("auth_error");
    }

    const r403 = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: tenant,
    });
    expect(r403.ok).toBe(false);
    if (!r403.ok) {
      expect(r403.error.code).toBe("permission_error");
    }

    const r404 = await fetchUkLeaveBalancesForEmployee({
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

    const result = await fetchUkLeaveBalancesForEmployee({
      xeroEmployeeId: "emp-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
  });
});

describe("UK leave application status reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEncryptionKey();
  });

  it("fetches single application status using employeeId and leaveApplicationId", async () => {
    const rawPayload = {
      leaveID: "leave-app-uk-1",
      periods: [
        {
          numberOfUnits: 7.5,
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

    const result = await fetchUkLeaveApplicationStatus({
      xeroEmployeeId: "emp-uk-1",
      xeroLeaveApplicationId: "leave-app-uk-1",
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
        "/payroll.xro/2.0/employees/emp-uk-1/leave/leave-app-uk-1"
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

  it("requires both xeroEmployeeId and xeroLeaveApplicationId on fetchUkLeaveApplicationStatus", async () => {
    const resultMissingEmp = await fetchUkLeaveApplicationStatus({
      xeroEmployeeId: "",
      xeroLeaveApplicationId: "leave-app-1",
      xeroTenant: buildXeroTenant(),
    });
    expect(resultMissingEmp.ok).toBe(false);
    if (!resultMissingEmp.ok) {
      expect(resultMissingEmp.error.code).toBe("validation_error");
    }

    const resultMissingLeave = await fetchUkLeaveApplicationStatus({
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "",
      xeroTenant: buildXeroTenant(),
    });
    expect(resultMissingLeave.ok).toBe(false);
    if (!resultMissingLeave.ok) {
      expect(resultMissingLeave.error.code).toBe("validation_error");
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

    const r401 = await fetchUkLeaveApplicationStatus({
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: tenant,
    });
    expect(r401.ok).toBe(false);
    if (!r401.ok) {
      expect(r401.error.code).toBe("auth_error");
    }

    const r403 = await fetchUkLeaveApplicationStatus({
      xeroEmployeeId: "emp-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: tenant,
    });
    expect(r403.ok).toBe(false);
    if (!r403.ok) {
      expect(r403.error.code).toBe("permission_error");
    }

    const r404 = await fetchUkLeaveApplicationStatus({
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

    const result = await fetchUkLeaveApplicationStatus({
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
