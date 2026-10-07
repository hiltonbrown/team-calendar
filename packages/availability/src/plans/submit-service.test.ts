import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireSideEffects: vi.fn(),
  auditCreate: vi.fn(),
  // The xero-write claim/release helpers call database.availabilityRecord.
  // updateMany directly (outside any $transaction), so they need their own
  // mock handle distinct from the transaction-scoped updateMany below.
  availabilityClaimUpdateMany: vi.fn(),
  availabilityFindFirst: vi.fn(),
  availabilityUpdateMany: vi.fn(),
  completeSideEffects: vi.fn(),
  computeWorkingDays: vi.fn(),
  dispatchNotification: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  hasUnresolved: vi.fn(),
  markSubmitCompleted: vi.fn(),
  markSubmitDefinitiveFailure: vi.fn(),
  markSubmitDispatchStarted: vi.fn(),
  markSubmitOutcomeUnknown: vi.fn(),
  markSubmitProviderAccepted: vi.fn(),
  materialiseAvailabilityPublication: vi.fn(() =>
    Promise.resolve({ ok: true, value: undefined })
  ),
  organisationFindFirst: vi.fn(),
  personFindFirst: vi.fn(),
  prepareAndClaimSubmitOperation: vi.fn(),
  publishPersistedNotification: vi.fn().mockResolvedValue(undefined),
  releaseSideEffects: vi.fn(),
  resolveXeroEmployeeId: vi.fn(),
  resolveXeroLeaveTypeId: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  submitLeaveApplicationForRegion: vi.fn(),
  transactionCommitted: vi.fn(),
  withdrawLeaveApplicationForRegion: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  acquireSubmitRecoverySideEffects: mocks.acquireSideEffects,
  database: {
    $transaction: async (callback: (tx: unknown) => unknown) => {
      const result = await callback({
        auditEvent: { create: mocks.auditCreate },
        availabilityRecord: { updateMany: mocks.availabilityUpdateMany },
      });
      mocks.transactionCommitted();
      return result;
    },
    availabilityRecord: {
      findFirst: mocks.availabilityFindFirst,
      updateMany: mocks.availabilityClaimUpdateMany,
    },
    organisation: { findFirst: mocks.organisationFindFirst },
    person: { findFirst: mocks.personFindFirst },
    xeroConnection: { findFirst: mocks.xeroTenantFindFirst },
  },
  hasUnresolvedSubmitOperation: mocks.hasUnresolved,
  markSubmitCompleted: mocks.markSubmitCompleted,
  markSubmitDefinitiveFailure: mocks.markSubmitDefinitiveFailure,
  markSubmitDispatchStarted: mocks.markSubmitDispatchStarted,
  markSubmitOutcomeUnknown: mocks.markSubmitOutcomeUnknown,
  markSubmitProviderAccepted: mocks.markSubmitProviderAccepted,
  prepareAndClaimSubmitOperation: mocks.prepareAndClaimSubmitOperation,
  releaseSubmitRecoverySideEffects: mocks.releaseSideEffects,
  scopedTo: mocks.scopedTo,
}));
vi.mock("../duration/working-days", () => ({
  computeWorkingDays: mocks.computeWorkingDays,
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatchNotification,
  publishPersistedNotification: mocks.publishPersistedNotification,
}));
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialiseAvailabilityPublication,
}));
vi.mock("./submit-side-effects", () => ({
  completeSubmitSideEffects: mocks.completeSideEffects,
}));
const mockPort = {
  approveLeaveApplication: vi.fn(),
  declineLeaveApplication: vi.fn(),
  resolveEmployeeId: mocks.resolveXeroEmployeeId,
  resolveLeaveTypeId: mocks.resolveXeroLeaveTypeId,
  submitLeaveApplication: mocks.submitLeaveApplicationForRegion,
  withdrawLeaveApplication: mocks.withdrawLeaveApplicationForRegion,
};
const {
  createLeaveOnApproval,
  retrySubmission,
  revertToDraft,
  submitDraftRecord,
  withdrawSubmission,
} = await import("./submit-service");
const input = {
  actingOrgRole: "org:admin",
  actingPersonId: "00000000-0000-4000-8000-000000000012",
  actingUserId: "user_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000099",
};
const record = {
  all_day: true,
  approval_status: "submitted",
  clerk_org_id: input.clerkOrgId,
  derived_sequence: 2,
  ends_at: new Date("2026-05-05T23:59:59.999Z"),
  failed_action: null,
  id: input.recordId,
  organisation_id: input.organisationId,
  person: {
    clerk_user_id: input.actingUserId,
    email: "person@example.com",
    first_name: "Test",
    id: "00000000-0000-4000-8000-000000000011",
    last_name: "Person",
    location_id: null,
    manager: {
      clerk_user_id: "manager_1",
      id: "00000000-0000-4000-8000-000000000012",
    },
    manager_person_id: "00000000-0000-4000-8000-000000000012",
  },
  person_id: "00000000-0000-4000-8000-000000000011",
  record_type: "annual_leave",
  source_remote_id: null,
  source_type: "team_calendar_leave",
  starts_at: new Date("2026-05-04T00:00:00.000Z"),
  title: "Annual leave",
};
const xeroConnection = {
  clerk_org_id: input.clerkOrgId,
  id: "00000000-0000-4000-8000-000000000201",
  organisation_id: input.organisationId,
  payroll_region: "AU",
  xero_connection: {
    access_token_encrypted: "token",
    revoked_at: null,
  },
  xero_connection_id: "xero-tenant-1",
};
describe("submit-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasUnresolved.mockResolvedValue(false);
    mocks.organisationFindFirst.mockResolvedValue({ country_code: "AU" });
    mocks.availabilityFindFirst.mockReset();
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.availabilityClaimUpdateMany.mockResolvedValue({ count: 1 });
    mocks.acquireSideEffects.mockResolvedValue(new Date());
    mocks.completeSideEffects.mockResolvedValue({ ok: true, value: undefined });
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.markSubmitCompleted.mockResolvedValue(true);
    mocks.markSubmitDefinitiveFailure.mockResolvedValue(true);
    mocks.markSubmitDispatchStarted.mockResolvedValue(true);
    mocks.markSubmitOutcomeUnknown.mockResolvedValue(true);
    mocks.markSubmitProviderAccepted.mockResolvedValue(true);
    mocks.dispatchNotification.mockResolvedValue({
      ok: true,
      value: { emailQueued: false, inAppDelivered: true },
    });
    mocks.personFindFirst.mockResolvedValue({ id: record.person.id });
    mocks.prepareAndClaimSubmitOperation.mockResolvedValue({
      attemptGeneration: 1,
      claimedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    mocks.resolveXeroEmployeeId.mockResolvedValue({
      ok: true,
      value: "employee-1",
    });
    mocks.resolveXeroLeaveTypeId.mockResolvedValue({
      ok: true,
      value: "type-1",
    });
    mocks.xeroTenantFindFirst.mockResolvedValue(xeroConnection);
  });
  it("submits locally after eligibility checks without creating payroll leave or an outbound operation", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      approval_status: "draft",
    });
    const result = await submitDraftRecord(input, mockPort);
    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval_status: "submitted" }),
        where: expect.objectContaining({ source_remote_id: null }),
      })
    );
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    expect(mocks.resolveXeroEmployeeId).toHaveBeenCalled();
    expect(mocks.resolveXeroLeaveTypeId).toHaveBeenCalled();
    expect(mocks.prepareAndClaimSubmitOperation).not.toHaveBeenCalled();
  });
  it.each(["NZ", "UK"])(
    "rejects unsupported %s local submissions",
    async (country_code) => {
      mocks.availabilityFindFirst.mockResolvedValue({
        ...record,
        approval_status: "draft",
      });
      mocks.organisationFindFirst.mockResolvedValue({ country_code });
      expect(await submitDraftRecord(input, mockPort)).toMatchObject({
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
      expect(mocks.availabilityUpdateMany).not.toHaveBeenCalled();
    }
  );
  it("does not accept local leave when its payroll mapping is missing", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      approval_status: "draft",
    });
    mocks.resolveXeroEmployeeId.mockResolvedValueOnce({
      error: { code: "missing_mapping", message: "Employee mapping required." },
      ok: false,
    });
    expect(await submitDraftRecord(input, mockPort)).toMatchObject({
      error: { code: "submission_blocked_resolution" },
      ok: false,
    });
    expect(mocks.availabilityUpdateMany).not.toHaveBeenCalled();
  });
  it("keeps local submission notification transactional without publishing SSE before commit", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      approval_status: "draft",
    });
    mocks.dispatchNotification.mockResolvedValueOnce({
      error: { message: "Notification insert failed" },
      ok: false,
    });
    expect(await submitDraftRecord(input, mockPort)).toMatchObject({
      error: { code: "unknown_error" },
      ok: false,
    });
    expect(mocks.dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "leave_submitted" }),
      expect.anything(),
      { publishRealtime: false }
    );
    expect(mocks.materialiseAvailabilityPublication).not.toHaveBeenCalled();
    expect(mocks.publishPersistedNotification).not.toHaveBeenCalled();
    expect(mocks.transactionCommitted).not.toHaveBeenCalled();
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
  });
  it("publishes the manager notification only after the submission commits", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      approval_status: "draft",
    });
    mocks.dispatchNotification.mockResolvedValueOnce({
      ok: true,
      value: {
        emailQueued: true,
        inAppDelivered: true,
        notificationId: "notification_1",
      },
    });
    expect((await submitDraftRecord(input, mockPort)).ok).toBe(true);
    expect(mocks.transactionCommitted.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.publishPersistedNotification.mock.invocationCallOrder[0]
    );
    expect(mocks.publishPersistedNotification).toHaveBeenCalledWith({
      clerkOrgId: input.clerkOrgId,
      notificationId: "notification_1",
      organisationId: input.organisationId,
    });
    expect(mocks.dispatchNotification).toHaveBeenCalledOnce();
  });
  it.each(["NZ", "GB"])(
    "rejects %s approval creation before claim or provider",
    async (country_code) => {
      mocks.availabilityFindFirst.mockResolvedValue(record);
      mocks.organisationFindFirst.mockResolvedValue({ country_code });
      expect(await createLeaveOnApproval(input, mockPort)).toMatchObject({
        error: { code: "not_a_leave_type" },
        ok: false,
      });
      expect(mocks.prepareAndClaimSubmitOperation).not.toHaveBeenCalled();
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    }
  );
  it.each([null, { id: "00000000-0000-4000-8000-000000000077" }])(
    "derives approval attribution from the authenticated scoped person",
    async (person) => {
      mocks.availabilityFindFirst.mockResolvedValue(record);
      mocks.submitLeaveApplicationForRegion.mockResolvedValue({
        ok: true,
        value: { rawResponse: {}, remoteId: "remote_1" },
      });
      mocks.personFindFirst.mockResolvedValue(person);
      expect((await createLeaveOnApproval(input, mockPort)).ok).toBe(true);
      expect(mocks.personFindFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          archived_at: null,
          clerk_org_id: input.clerkOrgId,
          clerk_user_id: input.actingUserId,
          organisation_id: input.organisationId,
        },
      });
      expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approved_by_person_id: person?.id ?? null,
          }),
        })
      );
    }
  );
  it("rejects duplicate local submission without a provider call", async () => {
    mocks.availabilityFindFirst.mockResolvedValue(record);
    expect(await submitDraftRecord(input, mockPort)).toMatchObject({
      error: { code: "invalid_state_for_submit" },
      ok: false,
    });
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
  });
  it("withdraws a local pending request without contacting Xero", async () => {
    mocks.availabilityFindFirst.mockResolvedValue(record);
    expect((await withdrawSubmission(input, mockPort)).ok).toBe(true);
    expect(mocks.withdrawLeaveApplicationForRegion).not.toHaveBeenCalled();
    expect(mocks.resolveXeroEmployeeId).not.toHaveBeenCalled();
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval_status: "withdrawn" }),
      })
    );
  });
  it("blocks withdrawal while an approval create outcome is unknown", async () => {
    mocks.availabilityFindFirst.mockResolvedValue(record);
    mocks.hasUnresolved.mockResolvedValue(true);
    expect(await withdrawSubmission(input, mockPort)).toMatchObject({
      error: { code: "submission_outcome_unknown" },
      ok: false,
    });
    expect(mocks.withdrawLeaveApplicationForRegion).not.toHaveBeenCalled();
    expect(mocks.availabilityUpdateMany).not.toHaveBeenCalled();
  });
  it("retries a definitively failed legacy submission locally", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      approval_status: "xero_sync_failed",
      failed_action: "submit",
    });
    expect((await retrySubmission(input, mockPort)).ok).toBe(true);
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
  });
  it.each([
    ["update_permissions", "Update Xero permissions to continue."],
    [
      "operational_incident",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
  ] as const)(
    "preserves employee-visible %s from employee resolution",
    async (recoveryReason, message) => {
      mocks.availabilityFindFirst.mockResolvedValue(record);
      mocks.resolveXeroEmployeeId.mockResolvedValue({
        error: { code: "unknown_error", message, recoveryReason },
        ok: false,
      });
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result).toMatchObject({
        error: {
          message,
          resolutionError: { code: "unknown_error", recoveryReason },
        },
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("access_token");
      expect(JSON.stringify(result)).not.toContain("WWW-Authenticate");
    }
  );
  it.each([
    [
      "unavailable",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
    ["reauthorisation_required", "Xero access needs to be renewed."],
  ] as const)(
    "blocks provider work with truthful recovery during %s",
    async (state, message) => {
      mocks.availabilityFindFirst.mockResolvedValue(record);
      mocks.getXeroConnectionStateForScope.mockResolvedValue(
        state === "unavailable"
          ? { error: { code: "state_unavailable" }, ok: false }
          : { ok: true, value: { state } }
      );
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result).toMatchObject({ error: { message }, ok: false });
      expect(mocks.resolveXeroEmployeeId).not.toHaveBeenCalled();
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
      expect(mocks.withdrawLeaveApplicationForRegion).not.toHaveBeenCalled();
    }
  );
  it("approves a local submitted record and writes notification plus audit rows", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "approved",
        source_remote_id: "xero-leave-1",
      });
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: {
        rawResponse: {
          LeaveApplications: [{ LeaveApplicationID: "xero-leave-1" }],
        },
        remoteId: "xero-leave-1",
      },
    });
    const result = await createLeaveOnApproval(input, mockPort);
    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "approved",
          failed_action: null,
          source_remote_id: "xero-leave-1",
        }),
        where: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
        }),
      })
    );
    expect(mocks.completeSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        manager: expect.objectContaining({ clerkUserId: "manager_1" }),
        notifyManager: false,
      })
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
      .mockResolvedValueOnce({
        ...record,
        approval_status: "approved",
        source_remote_id: "xero-leave-1",
      });
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: { rawResponse: {}, remoteId: "xero-leave-1" },
    });
    mocks.dispatchNotification.mockResolvedValue({
      error: { message: "Notification unavailable" },
      ok: false,
    });
    const result = await createLeaveOnApproval(input, mockPort);
    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "approved",
          source_remote_id: "xero-leave-1",
        }),
      })
    );
    expect(mocks.auditCreate).toHaveBeenCalled();
  });
  it("keeps submit conflicts mapped to invalid state", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce(record);
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: { rawResponse: {}, remoteId: "xero-leave-1" },
    });
    const result = await createLeaveOnApproval(input, mockPort);
    expect(result).toMatchObject({
      error: { code: "invalid_state_for_submit" },
      ok: false,
    });
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
  });
  it("persists xero_sync_failed without bumping sequence when Xero rejects", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        xero_write_error: "This leave overlaps an existing record in Xero.",
      });
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
      error: {
        code: "conflict_error",
        message: "Overlap",
        rawPayload: { Message: "Overlap" },
        userMessage:
          "This leave overlaps an existing record in Xero. Review the dates and try again.",
      },
      ok: false,
    });
    const result = await createLeaveOnApproval(input, mockPort);
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
    expect(mocks.dispatchNotification).toHaveBeenCalledTimes(2);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "availability_records.approval_failed",
          payload: expect.objectContaining({ errorCode: "conflict_error" }),
        }),
      })
    );
    expect(JSON.stringify(mocks.auditCreate.mock.calls[0])).not.toContain(
      "rawPayload"
    );
  });
  it("persists failed submit when notification fails", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        xero_write_error: "This leave overlaps an existing record in Xero.",
      });
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
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
    const result = await createLeaveOnApproval(input, mockPort);
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
    expect(mocks.dispatchNotification).toHaveBeenCalled();
  });
  it("dispatches failure notifications after the transaction completes", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
      });
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
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
    await createLeaveOnApproval(input, mockPort);
    expect(mocks.dispatchNotification).toHaveBeenCalled();
  });
  it("blocks submission when Xero is not connected", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce(record);
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "not_connected" },
    });
    const result = await createLeaveOnApproval(input, mockPort);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("xero_not_connected");
    }
    expect(mocks.availabilityUpdateMany).not.toHaveBeenCalled();
  });
  it("reverts only failed records to draft", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "submit",
      })
      .mockResolvedValueOnce({ ...record, approval_status: "draft" });
    const result = await revertToDraft(input);
    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "draft",
          failed_action: null,
        }),
      })
    );
  });
  it("does not revert a failed submission while its Xero claim is active", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "xero_sync_failed",
      failed_action: "submit",
    });
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });
    const result = await revertToDraft(input);
    expect(result).toMatchObject({
      error: { code: "invalid_state_for_revert" },
      ok: false,
    });
  });
  it("withdraws only submitted records", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_status: "submitted",
        source_remote_id: "xero-leave-1",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_status: "withdrawn",
        source_remote_id: "xero-leave-1",
      });
    mocks.withdrawLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: { rawResponse: {} },
    });
    const result = await withdrawSubmission(input, mockPort);
    expect(result.ok).toBe(true);
    expect(mocks.withdrawLeaveApplicationForRegion).toHaveBeenCalled();
    expect(mocks.dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "leave_withdrawn",
      }),
      expect.anything(),
      { publishRealtime: undefined }
    );
  });
  it("moves an owner's approved leave to the Xero failure state when withdrawal fails", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_status: "approved",
        source_remote_id: "xero-leave-1",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "withdraw",
        source_remote_id: "xero-leave-1",
      });
    mocks.withdrawLeaveApplicationForRegion.mockResolvedValue({
      error: {
        code: "validation_error",
        message: "Scheduled leave cannot be withdrawn",
        userMessage: "This leave could not be withdrawn in Xero.",
      },
      ok: false,
    });
    const result = await withdrawSubmission(input, mockPort);
    expect(result.ok).toBe(true);
    expect(mocks.withdrawLeaveApplicationForRegion).toHaveBeenCalledWith(
      expect.objectContaining({ remoteId: "xero-leave-1" })
    );
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "xero_sync_failed",
          failed_action: "withdraw",
        }),
        where: expect.objectContaining({ approval_status: "approved" }),
      })
    );
  });
  it("allows an admin to withdraw another person's approved leave", async () => {
    const adminInput = {
      ...input,
      actingOrgRole: "org:admin",
      actingUserId: "admin_1",
    };
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_status: "approved",
        person: { ...record.person, clerk_user_id: "other_user" },
        source_remote_id: "xero-leave-1",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_status: "withdrawn",
        source_remote_id: "xero-leave-1",
      });
    mocks.withdrawLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: { rawResponse: {} },
    });
    const result = await withdrawSubmission(adminInput, mockPort);
    expect(result.ok).toBe(true);
    expect(mocks.withdrawLeaveApplicationForRegion).toHaveBeenCalledWith(
      expect.objectContaining({ remoteId: "xero-leave-1" })
    );
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approval_status: "approved",
        }),
      })
    );
  });
  it("explicitly retries a failed remote withdrawal without creating leave", async () => {
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      approval_status: "xero_sync_failed",
      failed_action: "withdraw",
      source_remote_id: "existing_leave",
    });
    mocks.withdrawLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: { rawResponse: {} },
    });
    expect((await withdrawSubmission(input, mockPort)).ok).toBe(true);
    expect(mocks.withdrawLeaveApplicationForRegion).toHaveBeenCalledWith(
      expect.objectContaining({ remoteId: "existing_leave" })
    );
    expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval_status: "withdrawn" }),
        where: expect.objectContaining({ approval_status: "xero_sync_failed" }),
      })
    );
  });
  it("keeps a withdrawn transition when manager notification dispatch fails", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_status: "submitted",
        source_remote_id: "xero-leave-1",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_status: "withdrawn",
        source_remote_id: "xero-leave-1",
      });
    mocks.withdrawLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: { rawResponse: {} },
    });
    mocks.dispatchNotification.mockResolvedValue({
      error: { message: "Notification unavailable" },
      ok: false,
    });
    const result = await withdrawSubmission(input, mockPort);
    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval_status: "withdrawn" }),
      })
    );
    expect(mocks.auditCreate).toHaveBeenCalled();
  });
  it("keeps withdraw conflicts mapped to invalid state", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "submitted",
      source_remote_id: "xero-leave-1",
    });
    mocks.availabilityUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.withdrawLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: { rawResponse: {} },
    });
    const result = await withdrawSubmission(input, mockPort);
    expect(result).toMatchObject({
      error: { code: "invalid_state_for_withdraw" },
      ok: false,
    });
    expect(mocks.dispatchNotification).not.toHaveBeenCalled();
  });
  it("sets failed_action on withdraw failure and clears it on retry success", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_status: "submitted",
        source_remote_id: "xero-leave-1",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "withdraw",
      });
    mocks.withdrawLeaveApplicationForRegion.mockResolvedValue({
      error: {
        code: "network_error",
        message: "offline",
        userMessage:
          "Could not reach Xero. Check your internet connection and try again.",
      },
      ok: false,
    });
    const failedWithdraw = await withdrawSubmission(input, mockPort);
    expect(failedWithdraw.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "xero_sync_failed",
          failed_action: "withdraw",
        }),
      })
    );
    vi.clearAllMocks();
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "approve",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_status: "approved",
        failed_action: null,
        source_remote_id: "xero-leave-1",
      });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.dispatchNotification.mockResolvedValue({
      ok: true,
      value: { emailQueued: false, inAppDelivered: true },
    });
    mocks.personFindFirst.mockResolvedValue({ id: record.person.id });
    mocks.resolveXeroEmployeeId.mockResolvedValue({
      ok: true,
      value: "employee-1",
    });
    mocks.resolveXeroLeaveTypeId.mockResolvedValue({
      ok: true,
      value: "type-1",
    });
    mocks.xeroTenantFindFirst.mockResolvedValue(xeroConnection);
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: {
        rawResponse: {
          LeaveApplications: [{ LeaveApplicationID: "xero-leave-1" }],
        },
        remoteId: "xero-leave-1",
      },
    });
    const retried = await createLeaveOnApproval(input, mockPort, true);
    expect(retried.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "approved",
          failed_action: null,
        }),
      })
    );
  });
  describe("xero write claim", () => {
    it("claims the record and clears the claim on a successful submit", async () => {
      mocks.availabilityFindFirst
        .mockResolvedValueOnce(record)
        .mockResolvedValueOnce({
          ...record,
          approval_status: "approved",
          source_remote_id: "xero-leave-1",
        });
      mocks.submitLeaveApplicationForRegion.mockResolvedValue({
        ok: true,
        value: {
          rawResponse: {
            LeaveApplications: [{ LeaveApplicationID: "xero-leave-1" }],
          },
          remoteId: "xero-leave-1",
        },
      });
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result.ok).toBe(true);
      expect(mocks.prepareAndClaimSubmitOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          availabilityRecordId: record.id,
          expectedSequence: record.derived_sequence,
          expectedStatus: "submitted",
        })
      );
      expect(mocks.submitLeaveApplicationForRegion).toHaveBeenCalledTimes(1);
      expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approval_status: "approved",
            xero_write_claimed_at: null,
          }),
        })
      );
    });
    it("normalises a missing title before fingerprint persistence and provider dispatch", async () => {
      const untitled = { ...record, title: null };
      mocks.availabilityFindFirst
        .mockResolvedValueOnce(untitled)
        .mockResolvedValueOnce({
          ...untitled,
          approval_status: "approved",
          source_remote_id: "xero-leave-1",
        });
      mocks.submitLeaveApplicationForRegion.mockResolvedValue({
        ok: true,
        value: { rawResponse: {}, remoteId: "xero-leave-1" },
      });
      await createLeaveOnApproval(input, mockPort);
      expect(mocks.prepareAndClaimSubmitOperation).toHaveBeenCalledWith(
        expect.objectContaining({ requestTitle: "Leave request" })
      );
      expect(mocks.submitLeaveApplicationForRegion).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Leave request" })
      );
    });
    it("leaves an accepted operation recoverable when durable side effects fail", async () => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      mocks.submitLeaveApplicationForRegion.mockResolvedValue({
        ok: true,
        value: { rawResponse: {}, remoteId: "xero-leave-1" },
      });
      mocks.completeSideEffects.mockResolvedValueOnce({
        error: { message: "publication failed" },
        ok: false,
      });
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.markSubmitCompleted).not.toHaveBeenCalled();
      expect(mocks.releaseSideEffects).toHaveBeenCalledOnce();
    });
    it("blocks the write and never calls Xero when a live claim already exists", async () => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      mocks.prepareAndClaimSubmitOperation.mockResolvedValueOnce(null);
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    });
    it("allows a stale worker claim to be reclaimed for a new prepared operation", async () => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      mocks.prepareAndClaimSubmitOperation.mockResolvedValueOnce(null);
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    });
    it("does not call Xero when an unresolved operation survives lease expiry", async () => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      mocks.prepareAndClaimSubmitOperation.mockResolvedValueOnce(null);
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.availabilityClaimUpdateMany).not.toHaveBeenCalled();
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    });
    it("releases the claim when Xero rejects the submission", async () => {
      mocks.availabilityFindFirst
        .mockResolvedValueOnce(record)
        .mockResolvedValueOnce({
          ...record,
          approval_status: "xero_sync_failed",
          xero_write_error: "This leave overlaps an existing record in Xero.",
        });
      mocks.submitLeaveApplicationForRegion.mockResolvedValue({
        error: {
          code: "conflict_error",
          message: "Overlap",
          rawPayload: { Message: "Overlap" },
          userMessage: "This leave overlaps an existing record in Xero.",
        },
        ok: false,
      });
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result.ok).toBe(true);
      expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approval_status: "xero_sync_failed",
            xero_write_claimed_at: null,
          }),
        })
      );
    });
    it("releases the worker claim but preserves unknown outcome when Xero throws", async () => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      mocks.submitLeaveApplicationForRegion.mockRejectedValue(
        new Error("socket reset")
      );
      const result = await createLeaveOnApproval(input, mockPort);
      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.markSubmitOutcomeUnknown).toHaveBeenCalledWith(
        expect.objectContaining({ availabilityRecordId: record.id }),
        "transport_exception"
      );
      expect(mocks.availabilityClaimUpdateMany).toHaveBeenCalledTimes(1);
      expect(mocks.availabilityClaimUpdateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: { xero_write_claimed_at: null },
        })
      );
    });
    it("blocks retrySubmission and never calls Xero when a live claim already exists", async () => {
      const failedRecord = {
        ...record,
        approval_status: "xero_sync_failed",
        failed_action: "approve",
      };
      mocks.availabilityFindFirst.mockResolvedValueOnce(failedRecord);
      mocks.prepareAndClaimSubmitOperation.mockResolvedValueOnce(null);
      const result = await createLeaveOnApproval(input, mockPort, true);
      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    });
  });
});
