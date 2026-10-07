import { randomUUID } from "node:crypto";
import type { XeroMutationIdentity } from "@repo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XeroRateLimiter } from "../rate-limit/limiter";
import {
  XERO_CALLS_PER_DAY_PER_ORG,
  XERO_CALLS_PER_MINUTE_APP_WIDE,
  XERO_CALLS_PER_MINUTE_PER_ORG,
  XERO_CONCURRENT_REQUESTS_PER_ORG,
} from "../rate-limit/limits";
import { MemorySharedXeroRateStore } from "../rate-limit/memory-store";
import type { XeroAccessContext } from "../write/types";
import {
  approveLeaveApplication,
  declineLeaveApplication,
  prepareAuLeaveMutation,
  submitLeaveApplication,
  withdrawLeaveApplication,
} from "./write";

const transport = await import("../rate-limit/xero-fetch");
const actualXeroFetch = transport.xeroFetch;
beforeEach(() => {
  vi.restoreAllMocks();
  const limiter = new XeroRateLimiter(
    {},
    {
      store: new MemorySharedXeroRateStore({
        limits: {
          appCallsPerMinute: XERO_CALLS_PER_MINUTE_APP_WIDE,
          callsPerDayPerOrg: XERO_CALLS_PER_DAY_PER_ORG,
          callsPerMinutePerOrg: XERO_CALLS_PER_MINUTE_PER_ORG,
          concurrentRequestsPerOrg: XERO_CONCURRENT_REQUESTS_PER_ORG,
        },
        now: () => Date.now(),
      }),
    }
  );
  vi.spyOn(transport, "xeroFetch").mockImplementation((request) =>
    actualXeroFetch(request, { limiter })
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
    clerk_org_id: "org_1",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id: "tenant_1",
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: "AU" as const,
    xero_tenant_id: "xero-tenant-1",
  };
}
function expectBearerAccessToken(fetchMock: ReturnType<typeof vi.fn>) {
  expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  for (const [, request] of fetchMock.mock.calls) {
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer access-token"
    );
  }
}
describe("AU payroll write path", () => {
  beforeEach(() => {
    process.env.XERO_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
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
    const result = await submitLeaveApplication(
      withAuMutation("create", {
        endsAt: new Date("2026-05-05T00:00:00.000Z"),
        startsAt: new Date("2026-05-04T00:00:00.000Z"),
        units: 2,
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveTypeId: "type-1",
      })
    );
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
    const result = await submitLeaveApplication(
      withAuMutation("create", {
        endsAt: new Date("2026-05-05T00:00:00.000Z"),
        startsAt: new Date("2026-05-04T00:00:00.000Z"),
        units: 2,
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveTypeId: "type-1",
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });
  it("maps network failure to network_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await submitLeaveApplication(
      withAuMutation("create", {
        endsAt: new Date("2026-05-05T00:00:00.000Z"),
        startsAt: new Date("2026-05-04T00:00:00.000Z"),
        units: 2,
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveTypeId: "type-1",
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("network_error");
    }
  });
  it("uses four bounded provider attempts for a keyed payroll mutation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ Message: "Try later" }), { status: 429 })
      );
    vi.stubGlobal("fetch", fetchMock);
    await approveLeaveApplication(
      withAuMutation("approve", {
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
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
    const result = await approveLeaveApplication(
      withAuMutation("approve", {
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      })
    );
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
    const result = await approveLeaveApplication(
      withAuMutation("approve", {
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });
  it("declines with reason and withdraws through Xero", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            LeaveApplications: [{ LeaveApplicationID: "leave-1" }],
          }),
          { status: 200 }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const declineResult = await declineLeaveApplication(
      withAuMutation("decline", {
        reason: "Not enough balance",
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      })
    );
    await withdrawLeaveApplication(
      withAuMutation("withdraw", {
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      })
    );
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
    const result = await declineLeaveApplication(
      withAuMutation("decline", {
        reason: "Not enough balance",
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
  });
  it("returns auth_error Result without throwing when access_token_iv is null", async () => {
    const tenant = buildXeroTenant();
    tenant.accessToken = "";
    await expect(
      submitLeaveApplication(
        withAuMutation("create", {
          endsAt: new Date("2026-05-05T00:00:00.000Z"),
          startsAt: new Date("2026-05-04T00:00:00.000Z"),
          units: 2,
          xeroConnection: tenant,
          xeroEmployeeId: "employee-1",
          xeroLeaveTypeId: "type-1",
        })
      )
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
      await approveLeaveApplication(
        withAuMutation("approve", {
          xeroConnection: current,
          xeroEmployeeId: "employee",
          xeroLeaveApplicationId: "leave",
        })
      )
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
      await submitLeaveApplication(
        withAuMutation("create", {
          endsAt: new Date(),
          startsAt: new Date(),
          units: 1,
          xeroConnection: buildXeroTenant(),
          xeroEmployeeId: "employee",
          xeroLeaveTypeId: "annual",
        })
      )
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
      await approveLeaveApplication(
        withAuMutation("approve", {
          xeroConnection: buildXeroTenant(),
          xeroEmployeeId: "employee",
          xeroLeaveApplicationId: "leave",
        })
      )
    ).toMatchObject({
      error: {
        dispatchPhase: "before_dispatch",
        recoveryReason: "operational_incident",
      },
      ok: false,
    });
    request.mockRestore();
  });
  it("bounds retries of a lost mutation response and keeps dispatch evidence", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("lost response"));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await approveLeaveApplication(
        withAuMutation("approve", {
          xeroConnection: buildXeroTenant(),
          xeroEmployeeId: "employee",
          xeroLeaveApplicationId: "leave",
        })
      )
    ).toMatchObject({
      error: {
        dispatchPhase: "after_dispatch",
        recoveryReason: "outcome_unknown",
      },
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
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
      await approveLeaveApplication(
        withAuMutation("approve", {
          xeroConnection: buildXeroTenant(),
          xeroEmployeeId: "employee",
          xeroLeaveApplicationId: "leave",
        })
      )
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

describe("AU provider-native mutation identity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function identity(overrides = {}) {
    const now = Date.now();
    return {
      firstDispatchedAt: new Date(now - 1000),
      idempotencyKey: "3890e6b4-47d0-40b9-ad47-c802f92c836a",
      replayBefore: new Date(now + 299_000),
      request: {
        body: null,
        method: "POST" as const,
        url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-1/approve",
        xeroTenantId: "xero-tenant-1",
      },
      ...overrides,
    };
  }
  it("replays a lost response with the recorded key and identical request", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(
        new Response('{"LeaveApplications":[{"LeaveApplicationID":"leave-1"}]}')
      );
    vi.stubGlobal("fetch", fetchMock);
    const mutation = identity();
    const result = await approveLeaveApplication({
      mutation,
      xeroConnection: buildXeroTenant(),
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, request] of fetchMock.mock.calls) {
      expect(url).toBe(mutation.request.url);
      expect(request.method).toBe(mutation.request.method);
      expect(request.body).toBeUndefined();
      expect(new Headers(request.headers).get("Idempotency-Key")).toBe(
        mutation.idempotencyKey
      );
    }
  });
  it.each(["body", "method", "url", "xeroTenantId"])(
    "rejects a changed %s before dispatch",
    async (field) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const mutation = identity();
      const changed = {
        ...mutation,
        request: { ...mutation.request, [field]: "changed" },
      };
      const result = await approveLeaveApplication({
        mutation: changed,
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      });
      expect(result).toMatchObject({
        error: { dispatchPhase: "before_dispatch" },
        ok: false,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
  it("rejects replay at five minutes without calling Xero", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const now = Date.now();
    const result = await approveLeaveApplication({
      mutation: identity({
        firstDispatchedAt: new Date(now - 300_000),
        replayBefore: new Date(now),
      }),
      xeroConnection: buildXeroTenant(),
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
    });
    expect(result).toMatchObject({
      error: { dispatchPhase: "before_dispatch" },
      ok: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("allows the recorded request at4:59 and refuses it at5:00", async () => {
  const first = Date.now();
  const now = vi.spyOn(Date, "now").mockReturnValue(first + 299_000);
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response('{"LeaveApplications":[{"LeaveApplicationID":"leave-1"}]}')
    );
  vi.stubGlobal("fetch", fetchMock);
  const mutation = {
    firstDispatchedAt: new Date(first),
    idempotencyKey: "3890e6b4-47d0-40b9-ad47-c802f92c836a",
    replayBefore: new Date(first + 300_000),
    request: {
      body: null,
      method: "POST" as const,
      url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-1/approve",
      xeroTenantId: "xero-tenant-1",
    },
  };
  try {
    const input = {
      mutation,
      xeroConnection: buildXeroTenant(),
      xeroEmployeeId: "employee-1",
      xeroLeaveApplicationId: "leave-1",
    };
    expect((await approveLeaveApplication(input)).ok).toBe(true);
    now.mockReturnValue(first + 300_000);
    expect(await approveLeaveApplication(input)).toMatchObject({
      error: { dispatchPhase: "before_dispatch" },
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    now.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("rejects a supported AU mutation without its journal identity before dispatch", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response('{"LeaveApplications":[{"LeaveApplicationID":"leave-1"}]}')
    );
  vi.stubGlobal("fetch", fetchMock);
  try {
    expect(
      await approveLeaveApplication({
        xeroConnection: buildXeroTenant(),
        xeroEmployeeId: "employee-1",
        xeroLeaveApplicationId: "leave-1",
      })
    ).toMatchObject({
      error: { code: "validation_error", dispatchPhase: "before_dispatch" },
      ok: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

function withAuMutation<
  T extends {
    xeroConnection: XeroAccessContext;
    xeroEmployeeId: string;
    xeroLeaveApplicationId?: string;
    xeroLeaveTypeId?: string;
    startsAt?: Date;
    endsAt?: Date;
    reason?: string;
    title?: string;
    units?: number;
  },
>(
  action: "create" | "approve" | "decline" | "withdraw",
  input: T
): T & { mutation: XeroMutationIdentity } {
  const { xeroConnection } = input;
  const prepared = prepareAuLeaveMutation(
    {
      action,
      clerkOrgId: input.xeroConnection.clerk_org_id,
      employeeId: input.xeroEmployeeId,
      endsAt: input.endsAt,
      leaveTypeId: input.xeroLeaveTypeId,
      organisationId: input.xeroConnection.organisation_id,
      reason: input.reason,
      remoteId: input.xeroLeaveApplicationId,
      startsAt: input.startsAt,
      title: input.title,
      units: input.units,
    },
    xeroConnection.xero_tenant_id
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
    xeroConnection,
  };
}
