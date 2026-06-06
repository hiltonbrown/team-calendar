import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLeaveBalances } from "./read";

const xeroTenant = {
  clerk_org_id: "org_1",
  id: "tenant_1",
  organisation_id: "00000000-0000-4000-8000-000000000001",
  payroll_region: "AU" as const,
  xero_connection: {
    access_token_encrypted: "access-token",
    revoked_at: null,
  },
  xero_tenant_id: "xero-tenant-1",
};

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

describe("AU leave balance reads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      xeroTenant,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.leaveBalances).toHaveLength(2);
      expect(result.value.failures).toEqual([]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      xeroTenant,
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
      xeroTenant,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("auth_error");
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
      xeroTenant,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limit_error");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
