import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  availabilityCount: vi.fn(),
  availabilityFindFirst: vi.fn(),
  availabilityFindMany: vi.fn(),
  availabilityUpdateMany: vi.fn(),
  approveLeaveApplicationForRegion: vi.fn(),
  computeWorkingDaysFromReferenceData: vi.fn(),
  computeWorkingDays: vi.fn(),
  declineLeaveApplicationForRegion: vi.fn(),
  dispatchNotification: vi.fn(),
  getSettings: vi.fn(),
  hasActiveXeroConnection: vi.fn(),
  leaveBalanceFindMany: vi.fn(),
  leaveBalanceFindFirst: vi.fn(),
  listForOrganisation: vi.fn(),
  locationFindMany: vi.fn(),
  materialiseAvailabilityPublication: vi.fn(() =>
    Promise.resolve({ ok: true, value: undefined })
  ),
  managerScopePersonIds: vi.fn(),
  organisationFindFirst: vi.fn(),
  resolveXeroEmployeeId: vi.fn(),
  workingDayYearsForInput: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      await callback({
        auditEvent: { create: mocks.auditCreate },
        availabilityRecord: { updateMany: mocks.availabilityUpdateMany },
      }),
    auditEvent: { findMany: mocks.auditCreate },
    availabilityRecord: {
      count: mocks.availabilityCount,
      findFirst: mocks.availabilityFindFirst,
      findMany: mocks.availabilityFindMany,
    },
    leaveBalance: {
      findFirst: mocks.leaveBalanceFindFirst,
      findMany: mocks.leaveBalanceFindMany,
    },
    location: { findMany: mocks.locationFindMany },
    organisation: { findFirst: mocks.organisationFindFirst },
    xeroTenant: { findFirst: mocks.xeroTenantFindFirst },
  },
}));
vi.mock("../duration/working-days", () => ({
  computeWorkingDays: mocks.computeWorkingDays,
  computeWorkingDaysFromReferenceData:
    mocks.computeWorkingDaysFromReferenceData,
  workingDayYearsForInput: mocks.workingDayYearsForInput,
}));
vi.mock("../holidays/holiday-service", () => ({
  listForOrganisation: mocks.listForOrganisation,
}));
vi.mock("../xero-connection-state", () => ({
  hasActiveXeroConnection: mocks.hasActiveXeroConnection,
}));
vi.mock("../settings/organisation-settings-service", () => ({
  getSettings: mocks.getSettings,
}));
vi.mock("../settings/manager-scope", () => ({
  managerScopePersonIds: mocks.managerScopePersonIds,
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatchNotification,
}));
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
}));

const mockPort = {
  resolveEmployeeId: mocks.resolveXeroEmployeeId,
  resolveLeaveTypeId: vi.fn(),
  submitLeaveApplication: vi.fn(),
  withdrawLeaveApplication: vi.fn(),
  approveLeaveApplication: mocks.approveLeaveApplicationForRegion,
  declineLeaveApplication: mocks.declineLeaveApplicationForRegion,
};

const {
  approve,
  decline,
  listForApprover,
  requestMoreInfo,
  revertApprovalAttempt,
  retryApproval,
  retryDecline,
} = await import("./approval-service");

const input = {
  actingPersonId: "00000000-0000-4000-8000-000000000012",
  actingUserId: "manager_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000099",
  role: "manager" as const,
};

const record = {
  all_day: true,
  approval_note: null,
  approval_status: "submitted",
  approved_at: null,
  approved_by_person_id: null,
  archived_at: null,
  clerk_org_id: input.clerkOrgId,
  contactability: "unavailable",
  created_at: new Date("2026-04-01T00:00:00.000Z"),
  created_by_user_id: "employee_1",
  derived_sequence: 4,
  ends_at: new Date("2026-05-05T23:59:59.999Z"),
  failed_action: null,
  id: input.recordId,
  notes_internal: "Family event",
  organisation_id: input.organisationId,
  person: {
    clerk_user_id: "employee_1",
    email: "employee@example.com",
    first_name: "Ava",
    id: "00000000-0000-4000-8000-000000000011",
    last_name: "Nguyen",
    location_id: null,
    manager_person_id: input.actingPersonId,
    team: { name: "Operations" },
  },
  person_id: "00000000-0000-4000-8000-000000000011",
  record_type: "annual_leave",
  source_remote_id: "xero-leave-1",
  source_type: "team_calendar_leave",
  starts_at: new Date("2026-05-04T00:00:00.000Z"),
  submitted_at: new Date("2026-04-01T00:00:00.000Z"),
  xero_write_error: null,
};

const xeroTenant = {
  clerk_org_id: input.clerkOrgId,
  id: "00000000-0000-4000-8000-000000000201",
  organisation_id: input.organisationId,
  payroll_region: "AU",
  xero_connection: {
    access_token_encrypted: "token",
    revoked_at: null,
  },
  xero_tenant_id: "xero-tenant-1",
};

describe("approval-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });
    mocks.computeWorkingDaysFromReferenceData.mockReturnValue({
      ok: true,
      value: 2,
    });
    mocks.hasActiveXeroConnection.mockResolvedValue(true);
    mocks.leaveBalanceFindMany.mockResolvedValue([
      {
        balance: 10,
        balance_unit: "days",
        person_id: record.person_id,
        record_type: record.record_type,
        updated_at: new Date("2026-04-01T00:00:00.000Z"),
      },
    ]);
    mocks.leaveBalanceFindFirst.mockResolvedValue({
      balance: 10,
      balance_unit: "days",
      updated_at: new Date("2026-04-01T00:00:00.000Z"),
    });
    mocks.listForOrganisation.mockResolvedValue({ ok: true, value: [] });
    mocks.locationFindMany.mockResolvedValue([]);
    mocks.dispatchNotification.mockResolvedValue({
      ok: true,
      value: { emailQueued: false, inAppDelivered: true },
    });
    mocks.getSettings.mockResolvedValue({
      ok: true,
      value: {
        defaultFeedPrivacyMode: "named",
        defaultLeaveRequestAdvanceDays: 0,
        defaultPrivacyMode: "named",
        feedsIncludePublicHolidaysDefault: false,
        id: "settings_1",
        managerVisibilityScope: "direct_reports_only",
        notifyManagersOnStatusChange: true,
        organisationId: input.organisationId,
        requireDeclineReason: true,
        showDeclinedOnApprovals: true,
        showPendingOnCalendar: true,
      },
    });
    mocks.organisationFindFirst.mockResolvedValue({
      country_code: "AU",
      timezone: "Australia/Brisbane",
    });
    mocks.resolveXeroEmployeeId.mockResolvedValue({
      ok: true,
      value: "employee-1",
    });
    mocks.managerScopePersonIds.mockResolvedValue([record.person_id]);
    mocks.workingDayYearsForInput.mockReturnValue({
      ok: true,
      value: [2026],
    });
    mocks.xeroTenantFindFirst.mockResolvedValue(xeroTenant);
  });

  it("approves submitted leave, clears failed_action, notifies owner and audits", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, approval_status: "approved" });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const result = await approve(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.approveLeaveApplicationForRegion).toHaveBeenCalledWith(
      expect.objectContaining({ remoteId: "xero-leave-1" })
    );
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "approved",
          approved_by_person_id: input.actingPersonId,
          failed_action: null,
        }),
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
        }),
      })
    );
    expect(mocks.dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "employee_1",
        type: "leave_approved",
      }),
      expect.anything()
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "availability_records.approved",
        }),
      })
    );
  });

  it("keeps an approved transition when notification dispatch fails", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, approval_status: "approved" });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: undefined,
    });
    mocks.dispatchNotification.mockResolvedValue({
      ok: false,
      error: { message: "Notification unavailable" },
    });

    const result = await approve(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval_status: "approved" }),
      })
    );
    expect(mocks.auditCreate).toHaveBeenCalled();
    expect(mocks.dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "employee_1",
        type: "leave_approved",
      }),
      expect.anything()
    );
  });

  it("keeps a declined transition when notification dispatch fails", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, approval_status: "declined" });
    mocks.declineLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: undefined,
    });
    mocks.dispatchNotification.mockResolvedValue({
      ok: false,
      error: { message: "Notification unavailable" },
    });

    const result = await decline(
      { ...input, reason: "Too much overlap" },
      mockPort
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval_status: "declined" }),
      })
    );
    expect(mocks.auditCreate).toHaveBeenCalled();
    expect(mocks.dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "employee_1",
        type: "leave_declined",
      }),
      expect.anything()
    );
  });

  it("persists failed approve without setting approver fields", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "approve",
      });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      ok: false,
      error: {
        code: "conflict_error",
        message: "Overlap",
        userMessage:
          "This leave overlaps an existing record in Xero. Review the dates and try again.",
        rawPayload: { Message: "Overlap" },
      },
    });

    const result = await approve(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "xero_sync_failed",
          failed_action: "approve",
          xero_write_error:
            "This leave overlaps an existing record in Xero. Review the dates and try again.",
        }),
      })
    );
    expect(
      JSON.stringify(mocks.availabilityUpdateMany.mock.calls[0])
    ).not.toContain("approved_by_person_id");
    expect(mocks.dispatchNotification).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.auditCreate.mock.calls[0])).not.toContain(
      "rawPayload"
    );
  });

  it("decline failure preserves the reason for retry", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_note: "Too much overlap",
        approval_status: "xero_sync_failed",
        failed_action: "decline",
      });
    mocks.declineLeaveApplicationForRegion.mockResolvedValue({
      ok: false,
      error: {
        code: "network_error",
        message: "offline",
        userMessage:
          "Could not reach Xero. Check your internet connection and try again.",
      },
    });

    const result = await decline(
      { ...input, reason: "Too much overlap" },
      mockPort
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_note: "Too much overlap",
          failed_action: "decline",
        }),
      })
    );
  });

  it("retryDecline blocks when the preserved reason is missing", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_note: "",
      approval_status: "xero_sync_failed",
      failed_action: "decline",
    });

    const result = await retryDecline(input, mockPort);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("missing_preserved_reason");
    }
  });

  it("rejects approve when the record is not submitted", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "approved",
    });

    const result = await approve(input, mockPort);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_state_for_approve");
    }
    expect(mocks.approveLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("rejects decline when the record is not submitted", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "declined",
    });

    const result = await decline(
      { ...input, reason: "Too much overlap" },
      mockPort
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_state_for_decline");
    }
    expect(mocks.declineLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("rejects retryApproval unless the failed action is approve", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "xero_sync_failed",
      failed_action: "decline",
    });

    const result = await retryApproval(input, mockPort);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_state_for_retry");
    }
    expect(mocks.approveLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("rejects retryDecline unless the failed action is decline", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_note: "Too much overlap",
      approval_status: "xero_sync_failed",
      failed_action: "approve",
    });

    const result = await retryDecline(input, mockPort);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_state_for_retry");
    }
    expect(mocks.declineLeaveApplicationForRegion).not.toHaveBeenCalled();
  });

  it("rejects more-info requests when the record is not submitted", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "approved",
    });

    const result = await requestMoreInfo({
      ...input,
      question: "Can you add more context?",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_state_for_info_request");
    }
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
  });

  it("rejects revert unless the record is a failed approve or decline", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "submitted",
      failed_action: null,
    });

    const result = await revertApprovalAttempt(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_state_for_revert");
    }
    expect(mocks.availabilityUpdateMany).not.toHaveBeenCalled();
  });

  it("surfaces optimistic approval conflicts as invalid state", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce(record);
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const result = await approve(input, mockPort);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_state_for_approve");
    }
  });

  it("keeps decline conflicts mapped to invalid state", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce(record);
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.declineLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const result = await decline(
      { ...input, reason: "Too much overlap" },
      mockPort
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_state_for_decline" },
    });
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
  });

  it("reverts failed declines to submitted and clears approval_note", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_note: "Too much overlap",
        approval_status: "xero_sync_failed",
        failed_action: "decline",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_note: null,
        approval_status: "submitted",
        failed_action: null,
      });

    const result = await revertApprovalAttempt(input);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_note: null,
          approval_status: "submitted",
          failed_action: null,
        }),
      })
    );
  });

  it("lists only direct reports for managers", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
    });

    expect(result.ok).toBe(true);
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          person_id: { in: [record.person_id] },
        }),
      })
    );
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith(
      expect.objectContaining({
        actingPersonId: input.actingPersonId,
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
      })
    );
  });

  it("preloads approver list durations and balances without per-row reference queries", async () => {
    const locationId = "00000000-0000-4000-8000-000000000301";
    const secondRecord = {
      ...record,
      id: "00000000-0000-4000-8000-000000000098",
      person: {
        ...record.person,
        id: "00000000-0000-4000-8000-000000000022",
        location_id: locationId,
      },
      person_id: "00000000-0000-4000-8000-000000000022",
      record_type: "sick_leave",
    };
    mocks.availabilityFindMany.mockResolvedValue([
      {
        ...record,
        person: { ...record.person, location_id: locationId },
      },
      secondRecord,
    ]);
    mocks.locationFindMany.mockResolvedValue([
      {
        country_code: "AU",
        id: locationId,
        region_code: "QLD",
        timezone: "Australia/Brisbane",
      },
    ]);
    mocks.computeWorkingDaysFromReferenceData
      .mockReturnValueOnce({ ok: true, value: 2 })
      .mockReturnValueOnce({ ok: true, value: 1 });
    mocks.leaveBalanceFindMany.mockResolvedValue([
      {
        balance: 10,
        balance_unit: "days",
        person_id: record.person_id,
        record_type: record.record_type,
        updated_at: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        balance: 4,
        balance_unit: "days",
        person_id: secondRecord.person_id,
        record_type: secondRecord.record_type,
        updated_at: new Date("2026-04-02T00:00:00.000Z"),
      },
    ]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(mocks.locationFindMany).toHaveBeenCalledOnce();
    expect(mocks.organisationFindFirst).toHaveBeenCalledOnce();
    expect(mocks.listForOrganisation).toHaveBeenCalledOnce();
    expect(mocks.leaveBalanceFindMany).toHaveBeenCalledOnce();
    expect(mocks.leaveBalanceFindFirst).not.toHaveBeenCalled();
    expect(mocks.computeWorkingDaysFromReferenceData).toHaveBeenCalledTimes(2);
    expect(result.value[0]?.durationWorkingDays).toBe(2);
    expect(result.value[0]?.balanceSnapshot).toMatchObject({
      balanceAvailable: 10,
      balanceRemainingAfterApproval: 8,
    });
    expect(result.value[1]?.durationWorkingDays).toBe(1);
    expect(result.value[1]?.balanceSnapshot).toMatchObject({
      balanceAvailable: 4,
      balanceRemainingAfterApproval: 3,
    });
  });

  it("includes declined and xero_sync_failed in the default filter when showDeclinedOnApprovals is true", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
    });

    expect(result.ok).toBe(true);
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approval_status: {
            in: [
              "submitted",
              "approved",
              "xero_sync_failed",
              "withdrawn",
              "declined",
            ],
          },
        }),
      })
    );
  });

  it("omits declined but includes xero_sync_failed in the default filter when showDeclinedOnApprovals is false", async () => {
    mocks.getSettings.mockResolvedValueOnce({
      ok: true,
      value: {
        defaultFeedPrivacyMode: "named",
        defaultLeaveRequestAdvanceDays: 0,
        defaultPrivacyMode: "named",
        feedsIncludePublicHolidaysDefault: false,
        id: "settings_1",
        managerVisibilityScope: "direct_reports_only",
        notifyManagersOnStatusChange: true,
        organisationId: input.organisationId,
        requireDeclineReason: true,
        showDeclinedOnApprovals: false,
        showPendingOnCalendar: true,
      },
    });
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
    });

    expect(result.ok).toBe(true);
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approval_status: {
            in: ["submitted", "approved", "xero_sync_failed", "withdrawn"],
          },
        }),
      })
    );
  });

  it("passes explicit status filter through unchanged", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
    });

    expect(result.ok).toBe(true);
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approval_status: {
            in: ["submitted"],
          },
        }),
      })
    );
  });
});
