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
  hasActiveXeroConnection: vi.fn(),
  markSubmitCompleted: vi.fn(),
  markSubmitDefinitiveFailure: vi.fn(),
  markSubmitDispatchStarted: vi.fn(),
  markSubmitOutcomeUnknown: vi.fn(),
  markSubmitProviderAccepted: vi.fn(),
  materialiseAvailabilityPublication: vi.fn(() =>
    Promise.resolve({ ok: true, value: undefined })
  ),
  personFindFirst: vi.fn(),
  prepareAndClaimSubmitOperation: vi.fn(),
  releaseSideEffects: vi.fn(),
  resolveXeroEmployeeId: vi.fn(),
  resolveXeroLeaveTypeId: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  submitLeaveApplicationForRegion: vi.fn(),
  withdrawLeaveApplicationForRegion: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  acquireSubmitRecoverySideEffects: mocks.acquireSideEffects,
  database: {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      await callback({
        auditEvent: { create: mocks.auditCreate },
        availabilityRecord: { updateMany: mocks.availabilityUpdateMany },
      }),
    availabilityRecord: {
      findFirst: mocks.availabilityFindFirst,
      updateMany: mocks.availabilityClaimUpdateMany,
    },
    person: { findFirst: mocks.personFindFirst },
    xeroTenant: { findFirst: mocks.xeroTenantFindFirst },
  },
  hasUnresolvedSubmitOperation: vi.fn(),
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
  hasActiveXeroConnection: mocks.hasActiveXeroConnection,
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatchNotification,
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
  retrySubmission,
  revertToDraft,
  submitDraftRecord,
  withdrawSubmission,
} = await import("./submit-service");

const input = {
  actingOrgRole: "org:viewer",
  actingUserId: "user_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000099",
};

const record = {
  all_day: true,
  approval_status: "draft",
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

describe("submit-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availabilityFindFirst.mockReset();
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.availabilityClaimUpdateMany.mockResolvedValue({ count: 1 });
    mocks.acquireSideEffects.mockResolvedValue(new Date());
    mocks.completeSideEffects.mockResolvedValue({ ok: true, value: undefined });
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });
    mocks.hasActiveXeroConnection.mockResolvedValue(true);
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
    mocks.xeroTenantFindFirst.mockResolvedValue(xeroTenant);
  });

  it("submits a draft record and writes notification plus audit rows", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "submitted",
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

    const result = await submitDraftRecord(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "submitted",
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
        notifyManager: true,
      })
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "availability_records.submitted",
        }),
      })
    );
  });

  it("keeps a submitted transition when manager notification dispatch fails", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({
        ...record,
        approval_status: "submitted",
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

    const result = await submitDraftRecord(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "submitted",
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

    const result = await submitDraftRecord(input, mockPort);

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

    const result = await submitDraftRecord(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "xero_sync_failed",
          failed_action: "submit",
          xero_write_error:
            "This leave overlaps an existing record in Xero. Review the dates and try again.",
        }),
      })
    );
    expect(mocks.dispatchNotification).toHaveBeenCalledTimes(2);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "availability_records.submission_failed",
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

    const result = await submitDraftRecord(input, mockPort);

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "xero_sync_failed",
          failed_action: "submit",
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

    await submitDraftRecord(input, mockPort);
    expect(mocks.dispatchNotification).toHaveBeenCalled();
  });

  it("blocks submission when Xero is not connected", async () => {
    mocks.availabilityFindFirst.mockResolvedValueOnce(record);
    mocks.hasActiveXeroConnection.mockResolvedValue(false);

    const result = await submitDraftRecord(input, mockPort);

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
      expect.anything()
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
          approval_status: { in: ["submitted", "approved"] },
        }),
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
        failed_action: "submit",
      })
      .mockResolvedValueOnce({
        ...record,
        approval_status: "submitted",
        failed_action: null,
        source_remote_id: "xero-leave-1",
      });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });
    mocks.hasActiveXeroConnection.mockResolvedValue(true);
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
    mocks.xeroTenantFindFirst.mockResolvedValue(xeroTenant);
    mocks.submitLeaveApplicationForRegion.mockResolvedValue({
      ok: true,
      value: {
        rawResponse: {
          LeaveApplications: [{ LeaveApplicationID: "xero-leave-1" }],
        },
        remoteId: "xero-leave-1",
      },
    });

    const retried = await retrySubmission(input, mockPort);

    expect(retried.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "submitted",
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
          approval_status: "submitted",
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

      const result = await submitDraftRecord(input, mockPort);

      expect(result.ok).toBe(true);
      expect(mocks.prepareAndClaimSubmitOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          availabilityRecordId: record.id,
          expectedSequence: record.derived_sequence,
          expectedStatus: "draft",
        })
      );
      expect(mocks.submitLeaveApplicationForRegion).toHaveBeenCalledTimes(1);
      expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approval_status: "submitted",
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
          approval_status: "submitted",
          source_remote_id: "xero-leave-1",
        });
      mocks.submitLeaveApplicationForRegion.mockResolvedValue({
        ok: true,
        value: { rawResponse: {}, remoteId: "xero-leave-1" },
      });

      await submitDraftRecord(input, mockPort);

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

      const result = await submitDraftRecord(input, mockPort);

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

      const result = await submitDraftRecord(input, mockPort);

      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    });

    it("allows a stale worker claim to be reclaimed for a new prepared operation", async () => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      mocks.prepareAndClaimSubmitOperation.mockResolvedValueOnce(null);

      const result = await submitDraftRecord(input, mockPort);

      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    });

    it("does not call Xero when an unresolved operation survives lease expiry", async () => {
      mocks.availabilityFindFirst.mockResolvedValueOnce(record);
      mocks.prepareAndClaimSubmitOperation.mockResolvedValueOnce(null);

      const result = await submitDraftRecord(input, mockPort);

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

      const result = await submitDraftRecord(input, mockPort);

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

      const result = await submitDraftRecord(input, mockPort);

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
        failed_action: "submit",
      };
      mocks.availabilityFindFirst.mockResolvedValueOnce(failedRecord);
      mocks.prepareAndClaimSubmitOperation.mockResolvedValueOnce(null);

      const result = await retrySubmission(input, mockPort);

      expect(result).toMatchObject({
        error: { code: "submission_outcome_unknown" },
        ok: false,
      });
      expect(mocks.submitLeaveApplicationForRegion).not.toHaveBeenCalled();
    });
  });
});
