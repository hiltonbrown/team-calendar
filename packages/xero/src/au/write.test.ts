import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveLeaveApplication,
  declineLeaveApplication,
  submitLeaveApplication,
  withdrawLeaveApplication,
} from "./write";

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

describe("AU payroll write path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits leave and returns the Xero leave application ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          LeaveApplications: [{ LeaveApplicationID: "leave-1" }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitLeaveApplication({
      endsAt: new Date("2026-05-05T00:00:00.000Z"),
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
      units: 2,
      xeroEmployeeId: "employee-1",
      xeroLeaveTypeId: "type-1",
      xeroTenant,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.xeroLeaveApplicationId).toBe("leave-1");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
      expect.objectContaining({ method: "POST" })
    );
  });

  it.each([
    [400, "validation_error"],
    [401, "auth_error"],
    [403, "auth_error"],
    [404, "not_found_error"],
    [409, "conflict_error"],
    [429, "rate_limit_error"],
    [500, "unknown_error"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      // Return a fresh Response per call so retried transient statuses do not
      // reuse a body that an earlier attempt already cancelled.
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ Message: "Xero error" }), {
            status,
            statusText: "Failed",
          })
        )
      )
    );

    const result = await submitLeaveApplication({
      endsAt: new Date("2026-05-05T00:00:00.000Z"),
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
      units: 2,
      xeroEmployeeId: "employee-1",
      xeroLeaveTypeId: "type-1",
      xeroTenant,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });

  it("maps network failure to network_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await submitLeaveApplication({
      endsAt: new Date("2026-05-05T00:00:00.000Z"),
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
      units: 2,
      xeroEmployeeId: "employee-1",
      xeroLeaveTypeId: "type-1",
      xeroTenant,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("network_error");
    }
  });

  it("approves leave through Xero", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await approveLeaveApplication({
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-1/approve",
      expect.objectContaining({ method: "POST" })
    );
  });

  it.each([
    [400, "validation_error"],
    [401, "auth_error"],
    [403, "auth_error"],
    [404, "not_found_error"],
    [409, "conflict_error"],
    [429, "rate_limit_error"],
    [500, "unknown_error"],
  ] as const)("maps approve HTTP %s to %s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      // Return a fresh Response per call so retried transient statuses do not
      // reuse a body that an earlier attempt already cancelled.
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ Message: "Xero error" }), {
            status,
            statusText: "Failed",
          })
        )
      )
    );

    const result = await approveLeaveApplication({
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });

  it("declines with reason and withdraws through Xero", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const declineResult = await declineLeaveApplication({
      reason: "Not enough balance",
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant,
    });
    await withdrawLeaveApplication({
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant,
    });

    expect(declineResult.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-1/reject",
      expect.objectContaining({
        body: JSON.stringify({ Reason: "Not enough balance" }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, "validation_error"],
    [401, "auth_error"],
    [403, "auth_error"],
    [404, "not_found_error"],
    [409, "conflict_error"],
    [429, "rate_limit_error"],
    [500, "unknown_error"],
  ] as const)("maps decline HTTP %s to %s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      // Return a fresh Response per call so retried transient statuses do not
      // reuse a body that an earlier attempt already cancelled.
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ Message: "Xero error" }), {
            status,
            statusText: "Failed",
          })
        )
      )
    );

    const result = await declineLeaveApplication({
      reason: "Not enough balance",
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });
});
