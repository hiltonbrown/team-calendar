import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityRecordFindMany: vi.fn(),
  availabilityRecordUpdateMany: vi.fn(),
  ensureFreshXeroConnection: vi.fn(),
  failedRecordCreate: vi.fn(),
  feedFindMany: vi.fn(),
  fetchLeaveRecordsForRegion: vi.fn(),
  materialiseAvailabilityPublication: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  publishOrganisationNotificationEvent: vi.fn(),
  syncRunCreate: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncRunUpdateMany: vi.fn(),
  toPlainLanguageMessage: vi.fn(() => "Xero request failed"),
  xeroTenantFindFirst: vi.fn(),
  xeroTenantUpdateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-leave-records" })),
    send: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  },
}));
vi.mock("@repo/availability", () => ({
  deriveXeroStableSourceKey: vi.fn(() => "stable-key"),
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: {
      findMany: mocks.availabilityRecordFindMany,
      updateMany: mocks.availabilityRecordUpdateMany,
    },
    failedRecord: { create: mocks.failedRecordCreate },
    feed: { findMany: mocks.feedFindMany },
    person: {
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
    },
    syncRun: {
      create: mocks.syncRunCreate,
      findFirst: mocks.syncRunFindFirst,
      updateMany: mocks.syncRunUpdateMany,
    },
    xeroTenant: {
      findFirst: mocks.xeroTenantFindFirst,
      updateMany: mocks.xeroTenantUpdateMany,
    },
  },
}));
vi.mock("@repo/database/generated/client", () => ({
  Prisma: { JsonNull: "JsonNull" },
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

const CLERK_ORG_ID = "org_leave_records_guard";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "10000000-0000-4000-8000-000000000001";
const XERO_TENANT_ID = "20000000-0000-4000-8000-000000000001";
const XERO_CONNECTION_ID = "40000000-0000-4000-8000-000000000001";
const LEAVE_APPLICATION_ID = "50000000-0000-4000-8000-000000000001";
const XERO_EMPLOYEE_ID = "60000000-0000-4000-8000-000000000001";

function input() {
  return {
    clerkOrgId: CLERK_ORG_ID,
    organisationId: ORGANISATION_ID,
    triggerType: "manual",
    xeroTenantId: XERO_TENANT_ID,
  };
}

describe("leave records stale archival", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: XERO_TENANT_ID,
      payroll_region: "AU",
      sync_paused_at: null,
      xero_connection: {},
      xero_connection_id: XERO_CONNECTION_ID,
    });
    mocks.xeroTenantUpdateMany.mockResolvedValue({ count: 1 });
    mocks.ensureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.availabilityRecordFindMany.mockResolvedValue([]);
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 0 });
    mocks.failedRecordCreate.mockResolvedValue({});
    mocks.feedFindMany.mockResolvedValue([]);
    mocks.personFindFirst.mockResolvedValue(null);
    mocks.personFindMany.mockResolvedValue([]);
  });

  it("does not archive records when Xero returns an empty leave set", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: { leaveRecords: [], rawResponse: {} },
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 0,
        fetched: 0,
        status: "succeeded",
        upserted: 0,
      });
    }
    expect(mocks.availabilityRecordFindMany).not.toHaveBeenCalled();
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalled();
  });

  it("uses a notIn query for stale archival when Xero returns records", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: { leaveRecords: [xeroLeaveRecord()], rawResponse: {} },
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: null,
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          source_remote_id: { notIn: [LEAVE_APPLICATION_ID] },
          source_type: "xero_leave",
        }),
      })
    );
  });
});

function xeroLeaveRecord() {
  return {
    employeeId: XERO_EMPLOYEE_ID,
    endDate: "2026-05-08",
    leaveApplicationId: LEAVE_APPLICATION_ID,
    leaveTypeId: "annual",
    leaveTypeName: "Annual Leave",
    rawPayload: {
      LeaveApplicationID: LEAVE_APPLICATION_ID,
      LeaveType: "Annual Leave",
    },
    startDate: "2026-05-07",
    status: "APPROVED" as const,
    title: "Annual leave",
    units: 15.2,
    updatedDateUtc: "2026-05-01T01:02:03.000Z",
  };
}
