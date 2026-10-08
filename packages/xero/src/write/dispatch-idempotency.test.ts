import type { XeroMutationIdentity } from "@repo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  currentAccess: undefined as ReturnType<typeof freshAccess> | undefined,
  resolveXeroAccess: vi.fn(),
  verifyXeroProviderConnection: vi.fn(),
}));
vi.mock("../oauth/authorisation", () => ({
  resolveXeroAccess: async (scope: {
    previousAccessToken?: string;
    deadline: { expiresAtMs: number };
  }) => {
    if (scope.previousAccessToken !== undefined) {
      const result = await mocks.resolveXeroAccess(scope);
      if (result?.ok) {
        mocks.currentAccess = result;
      }
      return result;
    }
    return (
      mocks.currentAccess ?? {
        ok: true,
        value: {
          accessToken: "old-access",
          connectionId: "connection-1",
          deadline: scope.deadline,
          payrollRegion: "AU",
          xeroTenantId: "xero-tenant-1",
        },
      }
    );
  },
}));
vi.mock("../oauth/provider-connection", () => ({
  verifyXeroProviderConnection: mocks.verifyXeroProviderConnection,
}));

import { approveLeaveApplicationForRegion } from "./dispatch";

function input() {
  const now = Date.now();
  const mutation: XeroMutationIdentity = {
    firstDispatchedAt: new Date(now),
    idempotencyKey: "3890e6b4-47d0-40b9-ad47-c802f92c836a",
    replayBefore: new Date(now + 300_000),
    request: {
      body: null,
      method: "POST",
      url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications/leave-1/approve",
      xeroTenantId: "xero-tenant-1",
    },
  };
  return {
    mutation,
    xeroConnection: {
      accessToken: "old-access",
      clerk_org_id: "org_1",
      deadline: { expiresAtMs: now + 120_000 },
      id: "connection-1",
      organisation_id: "organisation-1",
      payroll_region: "AU" as const,
      xero_tenant_id: "xero-tenant-1",
    },
    xeroEmployeeId: "employee-1",
    xeroLeaveApplicationId: "leave-1",
  };
}
function freshAccess(xeroTenantId = "xero-tenant-1") {
  return {
    ok: true,
    value: {
      accessToken: "new-access",
      connectionId: "connection-1",
      deadline: { expiresAtMs: Date.now() + 120_000 },
      payrollRegion: "AU",
      xeroTenantId,
    },
  };
}

beforeEach(() => {
  mocks.currentAccess = undefined;
});

describe("journaled AU authentication replay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("refreshes a definite401 and replays the exact recorded request and key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"LeaveApplications":[{"LeaveApplicationID":"leave-1"}]}')
      );
    vi.stubGlobal("fetch", fetchMock);
    mocks.resolveXeroAccess.mockResolvedValueOnce(freshAccess());
    const request = input();
    expect((await approveLeaveApplicationForRegion("AU", request)).ok).toBe(
      true
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const headers = fetchMock.mock.calls.map(
      ([, init]) => new Headers(init.headers)
    );
    expect(headers[0]?.get("Authorization")).toBe("Bearer old-access");
    expect(headers[1]?.get("Authorization")).toBe("Bearer new-access");
    for (const [index, [url, init]] of fetchMock.mock.calls.entries()) {
      expect(url).toBe(request.mutation.request.url);
      expect(init.method).toBe("POST");
      expect(init.body).toBeUndefined();
      expect(headers[index]?.get("Idempotency-Key")).toBe(
        request.mutation.idempotencyKey
      );
      expect(headers[index]?.get("Xero-Tenant-Id")).toBe("xero-tenant-1");
    }
    expect(mocks.resolveXeroAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-1",
        previousAccessToken: "old-access",
      })
    );
  });
  it("refuses a changed tenant after authentication refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.resolveXeroAccess.mockResolvedValueOnce(
      freshAccess("changed-tenant")
    );
    expect(await approveLeaveApplicationForRegion("AU", input())).toMatchObject(
      {
        error: {
          dispatchPhase: "before_dispatch",
          recoveryReason: "outcome_unknown",
        },
        ok: false,
      }
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

it("keeps the original journal key when the caller changes its input during401 recovery", async () => {
  const request = input();
  const originalKey = request.mutation.idempotencyKey;
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(() => {
      request.mutation.idempotencyKey = "a-new-key";
      return Promise.resolve(new Response("", { status: 401 }));
    })
    .mockResolvedValueOnce(
      new Response('{"LeaveApplications":[{"LeaveApplicationID":"leave-1"}]}')
    );
  vi.stubGlobal("fetch", fetchMock);
  mocks.resolveXeroAccess.mockResolvedValueOnce(freshAccess());
  try {
    expect((await approveLeaveApplicationForRegion("AU", request)).ok).toBe(
      true
    );
    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init.headers).get("Idempotency-Key")
    );
    expect(keys).toEqual([originalKey, originalKey]);
  } finally {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  }
});

it("shares at most four payroll attempts across a definite401 credential replay", async () => {
  let calls = 0;
  const fetchMock = vi.fn(() => {
    calls += 1;
    return Promise.resolve(
      new Response("", { status: calls === 1 ? 401 : 503 })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  mocks.resolveXeroAccess.mockResolvedValueOnce(freshAccess());
  try {
    expect((await approveLeaveApplicationForRegion("AU", input())).ok).toBe(
      false
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init.headers).get("Idempotency-Key")
    );
    expect(new Set(keys).size).toBe(1);
  } finally {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  }
});

it("keeps earlier ambiguous dispatches unresolved when a later retry returns401", async () => {
  let calls = 0;
  const fetchMock = vi.fn(() => {
    calls += 1;
    return Promise.resolve(
      new Response("", { status: calls === 3 ? 401 : 503 })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    expect(await approveLeaveApplicationForRegion("AU", input())).toMatchObject(
      {
        error: {
          dispatchPhase: "after_dispatch",
          recoveryReason: "outcome_unknown",
        },
        ok: false,
      }
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.resolveXeroAccess).not.toHaveBeenCalled();
    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init.headers).get("Idempotency-Key")
    );
    expect(new Set(keys).size).toBe(1);
  } finally {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  }
});
