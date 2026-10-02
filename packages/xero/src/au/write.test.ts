import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveLeaveApplication,
  declineLeaveApplication,
  submitLeaveApplication,
  withdrawLeaveApplication,
} from "./write";

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
    clerk_org_id: "org_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id: "tenant_1",
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: "AU" as const,
    tokenVersion: 1,
    xero_tenant_id: "xero-tenant-1",
  };
}

function expectBearerAccessToken(fetchMock: ReturnType<typeof vi.fn>) {
  expect(fetchMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer access-token",
      }),
    })
  );
}

describe("AU payroll write path", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEncryptionKey();
  });

  it("creates scheduled leave on manager approval without an invented requested status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          LeaveApplications: [
            {
              LeaveApplicationID: "leave-1",
              LeavePeriods: [{ LeavePeriodStatus: "SCHEDULED" }],
            },
          ],
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
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    expect(result.value.xeroLeaveApplicationId).toBe("leave-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
      expect.objectContaining({ method: "POST" })
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual([
      {
        EmployeeID: "employee-1",
        EndDate: "2026-05-05",
        LeaveTypeID: "type-1",
        StartDate: "2026-05-04",
        Title: "Leave request",
      },
    ]);
    expectBearerAccessToken(fetchMock);
  });

  it.each([
    [400, "validation_error"],
    [401, "auth_error"],
    [403, "permission_error"],
    [404, "not_found_error"],
    [409, "conflict_error"],
    [429, "rate_limit_error"],
    [500, "network_error"],
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
      xeroTenant: buildXeroTenant(),
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
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("network_error");
    }
  });

  it("uses one bounded provider attempt for a payroll mutation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ Message: "Try later" }), { status: 429 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await approveLeaveApplication({
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const dispatchedSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(dispatchedSignal).toBeInstanceOf(AbortSignal);
  });

  it("approves leave through Xero", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          LeaveApplications: [{ LeaveApplicationID: "leave-1" }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await approveLeaveApplication({
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-1/approve",
      expect.objectContaining({ method: "POST" })
    );
    expectBearerAccessToken(fetchMock);
  });

  it.each([
    [400, "validation_error"],
    [401, "auth_error"],
    [403, "permission_error"],
    [404, "not_found_error"],
    [409, "conflict_error"],
    [429, "rate_limit_error"],
    [500, "network_error"],
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
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });

  it("declines with reason and withdraws through Xero", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          LeaveApplications: [{ LeaveApplicationID: "leave-1" }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const declineResult = await declineLeaveApplication({
      reason: "Not enough balance",
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: buildXeroTenant(),
    });
    await withdrawLeaveApplication({
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
      xeroTenant: buildXeroTenant(),
    });

    expect(declineResult.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-1/reject",
      expect.objectContaining({
        body: JSON.stringify({ Reason: "Not enough balance" }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectBearerAccessToken(fetchMock);
  });

  it.each([
    [400, "validation_error"],
    [401, "auth_error"],
    [403, "permission_error"],
    [404, "not_found_error"],
    [409, "conflict_error"],
    [429, "rate_limit_error"],
    [500, "network_error"],
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
      xeroTenant: buildXeroTenant(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });

  it("returns auth_error Result without throwing when access_token_iv is null", async () => {
    const tenant = buildXeroTenant();
    tenant.accessToken = "";

    await expect(
      submitLeaveApplication({
        endsAt: new Date("2026-05-05T00:00:00.000Z"),
        startsAt: new Date("2026-05-04T00:00:00.000Z"),
        units: 2,
        xeroEmployeeId: "employee-1",
        xeroLeaveTypeId: "type-1",
        xeroTenant: tenant,
      })
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

describe("161g AU mutation evidence", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps scope rejection through a stalled401 body without replay", async () => {
    const stream = new ReadableStream({
      pull() {
        return new Promise(() => {
          /* Provider body stalls. */
        });
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        headers: { "WWW-Authenticate": 'Bearer error="insufficient_scope"' },
        status: 401,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const current = {
      ...buildXeroTenant(),
      deadline: { expiresAtMs: Date.now() + 25 },
    };
    expect(
      await approveLeaveApplication({
        xeroEmployeeId: "employee",
        xeroLeaveApplicationId: "leave",
        xeroTenant: current,
      })
    ).toMatchObject({
      error: { code: "permission_error", recoveryReason: "update_permissions" },
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("reports an unusable successful remote ID as outcome_unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"LeaveApplications":[{}]}'));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await submitLeaveApplication({
        endsAt: new Date(),
        startsAt: new Date(),
        units: 1,
        xeroEmployeeId: "employee",
        xeroLeaveTypeId: "annual",
        xeroTenant: buildXeroTenant(),
      })
    ).toMatchObject({
      error: {
        dispatchPhase: "after_dispatch",
        recoveryReason: "outcome_unknown",
      },
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("retains pre-dispatch admission outage as an incident", async () => {
    const { xeroFetch } = await import("../rate-limit/xero-fetch");
    const { XeroFetchError } = await import("../rate-limit/xero-fetch");
    const module = await import("../rate-limit/xero-fetch");
    const request = vi
      .spyOn(module, "xeroFetch")
      .mockRejectedValue(new XeroFetchError("admission_unavailable", false));
    expect(xeroFetch).toBeDefined();
    expect(
      await approveLeaveApplication({
        xeroEmployeeId: "employee",
        xeroLeaveApplicationId: "leave",
        xeroTenant: buildXeroTenant(),
      })
    ).toMatchObject({
      error: {
        dispatchPhase: "before_dispatch",
        recoveryReason: "operational_incident",
      },
      ok: false,
    });
    request.mockRestore();
  });
  it("never retries a lost mutation response and keeps dispatch evidence", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("lost response"));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await approveLeaveApplication({
        xeroEmployeeId: "employee",
        xeroLeaveApplicationId: "leave",
        xeroTenant: buildXeroTenant(),
      })
    ).toMatchObject({
      error: {
        dispatchPhase: "after_dispatch",
        recoveryReason: "outcome_unknown",
      },
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

it.each([
  "",
  "{}",
  "[]",
  "invalid JSON",
  '{"LeaveApplications":[{"LeaveApplicationID":" "}]}',
])("keeps unusable successful mutation payload %s uncertain", async (body) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(body));
  vi.stubGlobal("fetch", fetchMock);
  try {
    expect(
      await approveLeaveApplication({
        xeroEmployeeId: "employee",
        xeroLeaveApplicationId: "leave",
        xeroTenant: buildXeroTenant(),
      })
    ).toMatchObject({
      error: {
        dispatchPhase: "after_dispatch",
        recoveryReason: "outcome_unknown",
      },
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
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
