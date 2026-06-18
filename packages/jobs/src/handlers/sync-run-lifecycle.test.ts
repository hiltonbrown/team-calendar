import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deriveXeroStableSourceKey: vi.fn(),
  ensureFreshXeroConnection: vi.fn(),
  fetchLeaveRecordsForRegion: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  materialiseAvailabilityPublication: vi.fn(),
  normaliseInboundLeaveRecord: vi.fn(),
  publishOrganisationNotificationEvent: vi.fn(),
  syncRunCreate: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncRunUpdateMany: vi.fn(),
  toPlainLanguageMessage: vi.fn(() => "Xero request failed"),
  xeroTenantFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-leave-records" })),
    send: mocks.inngestSend,
  },
}));
vi.mock("@repo/availability", () => ({
  deriveXeroStableSourceKey: mocks.deriveXeroStableSourceKey,
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord: mocks.normaliseInboundLeaveRecord,
}));
vi.mock("@repo/database", () => ({
  database: {
    syncRun: {
      create: mocks.syncRunCreate,
      findFirst: mocks.syncRunFindFirst,
      updateMany: mocks.syncRunUpdateMany,
    },
    xeroTenant: {
      findFirst: mocks.xeroTenantFindFirst,
    },
  },
}));
vi.mock("@repo/notifications", () => ({
  publishOrganisationNotificationEvent:
    mocks.publishOrganisationNotificationEvent,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("@repo/xero", () => ({
  ensureFreshXeroConnection: mocks.ensureFreshXeroConnection,
  fetchLeaveRecordsForRegion: mocks.fetchLeaveRecordsForRegion,
  toPlainLanguageMessage: mocks.toPlainLanguageMessage,
}));

const { syncXeroLeaveRecords } = await import("./sync-xero-leave-records");

const CLERK_ORG_ID = "org_sync_lifecycle";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "10000000-0000-4000-8000-000000000001";
const XERO_TENANT_ID = "20000000-0000-4000-8000-000000000001";

function input() {
  return {
    clerkOrgId: CLERK_ORG_ID,
    organisationId: ORGANISATION_ID,
    triggerType: "manual",
    xeroTenantId: XERO_TENANT_ID,
  };
}

describe("sync run lifecycle guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("finalises a created run as failed when work throws after creation", async () => {
    mocks.xeroTenantFindFirst.mockRejectedValue(new Error("database hiccup"));

    const result = await syncXeroLeaveRecords(input());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to sync Xero leave records.",
      },
    });
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: "database hiccup",
          status: "failed",
        }),
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          id: RUN_ID,
          organisation_id: ORGANISATION_ID,
        }),
      })
    );
  });

  it("adds a staleness floor to the running-run guard and creates a new run when none is returned", async () => {
    mocks.xeroTenantFindFirst.mockResolvedValue({
      sync_paused_at: new Date("2026-06-18T00:00:00.000Z"),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.syncRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          run_type: "leave_records",
          started_at: {
            gte: expect.any(Date),
          },
          status: "running",
          xero_tenant_id: XERO_TENANT_ID,
        }),
      })
    );
    expect(mocks.syncRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          run_type: "leave_records",
          status: "running",
          xero_tenant_id: XERO_TENANT_ID,
        }),
      })
    );
    expect(
      mocks.syncRunCreate.mock.calls.some(
        ([call]) => call.data.status === "cancelled"
      )
    ).toBe(false);
  });
});
