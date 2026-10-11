import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireSideEffects: vi.fn(),
  auditCreate: vi.fn(),
  auditFindFirst: vi.fn(),
  availabilityFindFirst: vi.fn(),
  availabilityUpdate: vi.fn(),
  availabilityUpdateMany: vi.fn(),
  computeWorkingDays: vi.fn(),
  getSubmitOperation: vi.fn(),
  hasSideEffectClaim: vi.fn(),
  markSubmitCompleted: vi.fn(),
  markSubmitDefinitiveFailure: vi.fn(),
  markSubmitProviderAccepted: vi.fn(),
  materialise: vi.fn(),
  notify: vi.fn(),
  persistMerge: vi.fn(),
  personFindFirst: vi.fn(),
  releaseSideEffects: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  acquireSubmitRecoverySideEffects: mocks.acquireSideEffects,
  fenceSubmitRecoverySideEffectClaim: mocks.hasSideEffectClaim,
  getSubmitOperation: mocks.getSubmitOperation,
  markSubmitCompleted: mocks.markSubmitCompleted,
  markSubmitDefinitiveFailure: mocks.markSubmitDefinitiveFailure,
  markSubmitProviderAccepted: mocks.markSubmitProviderAccepted,
  persistSubmitRecoveryMerge: mocks.persistMerge,
  releaseSubmitRecoverySideEffects: mocks.releaseSideEffects,
  scopedTo: (scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  }),
  tenantDatabase: vi.fn((accountId: string) => {
    if (!accountId) {
      throw new Error("Missing tenant context");
    }
    return {
      $transaction: async (callback: (client: unknown) => unknown) =>
        await callback({
          auditEvent: {
            create: mocks.auditCreate,
            findFirst: mocks.auditFindFirst,
          },
          availabilityRecord: {
            findFirst: mocks.availabilityFindFirst,
            update: mocks.availabilityUpdate,
            updateMany: mocks.availabilityUpdateMany,
          },
        }),
      auditEvent: {
        create: mocks.auditCreate,
        findFirst: mocks.auditFindFirst,
      },
      availabilityRecord: { findFirst: mocks.availabilityFindFirst },
      person: { findFirst: mocks.personFindFirst },
    };
  }),
  tenantTransaction: vi.fn(
    (accountId: string, transactionCallback: unknown, options?: unknown) => {
      if (!accountId) {
        throw new Error("Missing tenant context");
      }
      return {
        $transaction: async (callback: (client: unknown) => unknown) =>
          await callback({
            auditEvent: {
              create: mocks.auditCreate,
              findFirst: mocks.auditFindFirst,
            },
            availabilityRecord: {
              findFirst: mocks.availabilityFindFirst,
              update: mocks.availabilityUpdate,
              updateMany: mocks.availabilityUpdateMany,
            },
          }),
        auditEvent: {
          create: mocks.auditCreate,
          findFirst: mocks.auditFindFirst,
        },
        availabilityRecord: { findFirst: mocks.availabilityFindFirst },
        person: { findFirst: mocks.personFindFirst },
      }.$transaction(transactionCallback, options);
    }
  ),
}));
vi.mock("@repo/feeds", () => ({
  materialiseAvailabilityPublication: mocks.materialise,
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.notify,
}));
vi.mock("../duration/working-days", () => ({
  computeWorkingDays: mocks.computeWorkingDays,
}));

const {
  attachSubmitRecoveryCandidate,
  listSubmitRecoveryCandidates,
  resolveSubmitAsNotCreated,
} = await import("./submit-recovery-service");

const input = {
  actingOrgRole: "org:admin" as const,
  actingUserId: "admin_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000099",
};
const record = {
  all_day: true,
  approval_status: "submitted",
  ends_at: new Date("2026-05-05T00:00:00.000Z"),
  id: input.recordId,
  person: {
    clerk_user_id: "employee_1",
    id: "person_1",
    location_id: null,
    manager: { clerk_user_id: "manager_user_1", id: "manager_person_1" },
  },
  person_id: "person_1",
  record_type: "annual_leave",
  source_remote_id: null,
  starts_at: new Date("2026-05-04T00:00:00.000Z"),
  title: "Annual leave",
};
const candidate = {
  approvalStatus: "approved" as const,
  employeeId: "employee_1",
  endsAt: "2026-05-05",
  leaveTypeId: "leave_type_1",
  rawResponse: { LeaveApplicationID: "remote_1" },
  remoteId: "remote_1",
  startsAt: "2026-05-04",
  title: "Annual leave",
  units: 2,
};
const requestFingerprint = createHash("sha256")
  .update(
    JSON.stringify({
      employeeId: candidate.employeeId,
      endsAt: record.ends_at.toISOString(),
      leaveTypeId: candidate.leaveTypeId,
      startsAt: record.starts_at.toISOString(),
      title: candidate.title,
      units: candidate.units,
    })
  )
  .digest("hex");
const operation = {
  action: "approve",
  actor_user_id: "original_manager",
  attempt_generation: 1,
  merged_record_id: null,
  request_employee_id: candidate.employeeId,
  request_ends_at: record.ends_at,
  request_fingerprint: requestFingerprint,
  request_leave_type_id: candidate.leaveTypeId,
  request_starts_at: record.starts_at,
  request_title: candidate.title,
  request_units: candidate.units,
  status: "outcome_unknown",
};
const port = {
  approveLeaveApplication: vi.fn(),
  declineLeaveApplication: vi.fn(),
  findLeaveApplicationCandidates: vi.fn(),
  prepareLeaveMutation: vi.fn(),
  resolveEmployeeId: vi.fn(),
  resolveLeaveTypeId: vi.fn(),
  submitLeaveApplication: vi.fn(),
  withdrawLeaveApplication: vi.fn(),
};

describe("submit recovery service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.availabilityFindFirst.mockResolvedValue(record);
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve" ? operation : null
    );
    mocks.personFindFirst.mockResolvedValue({ id: "original_person" });
    mocks.hasSideEffectClaim.mockResolvedValue(true);
    mocks.acquireSideEffects.mockResolvedValue(new Date());
    mocks.persistMerge.mockResolvedValue(true);
    mocks.markSubmitCompleted.mockResolvedValue(true);
    mocks.markSubmitDefinitiveFailure.mockResolvedValue(true);
    mocks.markSubmitProviderAccepted.mockResolvedValue(true);
    mocks.materialise.mockResolvedValue({ ok: true, value: undefined });
    mocks.notify.mockResolvedValue({ ok: true, value: {} });
    port.findLeaveApplicationCandidates.mockResolvedValue({
      ok: true,
      value: { candidates: [candidate], complete: true },
    });
    port.resolveEmployeeId.mockResolvedValue({ ok: true, value: "employee_1" });
    port.resolveLeaveTypeId.mockResolvedValue({
      ok: true,
      value: "leave_type_1",
    });
  });

  it("rejects non-admin recovery before provider or database reads", async () => {
    const result = await listSubmitRecoveryCandidates(
      { ...input, actingOrgRole: "org:viewer" },
      port
    );

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.availabilityFindFirst).not.toHaveBeenCalled();
    expect(port.findLeaveApplicationCandidates).not.toHaveBeenCalled();
  });

  it("recovers an accepted approval create without replay and notifies the employee", async () => {
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? { ...operation, action: "approve", actor_user_id: "original_manager" }
        : null
    );
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        person: {
          ...record.person,
          clerk_user_id: "employee_1",
          id: "person_1",
        },
      })
      .mockResolvedValueOnce(null);
    port.findLeaveApplicationCandidates.mockResolvedValue({
      ok: true,
      value: {
        candidates: [{ ...candidate, approvalStatus: "approved" }],
        complete: true,
      },
    });
    const result = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Verified original approval in Xero",
        remoteId: "remote_1",
      },
      port
    );
    expect(result.ok).toBe(true);
    expect(mocks.markSubmitCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ action: "approve" }),
      expect.anything()
    );
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "approved",
          approved_at: expect.any(Date),
          approved_by_person_id: "original_person",
        }),
      })
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "employee_1",
        type: "leave_approved",
      }),
      expect.anything(),
      expect.anything()
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "availability_records.approval_recovery_attached",
        payload: expect.objectContaining({
          originalActorUserId: "original_manager",
        }),
      }),
    });
    expect(port.submitLeaveApplication).not.toHaveBeenCalled();
    expect(port.approveLeaveApplication).not.toHaveBeenCalled();
  });

  it("fails closed when two unresolved create actions exist", async () => {
    mocks.getSubmitOperation.mockResolvedValue(operation);
    expect(await listSubmitRecoveryCandidates(input, port)).toMatchObject({
      error: { code: "not_recoverable" },
      ok: false,
    });
    expect(port.findLeaveApplicationCandidates).not.toHaveBeenCalled();
  });

  it("keeps the original approver explicitly unknown if that person no longer exists", async () => {
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? { ...operation, action: "approve", actor_user_id: "removed_manager" }
        : null
    );
    mocks.personFindFirst.mockResolvedValue(null);
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(null);
    port.findLeaveApplicationCandidates.mockResolvedValue({
      ok: true,
      value: {
        candidates: [{ ...candidate, approvalStatus: "approved" }],
        complete: true,
      },
    });
    expect(
      (
        await attachSubmitRecoveryCandidate(
          {
            ...input,
            reason: "Verified original approval in Xero",
            remoteId: "remote_1",
          },
          port
        )
      ).ok
    ).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approved_by_person_id: null }),
      })
    );
  });

  it("attaches only an exact verified candidate and completes the fenced attempt", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(null);

    const result = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Verified against Xero payroll record.",
        remoteId: "remote_1",
      },
      port
    );

    expect(result.ok).toBe(true);
    expect(mocks.markSubmitProviderAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ attemptGeneration: 1 }),
      "remote_1"
    );
    expect(mocks.markSubmitCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ attemptGeneration: 1 }),
      expect.anything()
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "availability_records.approval_recovery_attached",
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      }),
    });
  });

  it("returns bounded explicit candidates without treating an incomplete read as proof", async () => {
    port.findLeaveApplicationCandidates.mockResolvedValueOnce({
      ok: true,
      value: {
        candidates: [candidate, { ...candidate, remoteId: "remote_2" }],
        complete: false,
      },
    });

    const result = await listSubmitRecoveryCandidates(input, port);

    expect(result).toEqual({
      ok: true,
      value: {
        candidates: [
          expect.objectContaining({ remoteId: "remote_1" }),
          expect.objectContaining({ remoteId: "remote_2" }),
        ],
        complete: false,
      },
    });
    expect(mocks.markSubmitProviderAccepted).not.toHaveBeenCalled();
    expect(mocks.markSubmitCompleted).not.toHaveBeenCalled();
  });

  it("does not attach a selected candidate when multiple records do not match exactly", async () => {
    port.findLeaveApplicationCandidates.mockResolvedValueOnce({
      ok: true,
      value: {
        candidates: [
          { ...candidate, employeeId: "another_employee" },
          { ...candidate, remoteId: "remote_2", title: "Changed title" },
        ],
        complete: true,
      },
    });

    const result = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Investigated the candidate records in Xero.",
        remoteId: "remote_2",
      },
      port
    );

    expect(result).toMatchObject({
      error: { code: "candidate_mismatch" },
      ok: false,
    });
    expect(mocks.markSubmitProviderAccepted).not.toHaveBeenCalled();
  });

  it("records independent evidence before allowing another create", async () => {
    const result = await resolveSubmitAsNotCreated({
      ...input,
      evidenceReference: "XERO-SUPPORT-123",
      independentlyVerified: true,
      reason: "Xero support confirmed the request was not created.",
    });

    expect(result.ok).toBe(true);
    expect(mocks.markSubmitDefinitiveFailure).toHaveBeenCalledWith(
      expect.objectContaining({ attemptGeneration: 1 }),
      "verified_not_created",
      expect.anything()
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          evidenceReference: "XERO-SUPPORT-123",
        }),
      }),
    });
  });

  it("attaches a date-only AU approval whose local one day differs from provider hours", async () => {
    const localFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          employeeId: candidate.employeeId,
          endsAt: record.ends_at.toISOString(),
          leaveTypeId: candidate.leaveTypeId,
          startsAt: record.starts_at.toISOString(),
          title: candidate.title,
          units: 1,
        })
      )
      .digest("hex");
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? {
            ...operation,
            request_fingerprint: localFingerprint,
            request_units: 1,
          }
        : null
    );
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(null);
    port.findLeaveApplicationCandidates.mockResolvedValueOnce({
      ok: true,
      value: { candidates: [{ ...candidate, units: 7.6 }], complete: true },
    });
    expect(
      await attachSubmitRecoveryCandidate(
        {
          ...input,
          reason: "Verified one calendar day against provider hours.",
          remoteId: "remote_1",
        },
        port
      )
    ).toEqual({ ok: true, value: undefined });
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_status: "approved",
          source_remote_id: "remote_1",
        }),
      })
    );
    expect(port.submitLeaveApplication).not.toHaveBeenCalled();
    expect(port.approveLeaveApplication).not.toHaveBeenCalled();
  });

  it("cannot attach a different candidate after Xero accepted a known remote ID", async () => {
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? {
            ...operation,
            attempt_generation: 1,
            known_remote_id: "remote_accepted",
            status: "provider_accepted",
          }
        : null
    );

    const result = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Verified against the accepted Xero response.",
        remoteId: "remote_1",
      },
      port
    );

    expect(result).toMatchObject({
      error: { code: "candidate_mismatch" },
      ok: false,
    });
    expect(mocks.availabilityUpdateMany).not.toHaveBeenCalled();
  });

  it("preserves an authoritative approved provider state and notifies the employee when attaching", async () => {
    port.findLeaveApplicationCandidates.mockResolvedValueOnce({
      ok: true,
      value: {
        candidates: [{ ...candidate, approvalStatus: "approved" }],
        complete: true,
      },
    });
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(null);

    const result = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Verified approved leave against the Xero record.",
        remoteId: "remote_1",
      },
      port
    );

    expect(result.ok).toBe(true);
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval_status: "approved" }),
      })
    );
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it("resumes duplicate publication cancellation from the persisted merge checkpoint", async () => {
    const duplicate = { id: "00000000-0000-4000-8000-000000000077" };
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(duplicate);
    mocks.materialise
      .mockResolvedValueOnce({ ok: true, value: undefined })
      .mockResolvedValueOnce({
        error: { code: "internal", message: "duplicate cancellation failed" },
        ok: false,
      });

    const first = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Verified the imported duplicate in Xero.",
        remoteId: "remote_1",
      },
      port
    );
    expect(first.ok).toBe(false);
    expect(mocks.persistMerge).toHaveBeenCalledWith(
      expect.anything(),
      duplicate.id,
      expect.anything()
    );

    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? {
            ...operation,
            known_remote_id: "remote_1",
            merged_record_id: duplicate.id,
            status: "provider_accepted",
          }
        : null
    );
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "approved",
      source_remote_id: "remote_1",
    });
    mocks.auditFindFirst.mockResolvedValueOnce({
      id: "publication_checkpoint",
    });

    const retry = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Retry duplicate calendar cancellation.",
        remoteId: "remote_1",
      },
      port
    );
    expect(retry.ok).toBe(true);
    expect(mocks.materialise).toHaveBeenLastCalledWith(
      expect.objectContaining({ availabilityRecordId: duplicate.id })
    );
  });

  it("uses immutable persisted request fields rather than current mappings", async () => {
    port.resolveEmployeeId.mockResolvedValueOnce({
      ok: true,
      value: "changed_employee",
    });
    port.resolveLeaveTypeId.mockResolvedValueOnce({
      ok: true,
      value: "changed_leave_type",
    });

    const result = await listSubmitRecoveryCandidates(input, port);

    expect(result.ok).toBe(true);
    expect(port.resolveEmployeeId).not.toHaveBeenCalled();
    expect(port.resolveLeaveTypeId).not.toHaveBeenCalled();
    expect(port.findLeaveApplicationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: candidate.employeeId })
    );
  });

  it("does not run notification effects when another recovery owns the lease", async () => {
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? {
            ...operation,
            known_remote_id: "remote_1",
            status: "provider_accepted",
          }
        : null
    );
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "approved",
      source_remote_id: "remote_1",
    });
    mocks.acquireSideEffects.mockResolvedValueOnce(null);

    const result = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Retry recovery while another worker owns the lease.",
        remoteId: "remote_1",
      },
      port
    );

    expect(result).toMatchObject({
      error: { code: "not_recoverable" },
      ok: false,
    });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.markSubmitCompleted).not.toHaveBeenCalled();
  });

  it("prevents an expired claimant from notifying after a takeover", async () => {
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? {
            ...operation,
            known_remote_id: "remote_1",
            status: "provider_accepted",
          }
        : null
    );
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "approved",
      source_remote_id: "remote_1",
    });
    mocks.auditFindFirst.mockResolvedValueOnce({
      id: "publication_checkpoint",
    });
    mocks.hasSideEffectClaim.mockResolvedValueOnce(false);

    const result = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Stale recovery worker resumed after lease takeover.",
        remoteId: "remote_1",
      },
      port
    );

    expect(result.ok).toBe(false);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.markSubmitCompleted).not.toHaveBeenCalled();
  });

  it("keeps the operation recoverable until a failed publication succeeds", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(null);
    mocks.materialise.mockResolvedValueOnce({
      error: { code: "internal", message: "publication failed" },
      ok: false,
    });

    const first = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Verified against the Xero payroll record.",
        remoteId: "remote_1",
      },
      port
    );

    expect(first).toMatchObject({
      error: { code: "provider_error" },
      ok: false,
    });
    expect(mocks.markSubmitCompleted).not.toHaveBeenCalled();

    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? {
            ...operation,
            attempt_generation: 1,
            known_remote_id: "remote_1",
            status: "provider_accepted",
          }
        : null
    );
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "approved",
      source_remote_id: "remote_1",
    });
    const retry = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Retry calendar and notification recovery.",
        remoteId: "remote_1",
      },
      port
    );

    expect(retry.ok).toBe(true);
    expect(mocks.materialise).toHaveBeenCalledTimes(2);
    expect(mocks.markSubmitCompleted).toHaveBeenCalledTimes(1);
  });

  it("retries notification from its durable checkpoint before completion", async () => {
    mocks.availabilityFindFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(null);
    mocks.notify.mockResolvedValueOnce({
      error: { code: "unknown_error", message: "notification failed" },
      ok: false,
    });

    const first = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Verified against the Xero payroll record.",
        remoteId: "remote_1",
      },
      port
    );
    expect(first).toMatchObject({
      error: { code: "provider_error" },
      ok: false,
    });
    expect(mocks.markSubmitCompleted).not.toHaveBeenCalled();

    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve"
        ? {
            ...operation,
            attempt_generation: 1,
            known_remote_id: "remote_1",
            status: "provider_accepted",
          }
        : null
    );
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
      approval_status: "approved",
      source_remote_id: "remote_1",
    });
    mocks.auditFindFirst
      .mockResolvedValueOnce({ id: "publication_checkpoint" })
      .mockResolvedValueOnce(null);

    const retry = await attachSubmitRecoveryCandidate(
      {
        ...input,
        reason: "Retry the failed manager notification.",
        remoteId: "remote_1",
      },
      port
    );

    expect(retry.ok).toBe(true);
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.markSubmitCompleted).toHaveBeenCalledTimes(1);
  });
});

describe("administrator imported leave transition recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.availabilityFindFirst.mockResolvedValue({
      ...record,
      approval_status: "submitted",
      source_remote_id: "remote_1",
    });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.hasSideEffectClaim.mockResolvedValue(true);
    mocks.acquireSideEffects.mockResolvedValue(new Date());
    mocks.persistMerge.mockResolvedValue(true);
    mocks.markSubmitCompleted.mockResolvedValue(true);
    mocks.markSubmitProviderAccepted.mockResolvedValue(true);
    mocks.personFindFirst.mockResolvedValue({ id: "original_person" });
    mocks.materialise.mockResolvedValue({ ok: true, value: undefined });
    mocks.notify.mockResolvedValue({ ok: true, value: {} });
  });
  function remoteOperation(action: "approve" | "decline" | "withdraw") {
    const descriptor = {
      body:
        action === "approve"
          ? null
          : JSON.stringify({
              Reason:
                action === "decline"
                  ? "Declined by original manager"
                  : "Withdrawn by employee in Team Calendar.",
            }),
      method: "POST",
      url: `https://api.xero.com/payroll.xro/1.0/LeaveApplications/remote_1/${action === "approve" ? "approve" : "reject"}`,
      xeroTenantId: "original_xero_tenant",
    };
    return {
      ...operation,
      action,
      actor_user_id: "original_actor",
      known_remote_id: "remote_1",
      request_body_json: descriptor.body,
      request_fingerprint: createHash("sha256")
        .update(
          JSON.stringify([
            descriptor.xeroTenantId,
            descriptor.method,
            descriptor.url,
            descriptor.body,
          ])
        )
        .digest("hex"),
      request_leave_type_id: "",
      request_method: descriptor.method,
      request_reason:
        action === "decline" ? "Declined by original manager" : null,
      request_url: descriptor.url,
      request_xero_tenant_id: descriptor.xeroTenantId,
    };
  }
  it.each([
    ["approve", "approved", "approved", "leave_approved", "employee_1"],
    ["decline", "declined", "declined", "leave_declined", "employee_1"],
    ["withdraw", "declined", "withdrawn", "leave_withdrawn", "manager_user_1"],
  ] as const)(
    "recovers imported %s from authoritative provider state without replay",
    async (action, providerStatus, localStatus, notificationType, recipientUserId) => {
      const pending = remoteOperation(action);
      mocks.getSubmitOperation.mockImplementation(async (scope) =>
        scope.action === action ? pending : null
      );
      mocks.availabilityFindFirst
        .mockResolvedValueOnce({
          ...record,
          approval_status: "submitted",
          source_remote_id: "remote_1",
        })
        .mockResolvedValueOnce(null);
      port.findLeaveApplicationCandidates.mockResolvedValueOnce({
        ok: true,
        value: {
          candidates: [{ ...candidate, approvalStatus: providerStatus }],
          complete: true,
        },
      });
      const result = await attachSubmitRecoveryCandidate(
        {
          ...input,
          reason: "Verified the imported transition directly in Xero.",
          remoteId: "remote_1",
        },
        port
      );
      expect(result).toEqual({ ok: true, value: undefined });
      expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approval_status: localStatus }),
          where: expect.objectContaining({
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            source_remote_id: "remote_1",
          }),
        })
      );
      expect(mocks.markSubmitCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ action, attemptGeneration: 1 }),
        expect.anything()
      );
      expect(mocks.auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: `availability_records.${action === "approve" ? "approval" : action}_recovery_attached`,
          payload: expect.objectContaining({
            originalActorUserId: "original_actor",
          }),
        }),
      });
      expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ recipientUserId, type: notificationType }),
        expect.anything(),
        expect.anything()
      );
      for (const write of [
        port.prepareLeaveMutation,
        port.submitLeaveApplication,
        port.approveLeaveApplication,
        port.declineLeaveApplication,
        port.withdrawLeaveApplication,
      ]) {
        expect(write).not.toHaveBeenCalled();
      }
    }
  );
  it("recovers a provider-accepted decline after local save loss with the original reason", async () => {
    const originalReason = "Declined by original manager";
    const pending = {
      ...remoteOperation("decline"),
      request_reason: originalReason,
      status: "provider_accepted",
    };
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "decline" ? pending : null
    );
    mocks.availabilityFindFirst
      .mockResolvedValueOnce({
        ...record,
        approval_note: "Stale local note",
        approval_status: "submitted",
        source_remote_id: "remote_1",
      })
      .mockResolvedValueOnce(null);
    port.findLeaveApplicationCandidates.mockResolvedValueOnce({
      ok: true,
      value: {
        candidates: [{ ...candidate, approvalStatus: "declined" }],
        complete: true,
      },
    });
    expect(
      await attachSubmitRecoveryCandidate(
        {
          ...input,
          reason: "Administrator checked provider state after local save loss.",
          remoteId: "remote_1",
        },
        port
      )
    ).toEqual({ ok: true, value: undefined });
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval_note: originalReason,
          approval_status: "declined",
        }),
      })
    );
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ body: originalReason, type: "leave_declined" }),
      expect.anything(),
      expect.anything()
    );
    expect(port.declineLeaveApplication).not.toHaveBeenCalled();
    expect(port.submitLeaveApplication).not.toHaveBeenCalled();
  });

  it("does not attach an imported transition whose target provider state is unconfirmed", async () => {
    const pending = remoteOperation("approve");
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "approve" ? pending : null
    );
    port.findLeaveApplicationCandidates.mockResolvedValueOnce({
      ok: true,
      value: {
        candidates: [{ ...candidate, approvalStatus: "submitted" }],
        complete: true,
      },
    });
    expect(
      await attachSubmitRecoveryCandidate(
        {
          ...input,
          reason: "Provider state still needs administrator verification.",
          remoteId: "remote_1",
        },
        port
      )
    ).toMatchObject({ error: { code: "candidate_mismatch" }, ok: false });
    expect(mocks.markSubmitProviderAccepted).not.toHaveBeenCalled();
    expect(mocks.availabilityUpdateMany).not.toHaveBeenCalled();
  });
  it("rejects altered imported request evidence before reading provider candidates", async () => {
    const pending = {
      ...remoteOperation("decline"),
      request_body_json: "changed-body",
    };
    mocks.getSubmitOperation.mockImplementation(async (scope) =>
      scope.action === "decline" ? pending : null
    );
    expect(await listSubmitRecoveryCandidates(input, port)).toMatchObject({
      error: { code: "not_recoverable" },
      ok: false,
    });
    expect(port.findLeaveApplicationCandidates).not.toHaveBeenCalled();
  });
});
