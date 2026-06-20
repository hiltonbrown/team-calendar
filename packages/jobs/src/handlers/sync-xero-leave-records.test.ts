import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityRecordCreate: vi.fn(),
  availabilityRecordFindFirst: vi.fn(),
  availabilityRecordFindMany: vi.fn(),
  availabilityRecordUpdateMany: vi.fn(),
  ensureFreshXeroConnection: vi.fn(),
  failedRecordCreate: vi.fn(),
  feedFindMany: vi.fn(),
  fetchLeaveRecordsForRegion: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  materialiseAvailabilityPublication: vi.fn(),
  normaliseInboundLeaveRecord: vi.fn(),
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
    send: mocks.inngestSend,
  },
}));
vi.mock("@repo/availability", () => ({
  deriveXeroStableSourceKey: vi.fn(() => "stable-key"),
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord: mocks.normaliseInboundLeaveRecord,
}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: {
      create: mocks.availabilityRecordCreate,
      findFirst: mocks.availabilityRecordFindFirst,
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
const LEAVE_APPLICATION_ID_2 = "50000000-0000-4000-8000-000000000002";
const LEAVE_APPLICATION_ID_3 = "50000000-0000-4000-8000-000000000003";
const PERSON_ID = "70000000-0000-4000-8000-000000000001";
const PERSON_ID_2 = "70000000-0000-4000-8000-000000000002";
const PERSON_ID_3 = "70000000-0000-4000-8000-000000000003";
const XERO_EMPLOYEE_ID = "60000000-0000-4000-8000-000000000001";
const XERO_EMPLOYEE_ID_2 = "60000000-0000-4000-8000-000000000002";
const XERO_EMPLOYEE_ID_3 = "60000000-0000-4000-8000-000000000003";

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
    mocks.availabilityRecordCreate.mockResolvedValue({
      id: "80000000-0000-4000-8000-000000000001",
    });
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 0 });
    mocks.failedRecordCreate.mockResolvedValue({});
    mocks.feedFindMany.mockResolvedValue([]);
    mocks.inngestSend.mockResolvedValue({ ids: ["event_1"] });
    mocks.materialiseAvailabilityPublication.mockResolvedValue({ ok: true });
    mocks.normaliseInboundLeaveRecord.mockImplementation((record) =>
      normalisedLeaveRecord({
        hash: `hash-${record.sourceRemoteId}`,
        personId: record.personId,
        sourceRemoteId: record.sourceRemoteId,
      })
    );
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

  it("uses pre-fetched maps for create, update, and unchanged records", async () => {
    const records = [
      xeroLeaveRecord({
        employeeId: XERO_EMPLOYEE_ID,
        leaveApplicationId: LEAVE_APPLICATION_ID,
      }),
      xeroLeaveRecord({
        employeeId: XERO_EMPLOYEE_ID_2,
        leaveApplicationId: LEAVE_APPLICATION_ID_2,
      }),
      xeroLeaveRecord({
        employeeId: XERO_EMPLOYEE_ID_3,
        leaveApplicationId: LEAVE_APPLICATION_ID_3,
      }),
    ];
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: { leaveRecords: records, rawResponse: {} },
    });
    mocks.personFindMany
      .mockResolvedValueOnce([
        person(PERSON_ID, XERO_EMPLOYEE_ID),
        person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
        person(PERSON_ID_3, XERO_EMPLOYEE_ID_3),
      ])
      .mockResolvedValueOnce([
        { id: PERSON_ID_2, team_id: null },
        { id: PERSON_ID_3, team_id: null },
      ]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([
        {
          id: "80000000-0000-4000-8000-000000000001",
          source_remote_hash: "hash-unchanged",
          source_remote_id: LEAVE_APPLICATION_ID,
        },
        {
          id: "80000000-0000-4000-8000-000000000002",
          source_remote_hash: "hash-before-update",
          source_remote_id: LEAVE_APPLICATION_ID_2,
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.availabilityRecordCreate.mockResolvedValue({
      id: "80000000-0000-4000-8000-000000000003",
    });
    mocks.feedFindMany.mockResolvedValue([
      { id: "90000000-0000-4000-8000-000000000001" },
      { id: "90000000-0000-4000-8000-000000000002" },
    ]);
    mocks.normaliseInboundLeaveRecord.mockImplementation((record) =>
      normalisedLeaveRecord({
        hash:
          record.sourceRemoteId === LEAVE_APPLICATION_ID
            ? "hash-unchanged"
            : `hash-${record.sourceRemoteId}`,
        personId: record.personId,
        sourceRemoteId: record.sourceRemoteId,
      })
    );

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        status: "succeeded",
        upserted: 3,
      });
    }
    expect(mocks.personFindFirst).not.toHaveBeenCalled();
    expect(mocks.availabilityRecordFindFirst).not.toHaveBeenCalled();
    expect(mocks.personFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          xero_employee_id: {
            in: [XERO_EMPLOYEE_ID, XERO_EMPLOYEE_ID_2, XERO_EMPLOYEE_ID_3],
          },
        }),
      })
    );
    expect(mocks.availabilityRecordFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          source_remote_id: {
            in: [
              LEAVE_APPLICATION_ID,
              LEAVE_APPLICATION_ID_2,
              LEAVE_APPLICATION_ID_3,
            ],
          },
          source_type: "xero_leave",
        }),
      })
    );
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.availabilityRecordCreate).toHaveBeenCalledTimes(1);
    expect(mocks.personFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [PERSON_ID_2, PERSON_ID_3] },
        }),
      })
    );
    expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
    expect(mocks.inngestSend).toHaveBeenCalledWith([
      {
        data: {
          clerkOrgId: CLERK_ORG_ID,
          feedId: "90000000-0000-4000-8000-000000000001",
          organisationId: ORGANISATION_ID,
          reason: "xero_leave_records_synced",
        },
        name: "rebuild-feed-cache",
      },
      {
        data: {
          clerkOrgId: CLERK_ORG_ID,
          feedId: "90000000-0000-4000-8000-000000000002",
          organisationId: ORGANISATION_ID,
          reason: "xero_leave_records_synced",
        },
        name: "rebuild-feed-cache",
      },
    ]);
  });

  it("records person_not_found from the pre-fetched person map", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: { leaveRecords: [xeroLeaveRecord()], rawResponse: {} },
    });
    mocks.personFindMany.mockResolvedValue([]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.personFindFirst).not.toHaveBeenCalled();
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_code: "person_not_found",
          source_id: LEAVE_APPLICATION_ID,
        }),
      })
    );
    expect(mocks.availabilityRecordCreate).not.toHaveBeenCalled();
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalled();
  });
});

function person(id: string, xeroEmployeeId: string) {
  return {
    default_privacy_mode: "named",
    id,
    include_in_feeds_by_default: true,
    xero_employee_id: xeroEmployeeId,
  };
}

function normalisedLeaveRecord({
  hash,
  personId,
  sourceRemoteId,
}: {
  hash: string;
  personId: string;
  sourceRemoteId: string;
}) {
  return {
    allDay: true,
    approvalStatus: "approved",
    contactability: "unavailable",
    derivedUidKey: `uid-${sourceRemoteId}`,
    endsAt: new Date("2026-05-08T00:00:00.000Z"),
    includeInFeed: true,
    personId,
    publishStatus: "eligible",
    rawPayload: { LeaveApplicationID: sourceRemoteId },
    recordType: "annual_leave",
    sourceLastModifiedAt: new Date("2026-05-01T01:02:03.000Z"),
    sourceRemoteHash: hash,
    sourceRemoteId,
    sourceType: "xero_leave",
    startsAt: new Date("2026-05-07T00:00:00.000Z"),
    title: "Annual leave",
  };
}

function xeroLeaveRecord(
  overrides: Partial<{
    employeeId: string;
    leaveApplicationId: string;
  }> = {}
) {
  return {
    employeeId: overrides.employeeId ?? XERO_EMPLOYEE_ID,
    endDate: "2026-05-08",
    leaveApplicationId: overrides.leaveApplicationId ?? LEAVE_APPLICATION_ID,
    leaveTypeId: "annual",
    leaveTypeName: "Annual Leave",
    rawPayload: {
      LeaveApplicationID: overrides.leaveApplicationId ?? LEAVE_APPLICATION_ID,
      LeaveType: "Annual Leave",
    },
    startDate: "2026-05-07",
    status: "APPROVED" as const,
    title: "Annual leave",
    units: 15.2,
    updatedDateUtc: "2026-05-01T01:02:03.000Z",
  };
}
