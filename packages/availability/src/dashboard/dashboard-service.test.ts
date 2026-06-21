import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBillingSummaryForDashboard: vi.fn(),
  getCalendarRange: vi.fn(),
  getFeedSummaryForDashboard: vi.fn(),
  getPersonProfile: vi.fn(),
  getSettings: vi.fn(),
  hasActiveXeroConnection: vi.fn(),
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
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    organisation: { findFirst: mocks.organisationFindFirst },
    person: {
      count: mocks.personCount,
      findFirst: mocks.personFindFirst,
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
  hasActiveXeroConnection: mocks.hasActiveXeroConnection,
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
    mocks.organisationFindFirst.mockResolvedValue({ name: "Acme Org" });
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
            sourceType: "leavesync_leave",
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
            id: "location_1",
            name: "Brisbane",
            timezone: "Australia/Brisbane",
          },
          team: {
            id: "team_1",
          },
        },
      },
    });
    mocks.hasActiveXeroConnection.mockResolvedValue(true);
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
          assignments: [],
          archived_at: null,
          holiday_date: new Date("2026-04-25T00:00:00.000Z"),
          id: "holiday_1",
          location_id: "location_1",
          name: "ANZAC Day",
          source: "nager",
          team_id: null,
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
          createdAt: new Date("2026-04-19T08:00:00.000Z"),
          approvalStatus: "submitted",
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
          createdAt: new Date("2026-04-19T07:00:00.000Z"),
          approvalStatus: "xero_sync_failed",
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
  ] as const)("resolves %s role to %s", async (orgRole, directReportCount, expectedRole, person = {
    id: baseInput.personId,
  }) => {
    mocks.personFindFirst.mockResolvedValue(person);
    mocks.personCount.mockResolvedValue(directReportCount);

    const result = await resolveDashboardRole({
      clerkOrgId: baseInput.clerkOrgId,
      orgRole,
      organisationId: baseInput.organisationId,
      userId: baseInput.userId,
    });

    expect(result).toEqual({ ok: true, value: expectedRole });
  });

  it("builds the employee view and degrades balances when Xero is disconnected", async () => {
    mocks.hasActiveXeroConnection.mockResolvedValue(false);

    const result = await getEmployeeView(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.header).toMatchObject({
      firstName: "Ava",
      hasActiveXeroConnection: false,
      roleLabel: "Employee",
    });
    expect(result.value.actionItems).toMatchObject({
      status: "ready",
      data: {
        xeroSyncFailedRecords: [
          expect.objectContaining({
            failedAction: "submit",
            recordId: "record_failed",
          }),
        ],
      },
    });
    expect(result.value.upcoming).toMatchObject({
      status: "ready",
      data: {
        next14Days: expect.arrayContaining([
          expect.objectContaining({ recordId: "record_failed" }),
          expect.objectContaining({ recordId: "record_xero" }),
        ]),
      },
    });
    expect(result.value.publicHolidays).toMatchObject({
      status: "ready",
      data: {
        next: expect.objectContaining({ name: "ANZAC Day" }),
      },
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
      status: "ready",
      data: {
        pendingCount: 1,
        failedCount: 1,
      },
    });
    expect(result.value.teamToday).toMatchObject({
      status: "ready",
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
    });
  });

  it("builds the admin view and degrades only the billing card on failure", async () => {
    mocks.getBillingSummaryForDashboard.mockResolvedValue({
      ok: false,
      error: {
        code: "unknown_error",
        message: "Billing unavailable",
      },
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
      status: "ready",
      data: {
        activeCount: 2,
      },
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
          status: "ready",
          data: { visibleToAdmin: true },
        },
      },
    });
  });
});
