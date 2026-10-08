import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchInitialXeroSync: vi.fn(),
  syncRunFindFirst: vi.fn(),
  xeroConnectionFindMany: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    syncRun: { findFirst: mocks.syncRunFindFirst },
    xeroConnection: { findMany: mocks.xeroConnectionFindMany },
  },
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("../events", () => ({
  dispatchInitialXeroSync: mocks.dispatchInitialXeroSync,
}));
const { recoverXeroImportDispatch } = await import(
  "./recover-xero-import-dispatch"
);
describe("recoverXeroImportDispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.dispatchInitialXeroSync.mockResolvedValue({
      ok: true,
      value: { eventName: "initial-xero-sync", ids: ["event_1"], queued: true },
    });
  });
  it("finds active connected tenants missing initial people sync and dispatches initial sync", async () => {
    mocks.xeroConnectionFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_1",
        id: "tenant_uuid_1",
        organisation_id: "org_model_uuid_1",
      },
      {
        clerk_org_id: "org_2",
        id: "tenant_uuid_2",
        organisation_id: "org_model_uuid_2",
      },
    ]);
    const result = await recoverXeroImportDispatch();
    expect(result).toEqual({
      ok: true,
      value: {
        dispatched: 2,
        scanned: 2,
        skipped: 0,
      },
    });
    expect(mocks.xeroConnectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorisation: { status: "active" },
          disconnected_at: null,
          status: "active",
        }),
      })
    );
    expect(
      mocks.xeroConnectionFindMany.mock.calls[0]?.[0].where
    ).not.toHaveProperty("xero_connection");
    expect(mocks.dispatchInitialXeroSync).toHaveBeenCalledTimes(2);
    expect(mocks.dispatchInitialXeroSync).toHaveBeenNthCalledWith(1, {
      clerkOrgId: "org_1",
      connectionId: "tenant_uuid_1",
      organisationId: "org_model_uuid_1",
      triggerType: "scheduled",
    });
    expect(mocks.dispatchInitialXeroSync).toHaveBeenNthCalledWith(2, {
      clerkOrgId: "org_2",
      connectionId: "tenant_uuid_2",
      organisationId: "org_model_uuid_2",
      triggerType: "scheduled",
    });
  });
  it("skips tenants that already have an active running people sync run", async () => {
    mocks.xeroConnectionFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_1",
        id: "tenant_uuid_1",
        organisation_id: "org_model_uuid_1",
      },
    ]);
    mocks.syncRunFindFirst.mockResolvedValue({
      id: "run_active_1",
      status: "running",
    });
    const result = await recoverXeroImportDispatch();
    expect(result).toEqual({
      ok: true,
      value: {
        dispatched: 0,
        scanned: 1,
        skipped: 1,
      },
    });
    expect(mocks.dispatchInitialXeroSync).not.toHaveBeenCalled();
  });
  it("increments skipped count when dispatch fails and records error log", async () => {
    mocks.xeroConnectionFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_1",
        id: "tenant_uuid_1",
        organisation_id: "org_model_uuid_1",
      },
    ]);
    mocks.dispatchInitialXeroSync.mockResolvedValue({
      error: { code: "dispatch_failed", message: "Inngest unavailable" },
      ok: false,
    });
    const result = await recoverXeroImportDispatch();
    expect(result).toEqual({
      ok: true,
      value: {
        dispatched: 0,
        scanned: 1,
        skipped: 1,
      },
    });
  });
});
