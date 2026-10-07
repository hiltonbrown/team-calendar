import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cancelRun: vi.fn(),
  currentUser: vi.fn(),
  exportFailedRecordsCsv: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getPublicApiUrl: vi.fn(),
  getToken: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  cancelRun: mocks.cancelRun,
  exportFailedRecordsCsv: mocks.exportFailedRecordsCsv,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/public-api-url", () => ({
  getPublicApiUrl: mocks.getPublicApiUrl,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const {
  cancelRunAction,
  dispatchManualSyncAction,
  exportFailedRecordsCsvAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const connectionId = "00000000-0000-4000-8000-000000000003";
const clerkOrgId = "org_123";
const userId = "user_456";

describe("sync server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      getToken: mocks.getToken,
      orgRole: "org:admin",
    });
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.getPublicApiUrl.mockReturnValue(
      "https://api.example.com/api/sync/dispatch"
    );
    mocks.getToken.mockResolvedValue("session_token");
    mocks.cancelRun.mockResolvedValue({
      ok: true,
      value: { cancellationRequested: true, eventQueued: true },
    });
    mocks.exportFailedRecordsCsv.mockResolvedValue({
      ok: true,
      value: { csvContent: "id,error\n1,fail", filename: "failed.csv" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            value: { eventName: "sync-xero-people", queued: true },
          }),
          { status: 202 }
        )
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects unauthenticated callers", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const result = await dispatchManualSyncAction({
      connectionId,
      organisationId,
      runType: "people",
    });

    expect(result).toEqual({
      error: {
        code: "not_authorised",
        message: "Only admins and owners can manage sync health.",
      },
      ok: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-admin roles", async () => {
    mocks.auth.mockResolvedValue({
      getToken: mocks.getToken,
      orgRole: "org:manager",
    });

    const result = await cancelRunAction({ organisationId, runId });

    expect(result.ok).toBe(false);
    expect(mocks.cancelRun).not.toHaveBeenCalled();
  });

  it("rejects malformed inputs before dispatch", async () => {
    const result = await dispatchManualSyncAction({
      connectionId,
      organisationId: "invalid-uuid",
      runType: "people",
    });

    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("scopes cancellation to both tenant identifiers", async () => {
    await cancelRunAction({ organisationId, runId });

    expect(mocks.cancelRun).toHaveBeenCalledWith({
      actingRole: "admin",
      actingUserId: userId,
      clerkOrgId,
      organisationId,
      runId,
    });
  });

  it("queues manual sync through the authenticated API endpoint", async () => {
    const result = await dispatchManualSyncAction({
      connectionId,
      organisationId,
      runType: "people",
    });

    expect(result).toEqual({
      ok: true,
      value: { eventName: "sync-xero-people", queued: true },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/sync/dispatch",
      {
        body: JSON.stringify({
          connectionId,
          organisationId,
          runType: "people",
        }),
        cache: "no-store",
        headers: {
          authorization: "Bearer session_token",
          "content-type": "application/json",
        },
        method: "POST",
      }
    );
  });

  it("does not dispatch without a Clerk session token", async () => {
    mocks.getToken.mockResolvedValueOnce(null);

    const result = await dispatchManualSyncAction({
      connectionId,
      organisationId,
      runType: "people",
    });

    expect(result).toEqual({
      error: {
        code: "not_authorised",
        message: "Only admins and owners can manage sync health.",
      },
      ok: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ queued: true }), { status: 202 })
    );

    const result = await dispatchManualSyncAction({
      connectionId,
      organisationId,
      runType: "leave_records",
    });

    expect(result).toEqual({
      error: {
        code: "dispatch_failed",
        message: "The sync dispatch service returned an invalid response.",
      },
      ok: false,
    });
  });

  it("preserves a scoped API error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "tenant_not_found",
            message: "Xero tenant was not found for this organisation.",
          },
          ok: false,
        }),
        { status: 404 }
      )
    );

    const result = await dispatchManualSyncAction({
      connectionId,
      organisationId,
      runType: "people",
    });

    expect(result).toEqual({
      error: {
        code: "tenant_not_found",
        message: "Xero tenant was not found for this organisation.",
      },
      ok: false,
    });
  });

  it("preserves a local fallback execution failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "sync_failed",
            message: "Sync run failed or was cancelled.",
          },
          ok: false,
        }),
        { status: 500 }
      )
    );

    const result = await dispatchManualSyncAction({
      connectionId,
      organisationId,
      runType: "people",
    });

    expect(result).toEqual({
      error: {
        code: "sync_failed",
        message: "Sync run failed or was cancelled.",
      },
      ok: false,
    });
  });

  it("returns failed-record CSV export data", async () => {
    const result = await exportFailedRecordsCsvAction({
      organisationId,
      runId,
    });

    expect(result).toEqual({
      ok: true,
      value: { csvContent: "id,error\n1,fail", filename: "failed.csv" },
    });
  });
});
