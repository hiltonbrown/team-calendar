import { beforeEach, describe, expect, it, vi } from "vitest";
import type { XeroAccessContext, XeroWriteError } from "../write/types";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("../oauth/authorisation", () => ({
  resolveXeroAccess: mocks.resolve,
}));

import { executeWithXeroAuthRecovery } from "./auth-recovery";

function tenant(): XeroAccessContext {
  return {
    accessToken: "old-token",
    capability: "payroll.employees",
    clerk_org_id: "clerk",
    deadline: { expiresAtMs: Date.now() + 120_000 },
    id: "binding",
    organisation_id: "organisation",
    payroll_region: "AU",
    xero_tenant_id: "payroll-file",
  };
}
function rejected(error: Partial<XeroWriteError> = {}) {
  return {
    error: {
      code: "auth_error" as const,
      httpStatus: 401,
      message: "Rejected",
      recoveryReason: "reauthorise" as const,
      ...error,
    },
    ok: false as const,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockImplementation(async (input) => ({
    ok: true,
    value: {
      accessToken: "new-token",
      connectionId: "binding",
      deadline: input.deadline,
      payrollRegion: "AU",
      xeroTenantId: "payroll-file",
    },
  }));
});
describe("bounded Xero auth recovery", () => {
  it("refreshes once on definite401 and retries with the same absolute deadline", async () => {
    const current = tenant();
    const operation = vi
      .fn()
      .mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce({ ok: true, value: "done" });
    expect(await executeWithXeroAuthRecovery(current, operation, true)).toEqual(
      { ok: true, value: "done" }
    );
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "clerk",
        deadline: current.deadline,
        forceRefresh: true,
        organisationId: "organisation",
      })
    );
    expect(operation).toHaveBeenCalledTimes(2);
    expect(operation.mock.calls[1]?.[0]).toMatchObject({
      accessToken: "new-token",
      deadline: current.deadline,
    });
  });
  it.each([
    ["scope401", { recoveryReason: "update_permissions" }],
    [
      "generic403",
      {
        code: "permission_error",
        httpStatus: 403,
        recoveryReason: "access_denied",
      },
    ],
    ["uncertain401", { recoveryReason: "outcome_unknown" }],
    ["pre-dispatch401", { dispatchPhase: "before_dispatch" }],
    [
      "ambiguous network",
      {
        code: "network_error",
        httpStatus: undefined,
        recoveryReason: "outcome_unknown",
      },
    ],
  ] as const)("never refreshes or replays %s", async (_label, error) => {
    const failure = rejected(error);
    const operation = vi.fn().mockResolvedValue(failure);
    expect(
      await executeWithXeroAuthRecovery(tenant(), operation, true)
    ).toEqual(failure);
    expect(operation).toHaveBeenCalledOnce();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("classifies a scope failure on the single retry without further refresh", async () => {
    const second = rejected({
      code: "permission_error",
      recoveryReason: "update_permissions",
    });
    const operation = vi
      .fn()
      .mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce(second);
    expect(
      await executeWithXeroAuthRecovery(tenant(), operation, true)
    ).toEqual(second);
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledTimes(2);
  });
  it("returns reauthorise on the second401 without further refresh or state mutation", async () => {
    const operation = vi.fn().mockResolvedValue(rejected());
    expect(await executeWithXeroAuthRecovery(tenant(), operation)).toEqual(
      rejected()
    );
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledTimes(2);
  });
  it("retains an operational refresh failure as a definite non-attempt", async () => {
    mocks.resolve.mockResolvedValue({
      error: { code: "configuration_error", message: "Unavailable" },
      ok: false,
    });
    const operation = vi.fn().mockResolvedValue(rejected());
    expect(
      await executeWithXeroAuthRecovery(tenant(), operation, true)
    ).toMatchObject({
      error: {
        dispatchPhase: "before_dispatch",
        recoveryReason: "operational_incident",
      },
      ok: false,
    });
    expect(operation).toHaveBeenCalledOnce();
  });
  it("passes the rejected token for canonical concurrent-refresh comparison", async () => {
    const current = { ...tenant() };
    const operation = vi
      .fn()
      .mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce({ ok: true, value: null });
    await executeWithXeroAuthRecovery(current, operation);
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        previousAccessToken: "old-token",
      })
    );
  });
});
