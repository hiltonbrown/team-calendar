import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityRecordGroupBy: vi.fn(),
  computeCurrentStatusForPeople: vi.fn(),
  getBillingSummaryForDashboard: vi.fn(),
  getCalendarRange: vi.fn(),
  getFeedSummaryForDashboard: vi.fn(),
  getPersonProfile: vi.fn(),
  getSettings: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  listEvents: vi.fn(),
  listForApprover: vi.fn(),
  listForOrganisation: vi.fn(),
  listForUser: vi.fn(),
  listMyRecords: vi.fn(),
  listPeople: vi.fn(),
  listRuns: vi.fn(),
  listTenantSummaries: vi.fn(),
  listUpcomingRecords: vi.fn(),
  managerScopePersonIds: vi.fn(),
  organisationFindFirst: vi.fn(),
  personCount: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    availabilityRecord: { groupBy: mocks.availabilityRecordGroupBy },
    organisation: { findFirst: mocks.organisationFindFirst },
    person: {
      count: mocks.personCount,
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
    },
  },
  scopedQuery: mocks.scopedQuery,
}));
vi.mock("@repo/feeds", () => ({
  getFeedSummaryForDashboard: mocks.getFeedSummaryForDashboard,
}));
vi.mock("@repo/notifications", () => ({
  listForUser: mocks.listForUser,
}));
vi.mock("../approvals/approval-service", () => ({
  listForApprover: mocks.listForApprover,
}));
vi.mock("../calendar/calendar-service", () => ({
  getCalendarRange: mocks.getCalendarRange,
}));
vi.mock("../holidays/holiday-service", () => ({
  listForOrganisation: mocks.listForOrganisation,
}));
vi.mock("../people/current-status", () => ({
  computeCurrentStatusForPeople: mocks.computeCurrentStatusForPeople,
}));
vi.mock("../people/people-service", () => ({
  getPersonProfile: mocks.getPersonProfile,
  listPeople: mocks.listPeople,
  listUpcomingRecords: mocks.listUpcomingRecords,
}));
vi.mock("../plans/plan-service", () => ({
  listMyRecords: mocks.listMyRecords,
}));
vi.mock("../settings/audit-log-service", () => ({
  listEvents: mocks.listEvents,
}));
vi.mock("../settings/billing-service", () => ({
  getBillingSummaryForDashboard: mocks.getBillingSummaryForDashboard,
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: mocks.managerScopePersonIds,
}));
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: mocks.getSettings,
}));
vi.mock("../sync/sync-monitor-service", () => ({
  listRuns: mocks.listRuns,
  listTenantSummaries: mocks.listTenantSummaries,
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
const { getAdminView, getEmployeeView, getManagerView, resolveDashboardRole } =
  await import("./dashboard-service");
const baseInput = {
  actingRole: "employee" as const,
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000011",
  userId: "user_1",
};
describe("dashboard-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00.000Z"));
    vi.clearAllMocks();
    mocks.personFindFirst.mockResolvedValue({ id: baseInput.personId });
    mocks.personCount.mockResolvedValue(0);
    mocks.organisationFindFirst.mockResolvedValue({
      country_code: "AU",
      name: "Acme Org",
    });
    mocks.getPersonProfile.mockResolvedValue({
      ok: true,
      value: {
        balances: {
          balancesLastFetchedAt: new Date("2026-04-18T09:00:00.000Z"),
          rows: [
            {
              balanceUnits: 12,
              id: "balance_1",
              leaveTypeName: "Annual Leave",
              recordType: "annual_leave",
              unitType: "days",
            },
          ],
          xeroLinked: true,
        },
        currentStatus: {
          activePublicHoliday: null,
          activeRecord: {
            approvalStatus: "approved",
            endsAt: new Date("2026-04-19T23:59:59.999Z"),
            id: "record_active",
            recordType: "annual_leave",
            sourceType: "team_calendar_leave",
            startsAt: new Date("2026-04-19T00:00:00.000Z"),
            title: null,
          },
          approvalStatus: "approved",
          contactabilityStatus: "contactable",
          label: "Annual leave",
          recordType: "annual_leave",
          statusKey: "annual_leave",
        },
        header: {
          firstName: "Ava",
          lastName: "Nguyen",
          location: {
            countryCode: "AU",
            id: "location_1",
            name: "Brisbane",
            regionCode: "QLD",
            timezone: "Australia/Brisbane",
          },
          team: {
            id: "team_1",
          },
        },
      },
    });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.listMyRecords.mockImplementation(({ filters }) => {
      if (filters.approvalStatus?.includes("xero_sync_failed")) {
        return {
          ok: true,
          value: [
            {
              approvedAt: null,
              endsAt: new Date("2026-04-21T23:59:59.999Z"),
              failedAction: "submit",
              id: "record_failed",
              recordType: "annual_leave",
              startsAt: new Date("2026-04-20T00:00:00.000Z"),
              xeroWriteError: "Balance mismatch",
            },
          ],
        };
      }
      if (filters.approvalStatus?.includes("declined")) {
        return {
          ok: true,
          value: [
            {
              approvalNote: "Need more notice",
              approvedAt: new Date("2026-04-18T09:00:00.000Z"),
              endsAt: new Date("2026-04-25T23:59:59.999Z"),
              id: "record_declined",
              recordType: "annual_leave",
              startsAt: new Date("2026-04-24T00:00:00.000Z"),
            },
          ],
        };
      }
      return {
        ok: true,
        value: [
          {
            allDay: true,
            approvalStatus: "draft",
            endsAt: new Date("2026-04-28T23:59:59.999Z"),
            id: "record_upcoming",
            recordType: "wfh",
            startsAt: new Date("2026-04-28T00:00:00.000Z"),
          },
        ],
      };
    });
    mocks.listUpcomingRecords.mockResolvedValue({
      ok: true,
      value: {
        records: [
          {
            allDay: true,
            approvalStatus: "approved",
            endsAt: new Date("2026-04-29T23:59:59.999Z"),
            id: "record_xero",
            recordType: "annual_leave",
            sourceType: "xero_leave",
            startsAt: new Date("2026-04-29T00:00:00.000Z"),
          },
        ],
      },
    });
    mocks.listForUser.mockResolvedValue({
      ok: true,
      value: {
        notifications: [
          {
            actionUrl: "/notifications/1",
            body: "Please add more detail",
            createdAt: new Date("2026-04-19T09:00:00.000Z"),
            id: "notification_1",
            title: "More information requested",
            type: "leave_info_requested",
          },
        ],
      },
    });
    mocks.listForOrganisation.mockResolvedValue({
      ok: true,
      value: [
        {
          archived_at: null,
          assignments: [],
          country_code: "AU",
          default_classification: "non_working",
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          id: "holiday_1",
          name: "ANZAC Day",
          region_code: null,
          source: "nager",
          type: "public",
        },
      ],
    });
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: {
        managerVisibilityScope: "direct_reports_only",
      },
    });
    mocks.managerScopePersonIds.mockResolvedValue([
      baseInput.personId,
      "00000000-0000-4000-8000-000000000012",
    ]);
    mocks.personFindMany.mockResolvedValue([
      {
        first_name: "Ari",
        id: "00000000-0000-4000-8000-000000000012",
        last_name: "Report",
        location_id: null,
      },
      {
        first_name: "Sam",
        id: "00000000-0000-4000-8000-000000000013",
        last_name: "Home",
        location_id: null,
      },
      {
        first_name: "Lee",
        id: "00000000-0000-4000-8000-000000000014",
        last_name: "Ready",
        location_id: null,
      },
    ]);
    mocks.availabilityRecordGroupBy.mockResolvedValue([
      {
        _count: { _all: 1 },
        person_id: "00000000-0000-4000-8000-000000000012",
      },
    ]);
    mocks.computeCurrentStatusForPeople.mockResolvedValue(
      new Map([
        [
          "00000000-0000-4000-8000-000000000012",
          {
            activePublicHoliday: null,
            activeRecord: {
              endsAt: new Date("2026-04-22T23:59:59.999Z"),
              recordType: "annual_leave",
              startsAt: new Date("2026-04-20T00:00:00.000Z"),
            },
            approvalStatus: "approved",
            contactabilityStatus: "unavailable",
            label: "On annual leave",
            recordType: "annual_leave",
            statusKey: "on_leave",
          },
        ],
        [
          "00000000-0000-4000-8000-000000000013",
          {
            activePublicHoliday: null,
            activeRecord: {
              endsAt: new Date("2026-04-20T23:59:59.999Z"),
              recordType: "wfh",
              startsAt: new Date("2026-04-20T00:00:00.000Z"),
            },
            approvalStatus: "approved",
            contactabilityStatus: "contactable",
            label: "Working from home",
            recordType: "wfh",
            statusKey: "wfh",
          },
        ],
        [
          "00000000-0000-4000-8000-000000000014",
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: null,
            contactabilityStatus: null,
            label: "Available",
            recordType: null,
            statusKey: "available",
          },
        ],
      ])
    );
    mocks.listPeople.mockResolvedValue({
      ok: true,
      value: {
        nextCursor: null,
        people: [
          {
            currentStatus: {
              activePublicHoliday: null,
              activeRecord: {
                endsAt: new Date("2026-04-22T23:59:59.999Z"),
                recordType: "annual_leave",
                startsAt: new Date("2026-04-20T00:00:00.000Z"),
              },
              approvalStatus: "approved",
              contactabilityStatus: "unavailable",
              label: "On annual leave",
              recordType: "annual_leave",
              statusKey: "on_leave",
            },
            firstName: "Ari",
            id: "00000000-0000-4000-8000-000000000012",
            lastName: "Report",
            xeroSyncFailedCount: 1,
          },
          {
            currentStatus: {
              activePublicHoliday: null,
              activeRecord: {
                endsAt: new Date("2026-04-20T23:59:59.999Z"),
                recordType: "wfh",
                startsAt: new Date("2026-04-20T00:00:00.000Z"),
              },
              approvalStatus: "approved",
              contactabilityStatus: "contactable",
              label: "Working from home",
              recordType: "wfh",
              statusKey: "wfh",
            },
            firstName: "Sam",
            id: "00000000-0000-4000-8000-000000000013",
            lastName: "Home",
            xeroSyncFailedCount: 0,
          },
          {
            currentStatus: {
              activePublicHoliday: null,
              activeRecord: null,
              approvalStatus: null,
              contactabilityStatus: null,
              label: "Available",
              recordType: null,
              statusKey: "available",
            },
            firstName: "Lee",
            id: "00000000-0000-4000-8000-000000000014",
            lastName: "Ready",
            xeroSyncFailedCount: 0,
          },
        ],
        totalCount: 3,
      },
    });
    mocks.listForApprover.mockResolvedValue({
      ok: true,
      value: [
        {
          approvalStatus: "submitted",
          createdAt: new Date("2026-04-19T08:00:00.000Z"),
          endsAt: new Date("2026-04-26T23:59:59.999Z"),
          failedAction: null,
          id: "approval_1",
          person: { firstName: "Luca", lastName: "Brown" },
          recordType: "annual_leave",
          startsAt: new Date("2026-04-26T00:00:00.000Z"),
          submittedAt: new Date("2026-04-19T08:00:00.000Z"),
          xeroWriteError: null,
        },
        {
          approvalStatus: "xero_sync_failed",
          createdAt: new Date("2026-04-19T07:00:00.000Z"),
          endsAt: new Date("2026-04-27T23:59:59.999Z"),
          failedAction: "approve",
          id: "approval_2",
          person: { firstName: "Mia", lastName: "Stone" },
          recordType: "annual_leave",
          startsAt: new Date("2026-04-27T00:00:00.000Z"),
          submittedAt: new Date("2026-04-19T07:00:00.000Z"),
          xeroWriteError: "Balance mismatch",
        },
      ],
    });
    mocks.getCalendarRange.mockResolvedValue({
      ok: true,
      value: {
        days: [
          {
            date: new Date("2026-04-21T00:00:00.000Z"),
            events: [
              {
                approvalStatus: "approved",
                endsAt: new Date("2026-04-21T23:59:59.999Z"),
                id: "event_1",
                person: { firstName: "Luca", lastName: "Brown" },
                personId: "00000000-0000-4000-8000-000000000012",
                recordType: "annual_leave",
                renderTreatment: "solid",
                startsAt: new Date("2026-04-21T00:00:00.000Z"),
              },
            ],
          },
        ],
        people: [
          {
            firstName: "Luca",
            id: "00000000-0000-4000-8000-000000000012",
            lastName: "Brown",
          },
        ],
        range: {
          end: new Date("2026-04-27T23:59:59.999Z"),
          start: new Date("2026-04-21T00:00:00.000Z"),
        },
        totalPeopleInScope: 3,
      },
    });
    mocks.listTenantSummaries.mockResolvedValue({
      ok: true,
      value: [
        {
          connectionStatus: "active",
          lastApprovalReconciliation: new Date("2026-04-19T08:30:00.000Z"),
          lastLeaveBalancesSync: null,
          lastLeaveRecordsSync: null,
          lastPeopleSync: null,
          pendingFailedRecords: 2,
        },
      ],
    });
    mocks.listRuns.mockResolvedValue({
      ok: true,
      value: {
        runs: [{ status: "completed" }, { status: "failed" }],
      },
    });
    mocks.getFeedSummaryForDashboard.mockResolvedValue({
      ok: true,
      value: {
        activeCount: 2,
        lastRenderedAt: new Date("2026-04-19T08:00:00.000Z"),
        pausedCount: 1,
      },
    });
    mocks.getBillingSummaryForDashboard.mockResolvedValue({
      ok: true,
      value: {
        hasContactFlow: false,
        hasUpgradeFlow: false,
        isOverLimit: false,
        plan: {
          currentPeriodEnd: null,
          key: "pro",
          label: "Pro",
          seatsPurchased: 10,
          status: "active",
        },
        usage: [
          {
            currentValue: 12,
            label: "People",
            limit: 500,
            metricKey: "people_count",
            unit: "people",
          },
        ],
        visibleToAdmin: false,
      },
    });
    mocks.listEvents.mockResolvedValue({
      ok: true,
      value: {
        events: [
          {
            action: "availability_records.submitted",
            actorDisplay: "Ava Nguyen",
            createdAt: new Date("2026-04-19T08:45:00.000Z"),
            entityType: "availability_record",
            id: "audit_1",
          },
        ],
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it.each([
    ["org:owner", 3, "owner"],
    ["org:admin", 3, "admin"],
    ["org:viewer", 2, "manager"],
    ["org:viewer", 0, "employee"],
    ["org:viewer", 0, "viewer", null],
  ] as const)(
    "resolves %s role to %s",
    async (orgRole, directReportCount, expectedRole, person = {
      id: baseInput.personId,
    }) => {
      mocks.personFindFirst.mockResolvedValue(person);
      mocks.personCount.mockResolvedValue(directReportCount);
      const result = await resolveDashboardRole({
        clerkOrgId: baseInput.clerkOrgId,
        organisationId: baseInput.organisationId,
        orgRole,
        userId: baseInput.userId,
      });
      expect(result).toEqual({ ok: true, value: expectedRole });
    }
  );
  it("preserves unavailable in the employee DTO rather than reporting disconnected", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      error: { code: "state_unavailable" },
      ok: false,
    });
    const result = await getEmployeeView(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.header.xeroConnectionState).toBe("unavailable");
    if (result.value.balances.status === "ready") {
      expect(result.value.balances.data.xeroConnectionState).toBe(
        "unavailable"
      );
    }
  });
  it("builds the employee view and degrades balances when Xero is disconnected", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    const result = await getEmployeeView(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.header).toMatchObject({
      firstName: "Ava",
      roleLabel: "Employee",
      xeroConnectionState: "not_connected",
    });
    expect(result.value.actionItems).toMatchObject({
      data: {
        xeroSyncFailedRecords: [
          expect.objectContaining({
            failedAction: "submit",
            recordId: "record_failed",
          }),
        ],
      },
      status: "ready",
    });
    expect(result.value.upcoming).toMatchObject({
      data: {
        next14Days: expect.arrayContaining([
          expect.objectContaining({ recordId: "record_failed" }),
          expect.objectContaining({ recordId: "record_xero" }),
        ]),
      },
      status: "ready",
    });
    expect(result.value.publicHolidays).toMatchObject({
      data: {
        next: expect.objectContaining({ name: "ANZAC Day" }),
      },
      status: "ready",
    });
    expect(mocks.getPersonProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: baseInput.clerkOrgId,
        organisationId: baseInput.organisationId,
      })
    );
  });
  it("builds the manager view with team sections and all-team scope label", async () => {
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: {
        managerVisibilityScope: "all_team_leave",
      },
    });
    const result = await getManagerView({
      ...baseInput,
      actingRole: "manager",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.header).toMatchObject({
      roleLabel: "Manager",
      scopeLabel: "1 team members (direct + indirect)",
    });
    expect(result.value.approvalQueue).toMatchObject({
      data: {
        failedCount: 1,
        pendingCount: 1,
      },
      status: "ready",
    });
    expect(result.value.teamToday).toMatchObject({
      data: {
        peopleAvailableCount: 1,
        peopleNeedingAttention: [
          expect.objectContaining({
            personFirstName: "Ari",
            statusLabel: "Xero sync failed",
          }),
          expect.objectContaining({
            personFirstName: "Sam",
            statusLabel: "Working from home",
          }),
        ],
        peopleOnLeaveCount: 1,
        peopleWorkingFromHomeCount: 1,
      },
      status: "ready",
    });
  });
  it("builds the manager view with a direct-reports-only scope label and reuses the resolved scope for the team query", async () => {
    mocks.personCount.mockResolvedValue(1);
    const result = await getManagerView({
      ...baseInput,
      actingRole: "manager",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.header).toMatchObject({
      directReportCount: 1,
      roleLabel: "Manager",
      scopeLabel: "1 direct reports",
    });
    expect(mocks.managerScopePersonIds).toHaveBeenCalledTimes(1);
    expect(mocks.listPeople).not.toHaveBeenCalled();
    expect(mocks.personFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.personFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: [baseInput.personId, "00000000-0000-4000-8000-000000000012"],
          },
        }),
      })
    );
  });
  it("computes every current-status bucket and orders the attention list by severity", async () => {
    const ids = {
      leave: "00000000-0000-4000-8000-000000000101",
      other: "00000000-0000-4000-8000-000000000106",
      pending: "00000000-0000-4000-8000-000000000102",
      syncFailedButAvailable: "00000000-0000-4000-8000-000000000107",
      travel: "00000000-0000-4000-8000-000000000105",
      wfh: "00000000-0000-4000-8000-000000000104",
      whollyAvailable: "00000000-0000-4000-8000-000000000100",
    };
    mocks.managerScopePersonIds.mockResolvedValue([
      baseInput.personId,
      ...Object.values(ids),
    ]);
    mocks.personFindMany.mockResolvedValue([
      {
        first_name: "Ada",
        id: ids.whollyAvailable,
        last_name: "Free",
        location_id: null,
      },
      {
        first_name: "Bea",
        id: ids.leave,
        last_name: "Leave",
        location_id: null,
      },
      {
        first_name: "Cal",
        id: ids.pending,
        last_name: "Pending",
        location_id: null,
      },
      {
        first_name: "Dee",
        id: ids.wfh,
        last_name: "Wfh",
        location_id: null,
      },
      {
        first_name: "Eve",
        id: ids.travel,
        last_name: "Travel",
        location_id: null,
      },
      {
        first_name: "Fay",
        id: ids.other,
        last_name: "Client",
        location_id: null,
      },
      {
        first_name: "Gia",
        id: ids.syncFailedButAvailable,
        last_name: "Failed",
        location_id: null,
      },
    ]);
    mocks.availabilityRecordGroupBy.mockResolvedValue([
      { _count: { _all: 2 }, person_id: ids.syncFailedButAvailable },
    ]);
    mocks.computeCurrentStatusForPeople.mockResolvedValue(
      new Map([
        [
          ids.whollyAvailable,
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: null,
            contactabilityStatus: null,
            label: "Available",
            recordType: null,
            statusKey: "available",
          },
        ],
        [
          ids.leave,
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: "approved",
            contactabilityStatus: "unavailable",
            label: "On annual leave",
            recordType: "annual_leave",
            statusKey: "on_leave",
          },
        ],
        [
          ids.pending,
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: "submitted",
            contactabilityStatus: "unavailable",
            label: "Leave pending approval",
            recordType: "annual_leave",
            statusKey: "pending_leave",
          },
        ],
        [
          ids.wfh,
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: "approved",
            contactabilityStatus: "contactable",
            label: "Working from home",
            recordType: "wfh",
            statusKey: "wfh",
          },
        ],
        [
          ids.travel,
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: "approved",
            contactabilityStatus: "contactable",
            label: "Travelling",
            recordType: "travelling",
            statusKey: "travelling",
          },
        ],
        [
          ids.other,
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: "approved",
            contactabilityStatus: "contactable",
            label: "At client site",
            recordType: "client_site",
            statusKey: "client_site",
          },
        ],
        [
          ids.syncFailedButAvailable,
          {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: null,
            contactabilityStatus: null,
            label: "Available",
            recordType: null,
            statusKey: "available",
          },
        ],
      ])
    );
    const result = await getManagerView({
      ...baseInput,
      actingRole: "manager",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.teamToday).toMatchObject({
      data: {
        peopleAvailableCount: 2,
        peopleNeedingAttention: [
          expect.objectContaining({
            personId: ids.syncFailedButAvailable,
            statusLabel: "Xero sync failed",
            xeroSyncFailedCount: 2,
          }),
          expect.objectContaining({
            personId: ids.leave,
            statusLabel: "On annual leave",
          }),
          expect.objectContaining({
            personId: ids.pending,
            statusLabel: "Leave pending approval",
          }),
          expect.objectContaining({
            personId: ids.wfh,
            statusLabel: "Working from home",
          }),
          expect.objectContaining({
            personId: ids.travel,
            statusLabel: "Travelling",
          }),
          expect.objectContaining({
            personId: ids.other,
            statusLabel: "At client site",
          }),
        ],
        peopleOnLeaveCount: 1,
        peopleOtherOooCount: 2,
        peopleTravellingCount: 1,
        peopleWithXeroSyncFailedCount: 1,
        peopleWorkingFromHomeCount: 1,
      },
      status: "ready",
    });
  });
  it.each([1, 200, 201])(
    "keeps a constant query count for %i visible people and never pages through listPeople",
    async (scopeSize) => {
      const ids = Array.from(
        { length: scopeSize },
        (_, index) =>
          `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`
      );
      mocks.managerScopePersonIds.mockResolvedValue([
        baseInput.personId,
        ...ids,
      ]);
      mocks.personFindMany.mockResolvedValue(
        ids.map((id, index) => ({
          first_name: `Person${index}`,
          id,
          last_name: "Test",
          location_id: null,
        }))
      );
      mocks.availabilityRecordGroupBy.mockResolvedValue([]);
      mocks.computeCurrentStatusForPeople.mockResolvedValue(
        new Map(
          ids.map((id) => [
            id,
            {
              activePublicHoliday: null,
              activeRecord: null,
              approvalStatus: null,
              contactabilityStatus: null,
              label: "Available",
              recordType: null,
              statusKey: "available",
            },
          ])
        )
      );
      const result = await getManagerView({
        ...baseInput,
        actingRole: "manager",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.teamToday).toMatchObject({
        data: { peopleAvailableCount: scopeSize },
        status: "ready",
      });
      expect(mocks.managerScopePersonIds).toHaveBeenCalledTimes(1);
      expect(mocks.personFindMany).toHaveBeenCalledTimes(1);
      expect(mocks.availabilityRecordGroupBy).toHaveBeenCalledTimes(1);
      expect(mocks.computeCurrentStatusForPeople).toHaveBeenCalledTimes(1);
      expect(mocks.listPeople).not.toHaveBeenCalled();
    }
  );
  it("builds the admin view and degrades only the billing card on failure", async () => {
    mocks.getBillingSummaryForDashboard.mockResolvedValue({
      error: {
        code: "unknown_error",
        message: "Billing unavailable",
      },
      ok: false,
    });
    const result = await getAdminView({
      ...baseInput,
      actingRole: "admin",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.header).toMatchObject({
      organisationName: "Acme Org",
      roleLabel: "Admin",
      totalActivePeopleCount: 3,
    });
    expect(result.value.activeFeeds).toMatchObject({
      data: {
        activeCount: 2,
      },
      status: "ready",
    });
    expect(result.value.usageVsLimits).toEqual({
      message: "Billing unavailable",
      status: "error",
    });
  });
  it("builds the owner admin view with visible billing actions", async () => {
    mocks.getBillingSummaryForDashboard.mockResolvedValue({
      ok: true,
      value: {
        hasContactFlow: false,
        hasUpgradeFlow: true,
        isOverLimit: false,
        plan: {
          currentPeriodEnd: null,
          key: "pro",
          label: "Pro",
          seatsPurchased: 10,
          status: "active",
        },
        usage: [],
        visibleToAdmin: true,
      },
    });
    const result = await getAdminView({
      ...baseInput,
      actingRole: "owner",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        header: { roleLabel: "Owner" },
        usageVsLimits: {
          data: { visibleToAdmin: true },
          status: "ready",
        },
      },
    });
  });
  describe("public holiday card applicability aligns with canonical rules", () => {
    const holidayDate = new Date("2026-04-25T00:00:00.000Z");
    it("matches regional holiday for a person with matching location region", async () => {
      mocks.listForOrganisation.mockResolvedValue({
        ok: true,
        value: [
          {
            archived_at: null,
            assignments: [],
            country_code: "AU",
            default_classification: "non_working",
            holiday_date: holidayDate,
            id: "holiday_qld",
            name: "QLD Day",
            region_code: "QLD",
            source: "nager",
            type: "public",
          },
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toMatchObject({
        data: {
          daysUntil: 5,
          next: expect.objectContaining({ id: "holiday_qld", name: "QLD Day" }),
        },
        status: "ready",
      });
    });
    it("skips regional holiday when person is in a different region", async () => {
      mocks.listForOrganisation.mockResolvedValue({
        ok: true,
        value: [
          {
            archived_at: null,
            assignments: [],
            country_code: "AU",
            default_classification: "non_working",
            holiday_date: holidayDate,
            id: "holiday_nsw",
            name: "NSW Day",
            region_code: "NSW",
            source: "nager",
            type: "public",
          },
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toMatchObject({
        data: {
          daysUntil: null,
          next: null,
        },
        status: "ready",
      });
    });
    it("applies custom holiday to actor regardless of country code", async () => {
      mocks.listForOrganisation.mockResolvedValue({
        ok: true,
        value: [
          {
            archived_at: null,
            assignments: [],
            country_code: "CUSTOM",
            default_classification: "non_working",
            holiday_date: holidayDate,
            id: "holiday_custom",
            name: "Company Wide Day",
            region_code: null,
            source: "manual",
            type: "custom",
          },
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toMatchObject({
        data: {
          daysUntil: 5,
          next: expect.objectContaining({
            id: "holiday_custom",
            name: "Company Wide Day",
          }),
        },
        status: "ready",
      });
    });
    it("applies location override from working to non_working", async () => {
      mocks.listForOrganisation.mockResolvedValue({
        ok: true,
        value: [
          {
            archived_at: null,
            assignments: [
              {
                archived_at: null,
                day_classification: "non_working",
                scope_type: "location",
                scope_value: "location_1",
              },
            ],
            country_code: "AU",
            default_classification: "working",
            holiday_date: holidayDate,
            id: "holiday_override_non_working",
            name: "Overridden Working Day",
            region_code: null,
            source: "nager",
            type: "observance",
          },
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toMatchObject({
        data: {
          daysUntil: 5,
          next: expect.objectContaining({
            id: "holiday_override_non_working",
            name: "Overridden Working Day",
          }),
        },
        status: "ready",
      });
    });
    it("skips non_working holiday when overridden to working for person location", async () => {
      mocks.listForOrganisation.mockResolvedValue({
        ok: true,
        value: [
          {
            archived_at: null,
            assignments: [
              {
                archived_at: null,
                day_classification: "working",
                scope_type: "location",
                scope_value: "location_1",
              },
            ],
            country_code: "AU",
            default_classification: "non_working",
            holiday_date: holidayDate,
            id: "holiday_override_working",
            name: "Working In Brisbane",
            region_code: null,
            source: "nager",
            type: "public",
          },
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toMatchObject({
        data: {
          daysUntil: null,
          next: null,
        },
        status: "ready",
      });
    });
    it("uses organisation country fallback for a person without location", async () => {
      mocks.getPersonProfile.mockResolvedValue({
        ok: true,
        value: {
          balances: {
            balancesLastFetchedAt: null,
            rows: [],
            xeroLinked: false,
          },
          currentStatus: {
            activePublicHoliday: null,
            activeRecord: null,
            approvalStatus: null,
            contactabilityStatus: null,
            label: "Available",
            recordType: null,
            statusKey: "available",
          },
          header: {
            firstName: "Sam",
            lastName: "Unassigned",
            location: null,
            team: null,
          },
        },
      });
      mocks.listForOrganisation.mockResolvedValue({
        ok: true,
        value: [
          {
            archived_at: null,
            assignments: [],
            country_code: "AU",
            default_classification: "non_working",
            holiday_date: holidayDate,
            id: "holiday_national",
            name: "National Day",
            region_code: null,
            source: "nager",
            type: "public",
          },
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toMatchObject({
        data: {
          daysUntil: 5,
          next: expect.objectContaining({
            id: "holiday_national",
            name: "National Day",
          }),
        },
        status: "ready",
      });
    });
    it("treats organisation, team, person, and feed assignments as inert", async () => {
      mocks.listForOrganisation.mockResolvedValue({
        ok: true,
        value: [
          {
            archived_at: null,
            assignments: [
              {
                archived_at: null,
                day_classification: "working",
                scope_type: "organisation",
                scope_value: baseInput.organisationId,
              },
              {
                archived_at: null,
                day_classification: "working",
                scope_type: "team",
                scope_value: "team_1",
              },
              {
                archived_at: null,
                day_classification: "working",
                scope_type: "person",
                scope_value: baseInput.personId,
              },
              {
                archived_at: null,
                day_classification: "working",
                scope_type: "feed",
                scope_value: "feed_1",
              },
            ],
            country_code: "AU",
            default_classification: "non_working",
            holiday_date: holidayDate,
            id: "holiday_inert_scopes",
            name: "Inert Scopes National Day",
            region_code: null,
            source: "nager",
            type: "public",
          },
        ],
      });
      const result = await getEmployeeView(baseInput);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.publicHolidays).toMatchObject({
        data: {
          daysUntil: 5,
          next: expect.objectContaining({
            id: "holiday_inert_scopes",
            name: "Inert Scopes National Day",
          }),
        },
        status: "ready",
      });
    });
  });
});
