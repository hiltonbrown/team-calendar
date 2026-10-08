import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  dispatchManualSync: vi.fn(),
  getXeroConnectionState: vi.fn(),
  reconcileXeroApprovalState: vi.fn(),
  requireOrg: vi.fn(),
  requireRole: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncXeroLeaveBalances: vi.fn(),
  syncXeroLeaveRecords: vi.fn(),
  syncXeroPeople: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
}));
vi.mock("@repo/auth/helpers", () => ({
  currentUser: mocks.currentUser,
  requireOrg: mocks.requireOrg,
  requireRole: mocks.requireRole,
}));
vi.mock("@repo/availability", () => ({
  dispatchManualSync: mocks.dispatchManualSync,
}));
vi.mock("@repo/database/queries/xero-connection-state", () => ({
  getXeroConnectionState: mocks.getXeroConnectionState,
}));
vi.mock("@repo/database", () => ({
  database: {
    syncRun: { findFirst: mocks.syncRunFindFirst },
    xeroConnection: { findFirst: mocks.xeroTenantFindFirst },
  },
}));
vi.mock("@repo/jobs", () => ({
  reconcileXeroApprovalState: mocks.reconcileXeroApprovalState,
  syncXeroLeaveBalances: mocks.syncXeroLeaveBalances,
  syncXeroLeaveRecords: mocks.syncXeroLeaveRecords,
  syncXeroPeople: mocks.syncXeroPeople,
}));
const { POST } = await import("./route");
const input = {
  connectionId: "00000000-0000-4000-8000-000000000002",
  organisationId: "00000000-0000-4000-8000-000000000001",
  runType: "people",
} as const;
function request(body: unknown): Request {
  return new Request("https://api.example.com/api/sync/dispatch", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
function successfulInlineResult() {
  return {
    ok: true,
    value: {
      failed: 0,
      fetched: 2,
      runId: "run_1",
      skipped: 0,
      status: "succeeded",
      upserted: 2,
    },
  } as const;
}
describe("manual sync dispatch route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getXeroConnectionState.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.xeroTenantFindFirst.mockResolvedValue({ id: input.connectionId });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    vi.stubEnv("NODE_ENV", "test");
    mocks.requireOrg.mockResolvedValue("org_123");
    mocks.currentUser.mockResolvedValue({ id: "user_123" });
    mocks.requireRole.mockImplementation((role: string) =>
      Promise.resolve(role === "org:admin")
    );
    mocks.dispatchManualSync.mockResolvedValue({
      ok: true,
      value: { eventName: "sync-xero-people", queued: true },
    });
    mocks.reconcileXeroApprovalState.mockResolvedValue(
      successfulInlineResult()
    );
    mocks.syncXeroLeaveBalances.mockResolvedValue(successfulInlineResult());
    mocks.syncXeroLeaveRecords.mockResolvedValue(successfulInlineResult());
    mocks.syncXeroPeople.mockResolvedValue(successfulInlineResult());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("rejects unauthenticated callers", async () => {
    mocks.requireOrg.mockRejectedValueOnce(new Error("No organisation"));
    const response = await POST(request(input));
    expect(response.status).toBe(401);
    expect(mocks.dispatchManualSync).not.toHaveBeenCalled();
  });
  it("rejects callers who are not admins or owners", async () => {
    mocks.requireRole.mockResolvedValue(false);
    const response = await POST(request(input));
    expect(response.status).toBe(403);
    expect(mocks.dispatchManualSync).not.toHaveBeenCalled();
  });
  it("validates the external request body", async () => {
    const response = await POST(request({ ...input, organisationId: "bad" }));
    expect(response.status).toBe(400);
    expect(mocks.dispatchManualSync).not.toHaveBeenCalled();
  });
  it("dispatches with both authenticated tenant identifiers", async () => {
    const response = await POST(request(input));
    expect(response.status).toBe(202);
    expect(mocks.dispatchManualSync).toHaveBeenCalledWith({
      actingRole: "admin",
      actingUserId: "user_123",
      clerkOrgId: "org_123",
      connectionId: input.connectionId,
      organisationId: input.organisationId,
      runType: "people",
    });
    expect(mocks.syncXeroPeople).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: { eventName: "sync-xero-people", queued: true },
    });
  });
  it("preserves a scoped service failure", async () => {
    mocks.dispatchManualSync.mockResolvedValueOnce({
      error: {
        code: "tenant_not_found",
        message: "Xero tenant was not found for this organisation.",
      },
      ok: false,
    });
    const response = await POST(request(input));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "tenant_not_found",
        message: "Xero tenant was not found for this organisation.",
      },
      ok: false,
    });
  });
  it.each([
    { handler: mocks.syncXeroPeople, runType: "people" },
    { handler: mocks.syncXeroLeaveRecords, runType: "leave_records" },
    { handler: mocks.syncXeroLeaveBalances, runType: "leave_balances" },
    {
      handler: mocks.reconcileXeroApprovalState,
      runType: "approval_state_reconciliation",
    },
  ] as const)(
    "executes the $runType handler once when local dispatch fails",
    async ({ handler, runType }) => {
      mocks.dispatchManualSync.mockResolvedValueOnce({
        error: {
          code: "dispatch_failed",
          message: "Failed to queue the sync job.",
        },
        ok: false,
      });
      const response = await POST(request({ ...input, runType }));
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        clerkOrgId: "org_123",
        connectionId: input.connectionId,
        organisationId: input.organisationId,
        triggeredByUserId: "user_123",
        triggerType: "manual",
      });
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        value: {
          failed: 0,
          fetched: 2,
          queued: true,
          runId: "run_1",
          status: "succeeded",
          upserted: 2,
        },
      });
    }
  );
  it.each(["disconnect_pending", "reauthorisation_required"] as const)(
    "does not run local fallback for %s",
    async (state) => {
      mocks.dispatchManualSync.mockResolvedValue({
        error: { code: "dispatch_failed", message: "Queue unavailable" },
        ok: false,
      });
      mocks.getXeroConnectionState.mockResolvedValue({
        ok: true,
        value: { state },
      });
      expect((await POST(request(input))).status).toBe(500);
      expect(mocks.syncXeroPeople).not.toHaveBeenCalled();
    }
  );
  it("does not run local fallback for a different scoped database tenant", async () => {
    mocks.dispatchManualSync.mockResolvedValue({
      error: { code: "dispatch_failed", message: "Queue unavailable" },
      ok: false,
    });
    mocks.xeroTenantFindFirst.mockResolvedValue(null);
    expect((await POST(request(input))).status).toBe(500);
    expect(mocks.syncXeroPeople).not.toHaveBeenCalled();
    expect(mocks.xeroTenantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clerk_org_id: "org_123",
          id: input.connectionId,
          organisation_id: input.organisationId,
        },
      })
    );
  });
  it("keeps production dispatch failures as 503 responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.dispatchManualSync.mockResolvedValueOnce({
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the sync job.",
      },
      ok: false,
    });
    const response = await POST(request(input));
    expect(response.status).toBe(503);
    expect(mocks.syncXeroPeople).not.toHaveBeenCalled();
  });
  it.each(["failed", "cancelled"] as const)(
    "does not report a locally executed %s run as successful",
    async (status) => {
      mocks.dispatchManualSync.mockResolvedValueOnce({
        error: {
          code: "dispatch_failed",
          message: "Failed to queue the sync job.",
        },
        ok: false,
      });
      mocks.syncXeroPeople.mockResolvedValueOnce({
        ok: true,
        value: {
          failed: 0,
          fetched: 0,
          runId: "run_failed",
          skipped: 0,
          status,
          upserted: 0,
        },
      });
      const response = await POST(request(input));
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "sync_failed",
          message: "Sync run failed or was cancelled.",
        },
        ok: false,
      });
    }
  );
  it.each([
    ["update_permissions", "Update Xero permissions to continue."],
    ["reauthorise", "Xero access needs to be renewed."],
    [
      "access_denied",
      "Xero declined this request. Check that the person who connected Xero still has payroll access.",
    ],
    ["raw provider detail", "Sync run failed or was cancelled."],
  ])(
    "translates only allowlisted terminal run reason %s",
    async (summary, message) => {
      mocks.dispatchManualSync.mockResolvedValue({
        error: { code: "dispatch_failed", message: "Queue unavailable" },
        ok: false,
      });
      mocks.syncXeroPeople.mockResolvedValue({
        ok: true,
        value: { ...successfulInlineResult().value, status: "failed" },
      });
      mocks.syncRunFindFirst.mockResolvedValue({ error_summary: summary });
      const response = await POST(request(input));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "sync_failed", message },
        ok: false,
      });
      expect(mocks.syncRunFindFirst).toHaveBeenCalledWith({
        select: { error_summary: true },
        where: {
          clerk_org_id: "org_123",
          id: "run_1",
          organisation_id: input.organisationId,
        },
      });
    }
  );
  it("preserves a local handler error", async () => {
    mocks.dispatchManualSync.mockResolvedValueOnce({
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the sync job.",
      },
      ok: false,
    });
    mocks.syncXeroPeople.mockResolvedValueOnce({
      error: { code: "unknown_error", message: "Xero read failed." },
      ok: false,
    });
    const response = await POST(request(input));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "unknown_error", message: "Xero read failed." },
      ok: false,
    });
  });
  it("surfaces an unexpected local handler exception", async () => {
    mocks.dispatchManualSync.mockResolvedValueOnce({
      error: {
        code: "dispatch_failed",
        message: "Failed to queue the sync job.",
      },
      ok: false,
    });
    mocks.syncXeroPeople.mockRejectedValueOnce(
      new Error("Database connection lost.")
    );
    const response = await POST(request(input));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "sync_failed",
        message:
          "We cannot reach Xero right now. Try again later or contact support.",
      },
      ok: false,
    });
  });
});
