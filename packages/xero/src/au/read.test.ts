import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEmployees, fetchLeaveBalances, fetchLeaveRecords } from "./read";

const ORIGINAL_ENV = process.env.XERO_TOKEN_ENCRYPTION_KEY;
const TEST_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
function restoreEncryptionKey() {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.XERO_TOKEN_ENCRYPTION_KEY;
    return;
  }
  process.env.XERO_TOKEN_ENCRYPTION_KEY = ORIGINAL_ENV;
}
function buildXeroTenant(tenantId = "xero-tenant-1") {
  return {
    accessToken: "access-token",
    clerk_org_id: "org_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id: tenantId === "xero-tenant-1" ? "tenant_1" : tenantId,
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: "AU" as const,
    xero_tenant_id: tenantId,
  };
}
function employeeResponse(employeeId: string, balance: number): Response {
  return new Response(
    JSON.stringify({
      Employees: [
        {
          EmployeeID: employeeId,
          LeaveBalances: [
            {
              LeaveName: "Annual Leave",
              LeaveTypeID: "annual",
              NumberOfUnits: balance,
              TypeOfUnits: "Hours",
            },
          ],
        },
      ],
    }),
    { status: 200 }
  );
}
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ Message: message }), {
    status,
    statusText: message,
  });
}
function leaveApplicationsResponse(ids: string[]): Response {
  return new Response(
    JSON.stringify({
      LeaveApplications: ids.map((id) => ({
        EmployeeID: "00000000-0000-4000-8000-000000000001",
        EndDate: "2026-05-08",
        LeaveApplicationID: id,
        LeavePeriods: [{ NumberOfUnits: 7.6 }],
        LeaveTypeID: "annual",
        StartDate: "2026-05-07",
        Status: "APPROVED",
      })),
    }),
    { status: 200 }
  );
}
function payItemsResponse(): Response {
  return new Response(
    JSON.stringify({
      PayItems: {
        LeaveTypes: [
          {
            LeaveTypeID: "annual",
            Name: "Annual Leave",
          },
        ],
      },
    }),
    { status: 200 }
  );
}
function employeeListResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ Employees: items }), { status: 200 });
}
function validEmployeeItem(employeeId: string, overrides: object = {}) {
  return {
    EmployeeID: employeeId,
    FirstName: "First",
    LastName: "Last",
    Status: "ACTIVE",
    ...overrides,
  };
}
describe("AU employee reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    restoreEncryptionKey();
  });
  it("marks a single short page as complete and preserves valid neighbours of a malformed record", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      employeeListResponse([
        validEmployeeItem("11111111-1111-4111-8111-111111111111"),
        // Malformed: not an object at all.
        null,
        validEmployeeItem("22222222-2222-4222-8222-222222222222"),
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchEmployees({ xeroConnection: buildXeroTenant() });
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
    // Raw item count uses the raw page length, not the valid employee count.
    expect(result.value.rawItemCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("uses raw page length, not valid employee count, to continue pagination", async () => {
    // A full page (100 raw items) where half fail to map must still be
    // treated as a full page and trigger a second fetch.
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
    const result = await fetchEmployees({ xeroConnection: buildXeroTenant() });
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
      expect.stringContaining("/Employees?page=1"),
      expect.stringContaining("/Employees?page=2"),
    ]);
  });
  it("returns complete: false and preserves gathered employees when a page envelope cannot be read", async () => {
    // A full first page forces pagination to continue; the second page's
    // envelope (Employees is not an array) cannot be read.
    const fullFirstPage = Array.from({ length: 100 }, (_, index) =>
      validEmployeeItem(
        `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`
      )
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(employeeListResponse(fullFirstPage))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Employees: "not an array" }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchEmployees({ xeroConnection: buildXeroTenant() });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.complete).toBe(false);
    expect(result.value.employees).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("returns an incident without dispatch when resolved access is missing", async () => {
    const tenant = buildXeroTenant();
    tenant.accessToken = "";
    await expect(
      fetchEmployees({ xeroConnection: tenant })
    ).resolves.toMatchObject({
      error: {
        code: "unknown_error",
        dispatchPhase: "before_dispatch",
        message: "Xero access is unavailable.",
        recoveryReason: "operational_incident",
      },
      ok: false,
    });
  });
});
describe("AU leave record reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    restoreEncryptionKey();
  });
  it("accumulates a full page and a following short page", async () => {
    const firstPageIds = Array.from(
      { length: 100 },
      (_, index) => `leave-${index + 1}`
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(payItemsResponse())
      .mockResolvedValueOnce(leaveApplicationsResponse(firstPageIds))
      .mockResolvedValueOnce(leaveApplicationsResponse(["leave-101"]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      xeroConnection: buildXeroTenant(),
    });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.complete).toBe(true);
      expect(
        result.value.leaveRecords.map((record) => record.leaveApplicationId)
      ).toEqual([...firstPageIds, "leave-101"]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining("/PayItems"),
      expect.stringContaining("/LeaveApplications/v2?page=1"),
      expect.stringContaining("/LeaveApplications/v2?page=2"),
    ]);
  });
  it("marks a single short page as complete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(payItemsResponse())
      .mockResolvedValueOnce(leaveApplicationsResponse(["leave-1"]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      xeroConnection: buildXeroTenant(),
    });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value).toMatchObject({
        complete: true,
        leaveRecords: [
          expect.objectContaining({ leaveApplicationId: "leave-1" }),
        ],
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (result.ok) {
      expect(result.value.leaveRecords[0]?.leaveTypeName).toBe("Annual Leave");
    }
  });
  it("fails before reading leave applications when AU leave-type metadata is invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      xeroConnection: buildXeroTenant(),
    });
    expect(result).toMatchObject({
      error: {
        code: "validation_error",
        message: "Xero returned invalid AU payroll leave types.",
      },
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("handles a complete empty response as complete: true with zero records", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(payItemsResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ LeaveApplications: [] }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        complete: true,
        failures: [],
        hasInvalidRecords: false,
        leaveRecords: [],
        rawItemCount: 0,
        traversalOutcome: "completed",
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("returns complete: false and envelope_error when the first leave page envelope is malformed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(payItemsResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ LeaveApplications: "not-an-array" }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        complete: false,
        hasInvalidRecords: true,
        leaveRecords: [],
        traversalOutcome: "envelope_error",
      });
    }
  });
  it("returns complete: false and retains gathered records when a middle page envelope is malformed", async () => {
    const firstPageIds = Array.from(
      { length: 100 },
      (_, index) => `leave-${index + 1}`
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(payItemsResponse())
      .mockResolvedValueOnce(leaveApplicationsResponse(firstPageIds))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ LeaveApplications: "invalid" }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complete).toBe(false);
      expect(result.value.traversalOutcome).toBe("envelope_error");
      expect(result.value.leaveRecords).toHaveLength(100);
      expect(result.value.hasInvalidRecords).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("advances pages using raw item count when page has malformed rows and marks complete: false", async () => {
    // 98 valid + 2 invalid = 100 raw items on page 1.
    // If parsed records length were used (98 < 100), pagination would stop prematurely.
    // Raw item count (100) ensures page 2 is fetched.
    const page1ValidIds = Array.from(
      { length: 98 },
      (_, i) => `valid-${i + 1}`
    );
    const page1Items = [
      ...page1ValidIds.map((id) => ({
        EmployeeID: "00000000-0000-4000-8000-000000000001",
        EndDate: "2026-05-08",
        LeaveApplicationID: id,
        LeavePeriods: [{ NumberOfUnits: 7.6 }],
        LeaveTypeID: "annual",
        StartDate: "2026-05-07",
        Status: "APPROVED",
      })),
      { LeaveApplicationID: "bad-row-1", LeavePeriods: "not-an-array" },
      "not an object at all",
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(payItemsResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ LeaveApplications: page1Items }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(leaveApplicationsResponse(["valid-101"]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complete).toBe(false); // malformed rows prevent trustworthy complete
      expect(result.value.hasInvalidRecords).toBe(true);
      expect(result.value.traversalOutcome).toBe("malformed_rows");
      expect(result.value.rawItemCount).toBe(101);
      expect(result.value.leaveRecords).toHaveLength(99); // 98 from page 1 + 1 from page 2
      expect(result.value.failures).toHaveLength(2);
      expect(result.value.failures[0]?.rawLeaveApplicationId).toBe("bad-row-1");
    }
    expect(fetchMock).toHaveBeenCalledTimes(3); // Verified that page 2 was fetched!
  });
  it("stops at page limit and marks traversalOutcome: page_limit_exceeded with complete: false", async () => {
    const fullPageIds = Array.from({ length: 100 }, (_, i) => `page-item-${i}`);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/PayItems")) {
        return Promise.resolve(payItemsResponse());
      }
      return Promise.resolve(leaveApplicationsResponse(fullPageIds));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveRecords({
      maxPages: 2,
      xeroConnection: buildXeroTenant("page-limit-tenant"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complete).toBe(false);
      expect(result.value.traversalOutcome).toBe("page_limit_exceeded");
      expect(result.value.leaveRecords).toHaveLength(2 * 100);
    }
    // 1 PayItems + 2 pages
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
describe("AU leave balance reads", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    restoreEncryptionKey();
  });
  it("reads balances for every employee and reports no failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(employeeResponse("emp-1", 76))
      .mockResolvedValueOnce(employeeResponse("emp-2", 10));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveBalances({
      employeeIds: ["emp-1", "emp-2"],
      readIntervalMs: 0,
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toHaveLength(2);
      expect(result.value.failures).toEqual([]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, request] of fetchMock.mock.calls) {
      expect(new Headers(request?.headers).get("Authorization")).toBe(
        "Bearer access-token"
      );
    }
  });
  it("isolates a single not-found employee and keeps the other balances", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(employeeResponse("emp-1", 76))
      .mockResolvedValueOnce(errorResponse(404, "Employee not found"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveBalances({
      employeeIds: ["emp-1", "emp-2"],
      readIntervalMs: 0,
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toHaveLength(1);
      expect(result.value.failures).toEqual([
        expect.objectContaining({
          employeeId: "emp-2",
          error: expect.objectContaining({ code: "not_found_error" }),
        }),
      ]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("aborts the whole fetch on an auth error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401, "Unauthorised"))
      .mockResolvedValueOnce(employeeResponse("emp-2", 10));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveBalances({
      employeeIds: ["emp-1", "emp-2"],
      readIntervalMs: 0,
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("auth_error");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("aborts the whole fetch on a permission error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(403, "Forbidden"))
      .mockResolvedValueOnce(employeeResponse("emp-2", 80));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveBalances({
      employeeIds: ["emp-1", "emp-2"],
      readIntervalMs: 0,
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("permission_error");
      expect(result.error.httpStatus).toBe(403);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("aborts the whole fetch on a rate-limit error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, "Too many requests"))
      .mockResolvedValueOnce(employeeResponse("emp-2", 10));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchLeaveBalances({
      employeeIds: ["emp-1", "emp-2"],
      readIntervalMs: 0,
      xeroConnection: buildXeroTenant(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("returns an incident without dispatch when resolved access is missing", async () => {
    const tenant = buildXeroTenant();
    tenant.accessToken = "";
    await expect(
      fetchLeaveRecords({ xeroConnection: tenant })
    ).resolves.toMatchObject({
      error: {
        code: "unknown_error",
        dispatchPhase: "before_dispatch",
        message: "Xero access is unavailable.",
        recoveryReason: "operational_incident",
      },
      ok: false,
    });
  });
});
describe("161g AU scoped read evidence", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps read capability usable after write permission failure", async () => {
    const module = await import("./write");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 403 }))
      .mockResolvedValueOnce(new Response('{"Employees":[]}'));
    vi.stubGlobal("fetch", fetchMock);
    const current = buildXeroTenant();
    expect(
      await module.approveLeaveApplication({
        xeroConnection: current,
        xeroEmployeeId: "employee",
        xeroLeaveApplicationId: "leave",
      })
    ).toMatchObject({ error: { recoveryReason: "access_denied" }, ok: false });
    expect((await fetchEmployees({ xeroConnection: current })).ok).toBe(true);
  });
  it("keeps a sibling tenant usable after a403 without mutating either binding", async () => {
    const first = buildXeroTenant();
    const sibling = {
      ...buildXeroTenant(),
      id: "sibling-binding",
      xero_tenant_id: "sibling-payroll",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 403 }))
      .mockResolvedValueOnce(new Response('{"Employees":[]}'));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchEmployees({ xeroConnection: first })).toMatchObject({
      error: { recoveryReason: "access_denied" },
      ok: false,
    });
    expect((await fetchEmployees({ xeroConnection: sibling })).ok).toBe(true);
    expect(first).toMatchObject({
      accessToken: "access-token",
      id: "tenant_1",
    });
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Xero-Tenant-Id")
    ).toBe("sibling-payroll");
  });
});
