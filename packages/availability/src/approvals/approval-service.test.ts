import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveLeaveApplicationForRegion: vi.fn(),
  auditCreate: vi.fn(),
  availabilityClaimUpdateMany: vi.fn(),
  availabilityCount: vi.fn(),
  availabilityFindFirst: vi.fn(),
  availabilityFindMany: vi.fn(),
  availabilityUpdateMany: vi.fn(),
  computeWorkingDays: vi.fn(),
  computeWorkingDaysFromReferenceData: vi.fn(),
  declineLeaveApplicationForRegion: vi.fn(),
  dispatchNotification: vi.fn(),
  dispatchSyncEvent: vi.fn(),
  getSettings: vi.fn(),
  hasActiveXeroConnection: vi.fn(),
  leaveBalanceFindFirst: vi.fn(),
  leaveBalanceFindMany: vi.fn(),
  listForOrganisation: vi.fn(),
  locationFindMany: vi.fn(),
  logError: vi.fn(),
  managerScopePersonIds: vi.fn(),
  materialiseAvailabilityPublication: vi.fn(() =>
    Promise.resolve({ ok: true, value: undefined })
  ),
  organisationFindFirst: vi.fn(),
  resolveXeroEmployeeId: vi.fn(),
  resolveXeroLeaveTypeId: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  withdrawLeaveApplicationForRegion: vi.fn(),
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
      updateMany: mocks.availabilityClaimUpdateMany,
    },
    leaveBalance: {
      findFirst: mocks.leaveBalanceFindFirst,
      findMany: mocks.leaveBalanceFindMany,
    },
    location: { findMany: mocks.locationFindMany },
    organisation: { findFirst: mocks.organisationFindFirst },
    person: {
      findFirst: vi.fn(() => Promise.resolve({ id: record.person.id })),
    },
    xeroTenant: { findFirst: mocks.xeroTenantFindFirst },
  },
  scopedTo: mocks.scopedTo,
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
vi.mock("../sync/sync-events", () => ({
  dispatchSyncEvent: mocks.dispatchSyncEvent,
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
vi.mock("@repo/observability/log", () => ({
  log: { error: mocks.logError, warn: vi.fn() },
}));

const mockPort = {
  approveLeaveApplication: mocks.approveLeaveApplicationForRegion,
  declineLeaveApplication: mocks.declineLeaveApplicationForRegion,
  resolveEmployeeId: mocks.resolveXeroEmployeeId,
  resolveLeaveTypeId: vi.fn(),
  submitLeaveApplication: vi.fn(),
  withdrawLeaveApplication: mocks.withdrawLeaveApplicationForRegion,
};

const {
  approve,
  decline,
  dispatchXeroLeaveSync,
  getApprovalDetail,
  getApprovalSummaryCounts,
  listForApprover,
  requestMoreInfo,
  revertApprovalAttempt,
  retryApproval,
  retryDecline,
} = await import("./approval-service");
const { withdrawSubmission } = await import("../plans/submit-service");

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("approval-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.availabilityClaimUpdateMany.mockResolvedValue({ count: 1 });
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
    mocks.dispatchSyncEvent.mockResolvedValue({
      ok: true,
      value: {
        eventName: "sync-xero-leave-records",
        ids: ["event_1"],
        queued: true,
      },
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
    mockPort.resolveLeaveTypeId.mockResolvedValue({
      ok: true,
      value: "type-1",
    });
    mocks.managerScopePersonIds.mockResolvedValue([record.person_id]);
    mocks.workingDayYearsForInput.mockReturnValue({
      ok: true,
      value: [2026],
    });
    mocks.xeroTenantFindFirst.mockResolvedValue(xeroTenant);
  });

  it("allows only the claim winner to call Xero for approve versus decline", async () => {
    const approval = deferred<{ ok: true; value: { rawResponse: object } }>();
    mocks.availabilityFindFirst.mockResolvedValue(record);
    mocks.availabilityClaimUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.approveLeaveApplicationForRegion.mockReturnValue(approval.promise);

    const approving = approve(input, mockPort);
    await vi.waitFor(() =>
      expect(mocks.approveLeaveApplicationForRegion).toHaveBeenCalledTimes(1)
    );
    const declining = decline(
      { ...input, reason: "Coverage is unavailable" },
      mockPort
    );

    await expect(declining).resolves.toMatchObject({
      error: { code: "invalid_state_for_decline" },
      ok: false,
    });
    expect(mocks.declineLeaveApplicationForRegion).not.toHaveBeenCalled();
    approval.resolve({ ok: true, value: { rawResponse: {} } });
    await expect(approving).resolves.toMatchObject({ ok: true });
  });

  it("allows only the claim winner to call Xero for approve versus withdraw", async () => {
    const approval = deferred<{ ok: true; value: { rawResponse: object } }>();
    mocks.availabilityFindFirst.mockResolvedValue(record);
    mocks.availabilityClaimUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.approveLeaveApplicationForRegion.mockReturnValue(approval.promise);

    const approving = approve(input, mockPort);
    await vi.waitFor(() =>
      expect(mocks.approveLeaveApplicationForRegion).toHaveBeenCalledTimes(1)
    );
    const withdrawing = withdrawSubmission(
      {
        actingOrgRole: "org:viewer",
        actingUserId: record.person.clerk_user_id,
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId,
        recordId: input.recordId,
      },
      mockPort
    );

    await expect(withdrawing).resolves.toMatchObject({
      error: { code: "invalid_state_for_withdraw" },
      ok: false,
    });
    expect(mocks.withdrawLeaveApplicationForRegion).not.toHaveBeenCalled();
    approval.resolve({ ok: true, value: { rawResponse: {} } });
    await expect(approving).resolves.toMatchObject({ ok: true });
  });

  it("allows only one duplicate withdrawal to call Xero", async () => {
    const withdrawal = deferred<{ ok: true; value: { rawResponse: object } }>();
    mocks.availabilityFindFirst.mockResolvedValue(record);
    mocks.availabilityClaimUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.withdrawLeaveApplicationForRegion.mockReturnValue(withdrawal.promise);
    const withdrawInput = {
      actingOrgRole: "org:viewer",
      actingUserId: record.person.clerk_user_id,
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
      recordId: input.recordId,
    };

    const first = withdrawSubmission(withdrawInput, mockPort);
    await vi.waitFor(() =>
      expect(mocks.withdrawLeaveApplicationForRegion).toHaveBeenCalledTimes(1)
    );
    const second = withdrawSubmission(withdrawInput, mockPort);

    await expect(second).resolves.toMatchObject({
      error: { code: "invalid_state_for_withdraw" },
      ok: false,
    });
    expect(mocks.withdrawLeaveApplicationForRegion).toHaveBeenCalledTimes(1);
    withdrawal.resolve({ ok: true, value: { rawResponse: {} } });
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("dispatches inbound Xero leave records for an authorised admin", async () => {
    const result = await dispatchXeroLeaveSync({
      ...input,
      role: "admin",
    });

    expect(result).toEqual({ ok: true, value: { queued: true } });
    expect(mocks.dispatchSyncEvent).toHaveBeenCalledWith({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
      runType: "leave_records",
      triggeredByUserId: input.actingUserId,
      triggerType: "manual",
      xeroTenantId: xeroTenant.id,
    });
  });

  it("does not allow a manager to dispatch an organisation-wide Xero leave sync", async () => {
    const result = await dispatchXeroLeaveSync(input);

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.dispatchSyncEvent).not.toHaveBeenCalled();
  });

  it.each([
    {
      configure: () =>
        mocks.availabilityFindMany.mockRejectedValueOnce(new Error("list")),
      message: "Failed to load leave approvals.",
      operation: "list_for_approver",
      recordId: undefined,
      run: () => listForApprover(input),
    },
    {
      configure: () =>
        mocks.availabilityFindFirst.mockRejectedValueOnce(new Error("detail")),
      message: "Failed to load this approval.",
      operation: "get_approval_detail",
      recordId: input.recordId,
      run: () => getApprovalDetail(input),
    },
    {
      configure: () =>
        mocks.availabilityCount.mockRejectedValueOnce(new Error("summary")),
      message: "Failed to load approval summary.",
      operation: "get_approval_summary_counts",
      recordId: undefined,
      run: () => getApprovalSummaryCounts(input),
    },
    {
      configure: () =>
        mocks.availabilityFindFirst.mockRejectedValueOnce(new Error("retry")),
      message: "Failed to retry this decline.",
      operation: "retry_decline_preflight",
      recordId: input.recordId,
      run: () => retryDecline(input, mockPort),
    },
    {
      configure: () =>
        mocks.availabilityFindFirst.mockRejectedValueOnce(new Error("info")),
      message: "Failed to request more information.",
      operation: "request_more_info",
      recordId: input.recordId,
      run: () =>
        requestMoreInfo({ ...input, question: "Please clarify this leave" }),
    },
    {
      configure: () =>
        mocks.availabilityFindFirst.mockRejectedValueOnce(new Error("revert")),
      message: "Failed to revert this approval attempt.",
      operation: "revert_approval_attempt",
      recordId: input.recordId,
      run: () => revertApprovalAttempt(input),
    },
  ])(
    "logs $operation catch failures with unchanged public results",
    async (testCase) => {
      testCase.configure();
      const result = await testCase.run();
      expect(result).toMatchObject({
        error: { code: "unknown_error", message: testCase.message },
        ok: false,
      });
      expect(mocks.logError).toHaveBeenCalledOnce();
      expect(mocks.logError).toHaveBeenCalledWith(
        "Unexpected approval service failure",
        expect.objectContaining({
          clerkOrgId: input.clerkOrgId,
          operation: testCase.operation,
          organisationId: input.organisationId,
          ...(testCase.recordId ? { recordId: testCase.recordId } : {}),
          error: expect.any(Error),
        })
      );
    }
  );

  it.each([
    [
      "approve",
      () => approve(input, mockPort),
      mocks.approveLeaveApplicationForRegion,
    ],
    [
      "decline",
      () => decline({ ...input, reason: "Too much overlap" }, mockPort),
      mocks.declineLeaveApplicationForRegion,
    ],
  ])(
    "logs %s local transaction failures after Xero succeeds",
    async (operation, run, write) => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      write.mockResolvedValueOnce({ ok: true, value: undefined });
      mocks.availabilityUpdateMany.mockRejectedValueOnce(
        new Error("database unavailable")
      );
      const result = await run();
      expect(result).toMatchObject({
        error: { code: "unknown_error" },
        ok: false,
      });
      expect(mocks.logError).toHaveBeenCalledWith(
        "Unexpected approval service failure",
        expect.objectContaining({
          failureStage: "local_transaction",
          operation,
          xeroWriteSucceeded: true,
        })
      );
    }
  );

  it.each([
    [
      "retry_approve",
      () => retryApproval(input, mockPort),
      mocks.approveLeaveApplicationForRegion,
      "approve",
    ],
    [
      "retry_decline",
      () => retryDecline(input, mockPort),
      mocks.declineLeaveApplicationForRegion,
      "decline",
    ],
  ])(
    "logs %s when the external port throws",
    async (operation, run, write, failedAction) => {
      const failedRecord = {
        ...record,
        approval_note: failedAction === "decline" ? "Too much overlap" : null,
        approval_status: "xero_sync_failed",
        failed_action: failedAction,
      };
      mocks.availabilityFindFirst.mockResolvedValue(failedRecord);
      write.mockRejectedValueOnce(new Error("provider unavailable"));
      const result = await run();
      expect(result).toMatchObject({
        error: { code: "unknown_error" },
        ok: false,
      });
      expect(mocks.logError).toHaveBeenCalledWith(
        "Unexpected approval service failure",
        expect.objectContaining({
          failureStage: "xero_write",
          operation,
          xeroWriteSucceeded: false,
        })
      );
    }
  );

  it("logs preparation failures before any Xero write", async () => {
    mocks.availabilityFindFirst.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    const result = await approve(input, mockPort);
    expect(result).toMatchObject({
      error: { code: "unknown_error" },
      ok: false,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "Unexpected approval service failure",
      expect.objectContaining({
        failureStage: "prepare",
        operation: "approve",
        xeroWriteSucceeded: false,
      })
    );
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

  it.each([
    ["approve", () => approve(input, mockPort)],
    ["retry approval", () => retryApproval(input, mockPort)],
    ["decline", () => decline({ ...input, reason: "Unavailable" }, mockPort)],
    ["retry decline", () => retryDecline(input, mockPort)],
    [
      "request more information",
      () =>
        requestMoreInfo({
          ...input,
          question: "Could you clarify this leave?",
        }),
    ],
    ["revert an approval attempt", () => revertApprovalAttempt(input)],
  ])("does not let a manager %s their own leave", async (_action, command) => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      person: { ...record.person, id: input.actingPersonId },
      person_id: input.actingPersonId,
    });
    mocks.managerScopePersonIds.mockResolvedValue([]);

    const result = await command();

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSelf: true })
    );
  });

  it("lets a manager approve direct-report leave using a self-excluding scope", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, approval_status: "approved" });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const result = await approve(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.managerScopePersonIds).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSelf: true })
    );
  });

  it("lets an admin approve their own leave", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        person: { ...record.person, id: input.actingPersonId },
        person_id: input.actingPersonId,
      })
      .mockResolvedValueOnce({ ...record, approval_status: "approved" });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const result = await approve({ ...input, role: "admin" }, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.managerScopePersonIds).not.toHaveBeenCalled();
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
      error: { message: "Notification unavailable" },
      ok: false,
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
      error: { message: "Notification unavailable" },
      ok: false,
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
      error: {
        code: "conflict_error",
        message: "Overlap",
        rawPayload: { Message: "Overlap" },
        userMessage:
          "This leave overlaps an existing record in Xero. Review the dates and try again.",
      },
      ok: false,
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

  it("persists failed approve when notification fails", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "approve",
      });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      error: {
        code: "conflict_error",
        message: "Overlap",
        rawPayload: { Message: "Overlap" },
        userMessage: "This leave overlaps an existing record in Xero.",
      },
      ok: false,
    });
    mocks.dispatchNotification.mockResolvedValue({
      error: { message: "Notification unavailable" },
      ok: false,
    });

    const result = await approve(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "xero_sync_failed",
          failed_action: "approve",
          xero_write_error: "This leave overlaps an existing record in Xero.",
        }),
      })
    );
    expect(mocks.auditCreate).toHaveBeenCalled();
    // Verify notification was attempted
    expect(mocks.dispatchNotification).toHaveBeenCalled();
  });

  it("dispatches failure notifications after the transaction completes", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "approve",
      });
    mocks.approveLeaveApplicationForRegion.mockResolvedValue({
      error: {
        code: "conflict_error",
        message: "Overlap",
        rawPayload: { Message: "Overlap" },
        userMessage: "This leave overlaps an existing record in Xero.",
      },
      ok: false,
    });

    let transactionFinished = false;
    mocks.availabilityUpdateMany.mockImplementation(() => {
      transactionFinished = true;
      return Promise.resolve({ count: 1 });
    });
    mocks.dispatchNotification.mockImplementation(() => {
      expect(transactionFinished).toBe(true);
      return Promise.resolve({ ok: true, value: undefined });
    });

    await approve(input, mockPort);
    expect(mocks.dispatchNotification).toHaveBeenCalled();
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
      error: {
        code: "network_error",
        message: "offline",
        userMessage:
          "Could not reach Xero. Check your internet connection and try again.",
      },
      ok: false,
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
    expect(mocks.logError).toHaveBeenCalledWith(
      "Approval state changed after Xero write succeeded",
      expect.objectContaining({
        failureStage: "local_transaction",
        operation: "approve",
        xeroWriteSucceeded: true,
      })
    );
    expect(mocks.logError).not.toHaveBeenCalledWith(
      "Unexpected approval service failure",
      expect.anything()
    );
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
      error: { code: "invalid_state_for_decline" },
      ok: false,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      "Approval state changed after Xero write succeeded",
      expect.objectContaining({
        failureStage: "local_transaction",
        operation: "decline",
        xeroWriteSucceeded: true,
      })
    );
    expect(mocks.logError).not.toHaveBeenCalledWith(
      "Unexpected approval service failure",
      expect.anything()
    );
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
    expect(result.value.items[0]?.durationWorkingDays).toBe(2);
    expect(result.value.items[0]?.balanceSnapshot).toMatchObject({
      balanceAvailable: 10,
      balanceRemainingAfterApproval: 8,
      currencyCode: null,
      unit: "days",
    });
    expect(result.value.items[1]?.durationWorkingDays).toBe(1);
    expect(result.value.items[1]?.balanceSnapshot).toMatchObject({
      balanceAvailable: 4,
      balanceRemainingAfterApproval: 3,
      currencyCode: null,
      unit: "days",
    });
  });

  it("does not compute remaining balance for hours or currency leave balances", async () => {
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
        balance: 40,
        balance_unit: "hours",
        currency_code: null,
        person_id: record.person_id,
        record_type: record.record_type,
        updated_at: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        balance: 1500,
        balance_unit: "currency",
        currency_code: "NZD",
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
    expect(result.value.items[0]?.balanceSnapshot).toMatchObject({
      balanceAvailable: 40,
      balanceRemainingAfterApproval: null,
      currencyCode: null,
      unit: "hours",
    });
    expect(result.value.items[1]?.balanceSnapshot).toMatchObject({
      balanceAvailable: 1500,
      balanceRemainingAfterApproval: null,
      currencyCode: "NZD",
      unit: "currency",
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
          OR: expect.arrayContaining([
            expect.objectContaining({
              approval_status: expect.objectContaining({
                in: expect.arrayContaining(["submitted", "xero_sync_failed"]),
              }),
            }),
            expect.objectContaining({
              approval_status: expect.objectContaining({
                in: expect.arrayContaining([
                  "approved",
                  "withdrawn",
                  "declined",
                ]),
              }),
              ends_at: expect.objectContaining({ gte: expect.any(Date) }),
            }),
          ]),
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
          OR: expect.arrayContaining([
            expect.objectContaining({
              approval_status: expect.objectContaining({
                in: expect.arrayContaining(["submitted", "xero_sync_failed"]),
              }),
            }),
            expect.objectContaining({
              approval_status: expect.objectContaining({
                in: expect.arrayContaining(["approved", "withdrawn"]),
              }),
              ends_at: expect.objectContaining({ gte: expect.any(Date) }),
            }),
          ]),
        }),
      })
    );
  });

  describe("decline policy and organisation settings handling", () => {
    it("fails closed when getSettings returns ok: false on decline with empty reason", async () => {
      mocks.getSettings.mockResolvedValueOnce({
        error: { code: "not_found", message: "Failed" },
        ok: false,
      });

      const result = await decline({ ...input, reason: "" }, mockPort);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          code: "validation_error",
          message: "Enter a decline reason of at least 3 characters.",
        });
      }
      expect(mocks.declineLeaveApplicationForRegion).not.toHaveBeenCalled();
    });

    it("rejects empty reason when requireDeclineReason is true", async () => {
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
          showDeclinedOnApprovals: true,
          showPendingOnCalendar: true,
        },
      });

      const result = await decline({ ...input, reason: "" }, mockPort);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          code: "validation_error",
          message: "Enter a decline reason of at least 3 characters.",
        });
      }
      expect(mocks.declineLeaveApplicationForRegion).not.toHaveBeenCalled();
    });

    it("rejects reason shorter than 3 characters when requireDeclineReason is true", async () => {
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
          showDeclinedOnApprovals: true,
          showPendingOnCalendar: true,
        },
      });

      const result = await decline({ ...input, reason: "ok" }, mockPort);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          code: "validation_error",
          message: "Enter a decline reason of at least 3 characters.",
        });
      }
      expect(mocks.declineLeaveApplicationForRegion).not.toHaveBeenCalled();
    });

    it("succeeds with valid reason when requireDeclineReason is true", async () => {
      mocks.availabilityFindFirst
        .mockResolvedValueOnce(record)
        .mockResolvedValueOnce({ ...record, approval_status: "declined" });
      mocks.declineLeaveApplicationForRegion.mockResolvedValueOnce({
        ok: true,
        value: undefined,
      });

      const result = await decline(
        { ...input, reason: "Too much overlap" },
        mockPort
      );

      expect(result.ok).toBe(true);
      expect(mocks.declineLeaveApplicationForRegion).toHaveBeenCalledWith(
        expect.objectContaining({ remoteId: "xero-leave-1" })
      );
    });

    it("succeeds with empty reason when requireDeclineReason is false", async () => {
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
          requireDeclineReason: false,
          showDeclinedOnApprovals: true,
          showPendingOnCalendar: true,
        },
      });
      mocks.availabilityFindFirst
        .mockResolvedValueOnce(record)
        .mockResolvedValueOnce({ ...record, approval_status: "declined" });
      mocks.declineLeaveApplicationForRegion.mockResolvedValueOnce({
        ok: true,
        value: undefined,
      });

      const result = await decline({ ...input, reason: "" }, mockPort);

      expect(result.ok).toBe(true);
      expect(mocks.declineLeaveApplicationForRegion).toHaveBeenCalledWith(
        expect.objectContaining({ remoteId: "xero-leave-1" })
      );
    });

    it("rejects whitespace-only reason when requireDeclineReason is true", async () => {
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
          showDeclinedOnApprovals: true,
          showPendingOnCalendar: true,
        },
      });

      const result = await decline({ ...input, reason: "   " }, mockPort);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          code: "validation_error",
          message: "Enter a decline reason of at least 3 characters.",
        });
      }
      expect(mocks.declineLeaveApplicationForRegion).not.toHaveBeenCalled();
    });

    it("omits declined records from default list filter when getSettings fails", async () => {
      mocks.getSettings.mockResolvedValueOnce({
        error: { code: "not_found", message: "Failed" },
        ok: false,
      });
      mocks.availabilityFindMany.mockResolvedValue([record]);

      const result = await listForApprover({
        ...input,
      });

      expect(result.ok).toBe(true);
      expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                approval_status: expect.objectContaining({
                  in: expect.arrayContaining(["submitted", "xero_sync_failed"]),
                }),
              }),
              expect.objectContaining({
                approval_status: expect.objectContaining({
                  in: expect.arrayContaining(["approved", "withdrawn"]),
                }),
                ends_at: expect.objectContaining({ gte: expect.any(Date) }),
              }),
            ]),
          }),
        })
      );
    });
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

  it("does not select audit blobs source_payload_json or xero_write_error_raw", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
    });

    expect(result.ok).toBe(true);
    const select = mocks.availabilityFindMany.mock.calls[0]?.[0]
      ?.select as Record<string, unknown>;
    expect(select).not.toHaveProperty("source_payload_json");
    expect(select).not.toHaveProperty("xero_write_error_raw");
  });

  it("selects the plain-language xero_write_error column", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
    });

    expect(result.ok).toBe(true);
    const select = mocks.availabilityFindMany.mock.calls[0]?.[0]
      ?.select as Record<string, unknown>;
    expect(select).toHaveProperty("xero_write_error");
  });

  it("requests take as pageSize plus one", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
    });

    expect(result.ok).toBe(true);
    expect(mocks.availabilityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 51 })
    );
  });

  it("returns nextCursor and truncates items when more results than page size", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const rows = Array.from({ length: 51 }, (_, index) => ({
      ...record,
      id: `00000000-0000-4000-8000-000000000${String(100 + index).padStart(3, "0")}`,
    }));
    mocks.availabilityFindMany.mockResolvedValue(rows);
    mocks.locationFindMany.mockResolvedValue([]);
    mocks.organisationFindFirst.mockResolvedValue({
      country_code: "AU",
      timezone: "Australia/Brisbane",
    });
    mocks.listForOrganisation.mockResolvedValue({ ok: true, value: [] });
    mocks.leaveBalanceFindMany.mockResolvedValue([]);

    const result = await listForApprover({
      ...input,
      pageSize: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.items).toHaveLength(50);
    expect(result.value.nextCursor).toBe(rows[49]?.id ?? null);
    vi.useRealTimers();
  });

  it("returns null nextCursor when fewer results than page size", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
      pageSize: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.nextCursor).toBeNull();
    expect(result.value.items).toHaveLength(1);
  });

  it("does not hide actionable submitted records with old ends_at", async () => {
    mocks.availabilityFindMany.mockResolvedValue([record]);

    const result = await listForApprover({
      ...input,
      filters: { status: ["submitted"] },
    });

    expect(result.ok).toBe(true);
    const where = mocks.availabilityFindMany.mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).not.toHaveProperty("ends_at");
    expect(where).toMatchObject({
      approval_status: { in: ["submitted"] },
    });
  });

  it("windows terminal approved records to recent ends_at by default", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    mocks.availabilityFindMany.mockResolvedValue([]);

    const result = await listForApprover({ ...input });

    expect(result.ok).toBe(true);
    const where = mocks.availabilityFindMany.mock.calls[0]?.[0]?.where as {
      OR?: Record<string, unknown>[];
    };
    expect(where.OR).toBeDefined();
    const terminalClause = where.OR?.find(
      (clause) =>
        JSON.stringify(clause).includes("approved") &&
        JSON.stringify(clause).includes("ends_at")
    );
    expect(terminalClause).toMatchObject({
      ends_at: expect.objectContaining({ gte: expect.any(Date) }),
    });
    vi.useRealTimers();
  });

  it("does not window terminal records when caller supplies explicit dateFrom", async () => {
    const dateFrom = new Date("2024-01-01T00:00:00.000Z");
    mocks.availabilityFindMany.mockResolvedValue([]);

    const result = await listForApprover({
      ...input,
      filters: { dateFrom, status: ["approved"] },
    });

    expect(result.ok).toBe(true);
    const where = mocks.availabilityFindMany.mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).toMatchObject({
      approval_status: { in: ["approved"] },
      ends_at: { gte: dateFrom },
    });
    expect(where).not.toHaveProperty("OR");
  });

  it("keeps clerk_org_id and organisation_id in the where clause", async () => {
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
        }),
      })
    );
  });
});
