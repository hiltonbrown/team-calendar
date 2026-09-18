import { Prisma } from "@repo/database/generated/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityRecordCreate: vi.fn(),
  availabilityRecordFindFirst: vi.fn(),
  availabilityRecordFindMany: vi.fn(),
  availabilityRecordUpdateMany: vi.fn(),
  databaseTransaction: vi.fn(),
  ensureFreshXeroConnection: vi.fn(),
  failedRecordCreate: vi.fn(),
  feedFindMany: vi.fn(),
  feedIdsForPeople: vi.fn(),
  fetchLeaveForEmployeeForRegion: vi.fn(),
  fetchLeaveRecordsForRegion: vi.fn(),
  inngestSend: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  mapXeroLeaveType: vi.fn(),
  materialiseAvailabilityPublication: vi.fn(),
  normaliseInboundLeaveRecord: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  publishOrganisationNotificationEvent: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  syncRunCreate: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncRunUpdateMany: vi.fn(),
  toPlainLanguageMessage: vi.fn(() => "Xero request failed"),
  xeroSyncCursorCreate: vi.fn(),
  xeroSyncCursorFindFirst: vi.fn(),
  xeroSyncCursorUpdateMany: vi.fn(),
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
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord: mocks.normaliseInboundLeaveRecord,
  unclaimedOrExpiredXeroWriteWhere: vi.fn(() => ({
    OR: [
      { xero_write_claimed_at: null },
      { xero_write_claimed_at: { lt: new Date(0) } },
    ],
  })),
}));
const databaseMock = {
  $transaction: mocks.databaseTransaction,
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
  xeroSyncCursor: {
    create: mocks.xeroSyncCursorCreate,
    findFirst: mocks.xeroSyncCursorFindFirst,
    updateMany: mocks.xeroSyncCursorUpdateMany,
  },
  xeroTenant: {
    findFirst: mocks.xeroTenantFindFirst,
    updateMany: mocks.xeroTenantUpdateMany,
  },
};

vi.mock("@repo/database", () => ({
  database: databaseMock,
  scopedTo: mocks.scopedTo,
}));
vi.mock("@repo/feeds", () => ({
  feedIdsForPeople: mocks.feedIdsForPeople,
}));
vi.mock("@repo/database/generated/client", () => ({
  Prisma: { JsonNull: "JsonNull" },
}));
vi.mock("@repo/notifications", () => ({
  publishOrganisationNotificationEvent:
    mocks.publishOrganisationNotificationEvent,
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@repo/xero", () => ({
  deriveXeroStableSourceKey: vi.fn(() => "stable-key"),
  ensureFreshXeroConnection: mocks.ensureFreshXeroConnection,
  fetchLeaveForEmployeeForRegion: mocks.fetchLeaveForEmployeeForRegion,
  fetchLeaveRecordsForRegion: mocks.fetchLeaveRecordsForRegion,
  mapXeroLeaveType: mocks.mapXeroLeaveType,
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
    mocks.databaseTransaction.mockImplementation(async (target: unknown) => {
      if (typeof target === "function") {
        return await target(databaseMock);
      }
      if (Array.isArray(target)) {
        return await Promise.all(target);
      }
      return target;
    });
    mocks.feedIdsForPeople.mockResolvedValue([]);
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
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 1 });
    mocks.failedRecordCreate.mockResolvedValue({});
    mocks.feedFindMany.mockResolvedValue([]);
    mocks.inngestSend.mockResolvedValue({ ids: ["event_1"] });
    mocks.materialiseAvailabilityPublication.mockResolvedValue({ ok: true });
    mocks.mapXeroLeaveType.mockReturnValue({
      mapped: true,
      recordType: "annual_leave",
    });
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

  it("archives scoped records when Xero returns an authoritative empty leave set", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: { complete: true, leaveRecords: [], rawResponse: {} },
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 1,
        fetched: 0,
        status: "succeeded",
        upserted: 0,
      });
    }
    expect(mocks.databaseTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: null,
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          source_type: "xero_leave",
        }),
      })
    );
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ xero_write_claimed_at: null }]),
        }),
      })
    );
  });

  it("persists rejected leave with zero units", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord({ status: "REJECTED", units: 0 })],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        status: "succeeded",
        upserted: 1,
      });
    }
    expect(mocks.failedRecordCreate).not.toHaveBeenCalled();
    expect(mocks.normaliseInboundLeaveRecord).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: "declined" })
    );
  });

  it("persists and flags an unmapped Xero leave type", async () => {
    const record = {
      ...xeroLeaveRecord(),
      leaveTypeId: "purchased-leave",
      leaveTypeName: "Custom Purchased Leave",
    };
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: { complete: true, leaveRecords: [record], rawResponse: {} },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.mapXeroLeaveType.mockReturnValueOnce({
      leaveTypeName: "Custom Purchased Leave",
      mapped: false,
      payrollRegion: "AU",
      recordType: "leave",
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        status: "partial_success",
        upserted: 1,
      });
    }
    expect(mocks.normaliseInboundLeaveRecord).toHaveBeenCalledWith(
      expect.objectContaining({ recordType: "leave" })
    );
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clerk_org_id: CLERK_ORG_ID,
        error_code: "unmapped_leave_type",
        organisation_id: ORGANISATION_ID,
        source_remote_id: LEAVE_APPLICATION_ID,
      }),
    });
    expect(mocks.availabilityRecordCreate).toHaveBeenCalledTimes(1);
  });

  it("uses a notIn query for stale archival when Xero returns records", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.databaseTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ["person_id"],
        select: { person_id: true },
        where: expect.objectContaining({
          archived_at: null,
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          source_remote_id: { notIn: [LEAVE_APPLICATION_ID] },
          source_type: "xero_leave",
          updated_at: { lte: expect.any(Date) },
        }),
      })
    );
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          archived_at: expect.any(Date),
          include_in_feed: false,
          publish_status: "archived",
          updated_at: expect.any(Date),
        }),
        where: expect.objectContaining({
          archived_at: null,
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          source_remote_id: { notIn: [LEAVE_APPLICATION_ID] },
          source_type: "xero_leave",
          updated_at: { lte: expect.any(Date) },
        }),
      })
    );
  });

  it("skips stale archival when the Xero leave fetch is truncated", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: false,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.archived).toBe(0);
    }
    expect(mocks.databaseTransaction).not.toHaveBeenCalled();
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source_remote_id: { in: [LEAVE_APPLICATION_ID] },
        }),
      })
    );
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalled();
  });

  it("archives stale records in one transaction, deduplicates feed rebuilds, and does not materialise stale publications individually", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [
          xeroLeaveRecord({
            employeeId: XERO_EMPLOYEE_ID,
            leaveApplicationId: LEAVE_APPLICATION_ID,
          }),
        ],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([]) // batch lookup
      .mockResolvedValueOnce([
        { person_id: PERSON_ID },
        { person_id: PERSON_ID_2 },
      ]); // transaction distinct person_id
    mocks.availabilityRecordUpdateMany.mockResolvedValueOnce({ count: 3 }); // 3 stale records updated
    mocks.feedIdsForPeople.mockResolvedValueOnce([
      { id: "90000000-0000-4000-8000-000000000001", privacyMode: "named" },
      { id: "90000000-0000-4000-8000-000000000001", privacyMode: "named" },
      { id: "90000000-0000-4000-8000-000000000002", privacyMode: "named" },
    ]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 3,
        fetched: 1,
        status: "succeeded",
        upserted: 1,
      });
    }

    // Single transaction for stale archival
    expect(mocks.databaseTransaction).toHaveBeenCalledTimes(1);

    // Publication materialisation is called ONCE for the applied record, ZERO times for stale records
    expect(mocks.materialiseAvailabilityPublication).toHaveBeenCalledTimes(1);
    expect(mocks.materialiseAvailabilityPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        availabilityRecordId: "80000000-0000-4000-8000-000000000001",
      })
    );

    // Canonical feed resolution called with person IDs
    expect(mocks.feedIdsForPeople).toHaveBeenCalledWith({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personIds: expect.arrayContaining([PERSON_ID, PERSON_ID_2]),
    });

    // Feeds deduplicated before enqueue
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

  it("skips stale archival when sync run is cancelled", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.syncRunFindFirst.mockResolvedValue({
      cancel_requested_at: new Date(),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 0,
        status: "cancelled",
      });
    }
    expect(mocks.databaseTransaction).not.toHaveBeenCalled();
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
      value: { complete: true, leaveRecords: records, rawResponse: {} },
    });
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
      person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
      person(PERSON_ID_3, XERO_EMPLOYEE_ID_3),
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
    mocks.feedIdsForPeople.mockResolvedValue([
      { id: "90000000-0000-4000-8000-000000000001", privacyMode: "named" },
      { id: "90000000-0000-4000-8000-000000000002", privacyMode: "named" },
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
    expect(mocks.personFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
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
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          source_remote_id: {
            in: [
              LEAVE_APPLICATION_ID,
              LEAVE_APPLICATION_ID_2,
              LEAVE_APPLICATION_ID_3,
            ],
          },
          source_type: { in: ["xero_leave", "team_calendar_leave"] },
        }),
      })
    );
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledTimes(3);
    expect(mocks.availabilityRecordCreate).toHaveBeenCalledTimes(1);
    expect(mocks.feedIdsForPeople).toHaveBeenCalledWith({
      clerkOrgId: CLERK_ORG_ID,
      organisationId: ORGANISATION_ID,
      personIds: [PERSON_ID_2, PERSON_ID_3],
    });
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
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
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
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.any(String) }),
      })
    );
  });

  it("preserves user-owned fields when updating a Team Calendar leave", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([
        {
          approval_status: "approved",
          failed_action: null,
          id: "80000000-0000-4000-8000-000000000001",
          source_remote_hash: "hash-before-update",
          source_remote_id: LEAVE_APPLICATION_ID,
          source_type: "team_calendar_leave",
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    const data = mocks.availabilityRecordUpdateMany.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty("privacy_mode");
    expect(data).not.toHaveProperty("include_in_feed");
    expect(data).not.toHaveProperty("title");
  });

  it("keeps person defaults when updating a Xero leave", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([
        {
          approval_status: "approved",
          failed_action: null,
          id: "80000000-0000-4000-8000-000000000001",
          source_remote_hash: "hash-before-update",
          source_remote_id: LEAVE_APPLICATION_ID,
          source_type: "xero_leave",
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(
      mocks.availabilityRecordUpdateMany.mock.calls[0]?.[0]?.data
    ).toMatchObject({
      privacy_mode: "named",
    });
  });

  it("seeds user-owned fields when creating a leave record", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany.mockResolvedValue([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(
      mocks.availabilityRecordCreate.mock.calls[0]?.[0]?.data
    ).toMatchObject({
      include_in_feed: true,
      privacy_mode: "named",
      title: "Annual leave",
    });
  });

  it("continues syncing Xero-owned fields for a Team Calendar leave", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([
        {
          approval_status: "approved",
          failed_action: null,
          id: "80000000-0000-4000-8000-000000000001",
          source_remote_hash: "hash-before-update",
          source_remote_id: LEAVE_APPLICATION_ID,
          source_type: "team_calendar_leave",
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(
      mocks.availabilityRecordUpdateMany.mock.calls[0]?.[0]?.data
    ).toMatchObject({
      approval_status: "approved",
      ends_at: new Date("2026-05-08T00:00:00.000Z"),
      source_remote_hash: `hash-${LEAVE_APPLICATION_ID}`,
      starts_at: new Date("2026-05-07T00:00:00.000Z"),
    });
  });

  it("clears the write-error fields when Xero reports a status that settles the record", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([
        {
          approval_status: "xero_sync_failed",
          failed_action: "approve",
          id: "80000000-0000-4000-8000-000000000001",
          source_remote_hash: "hash-before-update",
          source_remote_id: LEAVE_APPLICATION_ID,
          source_type: "xero_leave",
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(
      mocks.availabilityRecordUpdateMany.mock.calls[0]?.[0]?.data
    ).toMatchObject({
      approval_status: "approved",
      failed_action: null,
      xero_write_error: null,
      xero_write_error_raw: Prisma.DbNull,
    });
  });

  it("keeps the write-error fields untouched for the failed-withdraw exception", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany
      .mockResolvedValueOnce([
        {
          approval_status: "xero_sync_failed",
          failed_action: "withdraw",
          id: "80000000-0000-4000-8000-000000000001",
          source_remote_hash: "hash-before-update",
          source_remote_id: LEAVE_APPLICATION_ID,
          source_type: "xero_leave",
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    const data = mocks.availabilityRecordUpdateMany.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ approval_status: "xero_sync_failed" });
    expect(data).not.toHaveProperty("failed_action");
    expect(data).not.toHaveProperty("xero_write_error");
    expect(data).not.toHaveProperty("xero_write_error_raw");
  });

  it("leaves the write-error fields cleared when creating a brand-new record", async () => {
    mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [xeroLeaveRecord()],
        rawResponse: {},
      },
    });
    mocks.personFindMany.mockResolvedValue([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.availabilityRecordFindMany.mockResolvedValue([]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(
      mocks.availabilityRecordCreate.mock.calls[0]?.[0]?.data
    ).toMatchObject({
      failed_action: null,
      xero_write_error: null,
      xero_write_error_raw: Prisma.DbNull,
    });
  });

  it("skips a local row changed after the sync run started", async () => {
    configureExistingRecord({
      source_last_modified_at: new Date("2026-05-01T01:02:03.000Z"),
      source_remote_hash: "hash-before-update",
      updated_at: new Date(Date.now() + 1000),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        skipped: 1,
        upserted: 0,
      });
    }
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.any(String) }),
      })
    );
    expect(mocks.materialiseAvailabilityPublication).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("skips an older remote snapshot", async () => {
    configureExistingRecord({
      source_last_modified_at: new Date("2026-06-01T00:00:00.000Z"),
      source_remote_hash: "hash-before-update",
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(1);
    }
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.any(String) }),
      })
    );
  });

  it("skips an equal remote timestamp and hash", async () => {
    configureExistingRecord({
      source_last_modified_at: new Date("2026-05-01T01:02:03.000Z"),
      source_remote_hash: `hash-${LEAVE_APPLICATION_ID}`,
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        skipped: 1,
        upserted: 0,
      });
    }
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.any(String) }),
      })
    );
  });

  it("skips a null remote timestamp when the hash is unchanged", async () => {
    mocks.normaliseInboundLeaveRecord.mockReturnValue(
      normalisedLeaveRecord({
        hash: `hash-${LEAVE_APPLICATION_ID}`,
        personId: PERSON_ID,
        sourceLastModifiedAt: null,
        sourceRemoteId: LEAVE_APPLICATION_ID,
      })
    );
    configureExistingRecord({
      source_last_modified_at: new Date("2026-05-01T01:02:03.000Z"),
      source_remote_hash: `hash-${LEAVE_APPLICATION_ID}`,
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(1);
    }
    expect(mocks.availabilityRecordUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.any(String) }),
      })
    );
  });

  it("retains a known timestamp when a changed hash has no remote timestamp", async () => {
    mocks.normaliseInboundLeaveRecord.mockReturnValue(
      normalisedLeaveRecord({
        hash: "hash-changed-without-timestamp",
        personId: PERSON_ID,
        sourceLastModifiedAt: null,
        sourceRemoteId: LEAVE_APPLICATION_ID,
      })
    );
    const storedTimestamp = new Date("2026-05-01T01:02:03.000Z");
    configureExistingRecord({
      source_last_modified_at: storedTimestamp,
      source_remote_hash: "hash-before-update",
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(
      mocks.availabilityRecordUpdateMany.mock.calls[0]?.[0]?.data
    ).toMatchObject({ source_last_modified_at: storedTimestamp });
  });

  it("applies an equal remote timestamp when the hash changed", async () => {
    const storedTimestamp = new Date("2026-05-01T01:02:03.000Z");
    configureExistingRecord({
      source_last_modified_at: storedTimestamp,
      source_remote_hash: "hash-before-update",
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        skipped: 0,
        upserted: 1,
      });
    }
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approval_status: "approved",
          clerk_org_id: CLERK_ORG_ID,
          derived_sequence: 3,
          id: "80000000-0000-4000-8000-000000000001",
          organisation_id: ORGANISATION_ID,
          source_last_modified_at: storedTimestamp,
          source_remote_hash: "hash-before-update",
          updated_at: new Date("2026-01-01T00:00:00.000Z"),
        }),
      })
    );
  });

  it("counts a compare-and-swap database error as a failed record", async () => {
    configureExistingRecord({
      source_last_modified_at: new Date("2026-04-01T00:00:00.000Z"),
      source_remote_hash: "hash-before-update",
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.availabilityRecordUpdateMany.mockRejectedValueOnce(
      new Error("CAS failed")
    );

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        skipped: 0,
        upserted: 0,
      });
    }
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ error_code: "db_error" }),
      })
    );
  });

  it("skips publication work when the compare-and-swap loses the race", async () => {
    configureExistingRecord({
      source_last_modified_at: new Date("2026-04-01T00:00:00.000Z"),
      source_remote_hash: "hash-before-update",
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    });
    mocks.availabilityRecordUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        skipped: 1,
        upserted: 0,
      });
    }
    expect(mocks.materialiseAvailabilityPublication).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ xero_write_claimed_at: null }]),
        }),
      })
    );
  });
});

describe("regional leave sync (NZ/UK)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.databaseTransaction.mockImplementation(async (target: unknown) => {
      if (typeof target === "function") {
        return await target(databaseMock);
      }
      if (Array.isArray(target)) {
        return await Promise.all(target);
      }
      return target;
    });
    mocks.feedIdsForPeople.mockResolvedValue([]);
    mocks.syncRunCreate.mockResolvedValue({ id: RUN_ID });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantFindFirst.mockResolvedValue({
      id: XERO_TENANT_ID,
      leave_records_stale_since: null,
      payroll_region: "NZ",
      sync_paused_at: null,
      xero_connection: {},
      xero_connection_id: XERO_CONNECTION_ID,
    });
    mocks.xeroTenantUpdateMany.mockResolvedValue({ count: 1 });
    mocks.ensureFreshXeroConnection.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.xeroSyncCursorFindFirst.mockResolvedValue(null);
    mocks.xeroSyncCursorCreate.mockResolvedValue({ id: "cursor_1" });
    mocks.xeroSyncCursorUpdateMany.mockResolvedValue({ count: 1 });
    mocks.availabilityRecordFindMany.mockResolvedValue([]);
    mocks.availabilityRecordCreate.mockResolvedValue({
      id: "80000000-0000-4000-8000-000000000001",
    });
    mocks.availabilityRecordUpdateMany.mockResolvedValue({ count: 1 });
    mocks.failedRecordCreate.mockResolvedValue({});
    mocks.feedFindMany.mockResolvedValue([]);
    mocks.inngestSend.mockResolvedValue({ ids: ["event_1"] });
    mocks.materialiseAvailabilityPublication.mockResolvedValue({ ok: true });
    mocks.mapXeroLeaveType.mockReturnValue({
      mapped: true,
      recordType: "annual_leave",
    });
    mocks.normaliseInboundLeaveRecord.mockImplementation((record) =>
      normalisedLeaveRecord({
        hash: `hash-${record.sourceRemoteId}`,
        personId: record.personId,
        sourceRemoteId: record.sourceRemoteId,
      })
    );
    mocks.personFindFirst.mockResolvedValue(null);
    mocks.personFindMany.mockResolvedValue([]);
    mocks.fetchLeaveForEmployeeForRegion.mockImplementation(
      async (_region, empInput: { xeroEmployeeId: string }) => ({
        ok: true,
        value: {
          complete: true,
          leaveRecords: [
            xeroLeaveRecord({
              employeeId: empInput.xeroEmployeeId,
              leaveApplicationId: `50000000-0000-4000-8000-${empInput.xeroEmployeeId.slice(-12)}`,
            }),
          ],
          rawResponse: {},
        },
      })
    );
  });

  it("pages 20 people and creates cursor with 21 candidate people (first page)", async () => {
    const peopleList = Array.from({ length: 21 }, (_, i) =>
      person(
        `70000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
      )
    );
    mocks.personFindMany.mockResolvedValueOnce(peopleList);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 0,
        fetched: 20,
        status: "succeeded",
        upserted: 20,
      });
    }

    expect(mocks.fetchLeaveForEmployeeForRegion).toHaveBeenCalledTimes(20);
    expect(mocks.xeroSyncCursorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clerk_org_id: CLERK_ORG_ID,
          cursor_value: peopleList[19]?.id,
          entity_type: "leave_records",
          organisation_id: ORGANISATION_ID,
          xero_tenant_id: XERO_TENANT_ID,
        }),
      })
    );
    expect(mocks.xeroTenantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leave_records_stale_since: expect.any(Date),
        }),
      })
    );
  });

  it("queries after cursor on middle page and updates cursor", async () => {
    const cursorRecord = {
      cursor_value: "70000000-0000-4000-8000-000000000020",
      id: "cursor_1",
    };
    mocks.xeroSyncCursorFindFirst.mockResolvedValue(cursorRecord);

    const peopleList = Array.from({ length: 21 }, (_, i) =>
      person(
        `70000000-0000-4000-8000-${String(i + 21).padStart(12, "0")}`,
        `60000000-0000-4000-8000-${String(i + 21).padStart(12, "0")}`
      )
    );
    mocks.personFindMany.mockResolvedValueOnce(peopleList);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: "asc" },
        take: 21,
        where: expect.objectContaining({
          archived_at: null,
          id: { gt: "70000000-0000-4000-8000-000000000020" },
          xero_employee_id: { not: null },
        }),
      })
    );
    expect(mocks.xeroSyncCursorUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cursor_value: peopleList[19]?.id,
        }),
        where: expect.objectContaining({
          cursor_value: "70000000-0000-4000-8000-000000000020",
          entity_type: "leave_records",
          id: "cursor_1",
        }),
      })
    );
  });

  it("resets cursor to null on final page and clears stale_since", async () => {
    const cursorRecord = {
      cursor_value: "70000000-0000-4000-8000-000000000040",
      id: "cursor_1",
    };
    mocks.xeroSyncCursorFindFirst.mockResolvedValue(cursorRecord);

    const peopleList = Array.from({ length: 10 }, (_, i) =>
      person(
        `70000000-0000-4000-8000-${String(i + 41).padStart(12, "0")}`,
        `60000000-0000-4000-8000-${String(i + 41).padStart(12, "0")}`
      )
    );
    mocks.personFindMany.mockResolvedValueOnce(peopleList);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.xeroSyncCursorUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cursor_value: null,
        }),
      })
    );
    expect(mocks.xeroTenantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leave_records_stale_since: null,
        }),
      })
    );
  });

  it("resets cursor to null when candidate people count is exactly 20", async () => {
    const peopleList = Array.from({ length: 20 }, (_, i) =>
      person(
        `70000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
      )
    );
    mocks.personFindMany.mockResolvedValueOnce(peopleList);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.xeroSyncCursorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cursor_value: null,
        }),
      })
    );
  });

  it("uses deleted cursor value as valid lexical boundary", async () => {
    const deletedPersonId = "70000000-0000-4000-8000-000000000099";
    mocks.xeroSyncCursorFindFirst.mockResolvedValue({
      cursor_value: deletedPersonId,
      id: "cursor_1",
    });
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { gt: deletedPersonId },
        }),
      })
    );
  });

  it("stops immediately and does not advance cursor on blanket auth_error", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
      person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
    ]);
    mocks.fetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      error: { code: "auth_error", message: "Token expired or revoked" },
      ok: false,
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
    }
    expect(mocks.fetchLeaveForEmployeeForRegion).toHaveBeenCalledTimes(1);
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
  });

  it("stops immediately and does not advance cursor on blanket permission_error", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
      person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
    ]);
    mocks.fetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      error: { code: "permission_error", message: "Forbidden" },
      ok: false,
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
    }
    expect(mocks.fetchLeaveForEmployeeForRegion).toHaveBeenCalledTimes(1);
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
  });

  it("stops immediately and does not advance cursor on blanket rate_limit_error", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
      person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
    ]);
    mocks.fetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      error: { code: "rate_limit_error", message: "Rate limit exceeded" },
      ok: false,
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
    }
    expect(mocks.fetchLeaveForEmployeeForRegion).toHaveBeenCalledTimes(1);
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
  });

  it("stops immediately and does not advance cursor on blanket network_error", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
      person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
    ]);
    mocks.fetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      error: { code: "network_error", message: "Network timeout" },
      ok: false,
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
    }
    expect(mocks.fetchLeaveForEmployeeForRegion).toHaveBeenCalledTimes(1);
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
  });

  it("records employee-specific failure and continues to next employee, completing as partial_success and advancing cursor", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
      person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
    ]);
    mocks.fetchLeaveForEmployeeForRegion
      .mockResolvedValueOnce({
        error: { code: "validation_error", message: "Invalid employee format" },
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          complete: true,
          leaveRecords: [
            xeroLeaveRecord({
              employeeId: XERO_EMPLOYEE_ID_2,
              leaveApplicationId: LEAVE_APPLICATION_ID_2,
            }),
          ],
          rawResponse: {},
        },
      });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        failed: 1,
        fetched: 1,
        status: "partial_success",
        upserted: 1,
      });
    }
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_code: "validation_error",
          source_id: XERO_EMPLOYEE_ID,
        }),
      })
    );
    expect(mocks.xeroSyncCursorCreate).toHaveBeenCalled();
  });

  it("records failedRecord and skips stale archival when employee payload is incomplete (complete: false)", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.fetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: false,
        leaveRecords: [],
        rawResponse: { malformed: true },
      },
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 0,
        failed: 1,
        status: "partial_success",
        upserted: 0,
      });
    }
    expect(mocks.failedRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_code: "malformed_payload",
          source_id: XERO_EMPLOYEE_ID,
        }),
      })
    );
    expect(mocks.databaseTransaction).not.toHaveBeenCalled();
  });

  it("archives Person A's stale records without affecting Person B (completing A cannot archive B)", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.fetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [
          xeroLeaveRecord({
            employeeId: XERO_EMPLOYEE_ID,
            leaveApplicationId: LEAVE_APPLICATION_ID,
          }),
        ],
        rawResponse: {},
      },
    });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    expect(mocks.databaseTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: null,
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          person_id: PERSON_ID,
          source_remote_id: { notIn: [LEAVE_APPLICATION_ID] },
          source_type: "xero_leave",
          updated_at: { lte: expect.any(Date) },
        }),
      })
    );
    expect(mocks.availabilityRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: null,
          clerk_org_id: CLERK_ORG_ID,
          organisation_id: ORGANISATION_ID,
          person_id: PERSON_ID,
          source_remote_id: { notIn: [LEAVE_APPLICATION_ID] },
          source_type: "xero_leave",
          updated_at: { lte: expect.any(Date) },
        }),
      })
    );
  });

  it("archives stale records when an employee has 0 leave records in Xero (empty complete employee)", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.fetchLeaveForEmployeeForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        leaveRecords: [],
        rawResponse: {},
      },
    });
    mocks.availabilityRecordFindMany.mockResolvedValueOnce([
      { person_id: PERSON_ID },
    ]);
    mocks.availabilityRecordUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        archived: 2,
        failed: 0,
        fetched: 0,
        status: "succeeded",
        upserted: 0,
      });
    }
    expect(mocks.availabilityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: null,
          person_id: PERSON_ID,
          source_type: "xero_leave",
        }),
      })
    );
  });

  it("completes as cancelled when cursor update loses the compare-and-swap race", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);
    mocks.xeroSyncCursorFindFirst.mockResolvedValue({
      cursor_value: "old_cursor",
      id: "cursor_1",
    });
    mocks.xeroSyncCursorUpdateMany.mockResolvedValue({ count: 0 });

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("cancelled");
    }
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary:
            "Cursor update lost compare-and-swap race; run superseded",
          status: "cancelled",
        }),
      })
    );
  });

  it("completes as cancelled when cancellation is requested mid-run and does not advance cursor", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
      person(PERSON_ID_2, XERO_EMPLOYEE_ID_2),
    ]);
    mocks.syncRunFindFirst
      .mockResolvedValueOnce(null) // cancelDuplicateRun
      .mockResolvedValueOnce(null) // first person check
      .mockResolvedValueOnce({ cancel_requested_at: new Date() }); // second person check

    const result = await syncXeroLeaveRecords(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("cancelled");
    }
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
  });

  it("syncs targeted person without querying or touching cursor", async () => {
    mocks.personFindMany.mockResolvedValueOnce([
      person(PERSON_ID, XERO_EMPLOYEE_ID),
    ]);

    const result = await syncXeroLeaveRecords({
      ...input(),
      personId: PERSON_ID,
    });

    expect(result.ok).toBe(true);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: null,
          id: PERSON_ID,
          xero_employee_id: { not: null },
        }),
      })
    );
    expect(mocks.xeroSyncCursorFindFirst).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorCreate).not.toHaveBeenCalled();
    expect(mocks.xeroSyncCursorUpdateMany).not.toHaveBeenCalled();
  });
});

function configureExistingRecord(fields: {
  derived_sequence?: number;
  source_last_modified_at?: Date | null;
  source_remote_hash?: string | null;
  updated_at?: Date;
}) {
  mocks.fetchLeaveRecordsForRegion.mockResolvedValue({
    ok: true,
    value: {
      complete: true,
      leaveRecords: [xeroLeaveRecord()],
      rawResponse: {},
    },
  });
  mocks.personFindMany.mockResolvedValue([person(PERSON_ID, XERO_EMPLOYEE_ID)]);
  mocks.availabilityRecordFindMany
    .mockResolvedValueOnce([
      {
        approval_status: "approved",
        derived_sequence: fields.derived_sequence ?? 3,
        failed_action: null,
        id: "80000000-0000-4000-8000-000000000001",
        source_last_modified_at: fields.source_last_modified_at ?? null,
        source_remote_hash: fields.source_remote_hash ?? null,
        source_remote_id: LEAVE_APPLICATION_ID,
        source_type: "xero_leave",
        updated_at: fields.updated_at ?? new Date("2026-01-01T00:00:00.000Z"),
      },
    ])
    .mockResolvedValueOnce([]);
}

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
  sourceLastModifiedAt = new Date("2026-05-01T01:02:03.000Z"),
  sourceRemoteId,
}: {
  hash: string;
  personId: string;
  sourceLastModifiedAt?: Date | null;
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
    sourceLastModifiedAt,
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
    status:
      | "APPROVED"
      | "DELETED"
      | "REJECTED"
      | "SUBMITTED"
      | "UNKNOWN"
      | "WITHDRAWN";
    units: number;
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
    status: overrides.status ?? ("APPROVED" as const),
    title: "Annual leave",
    units: overrides.units ?? 15.2,
    updatedDateUtc: "2026-05-01T01:02:03.000Z",
  };
}
