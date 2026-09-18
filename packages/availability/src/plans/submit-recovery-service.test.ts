import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  auditFindFirst: vi.fn(),
  availabilityFindFirst: vi.fn(),
  availabilityUpdate: vi.fn(),
  availabilityUpdateMany: vi.fn(),
  computeWorkingDays: vi.fn(),
  getSubmitOperation: vi.fn(),
  markSubmitCompleted: vi.fn(),
  markSubmitDefinitiveFailure: vi.fn(),
  markSubmitProviderAccepted: vi.fn(),
  materialise: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
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
    auditEvent: { create: mocks.auditCreate, findFirst: mocks.auditFindFirst },
    availabilityRecord: { findFirst: mocks.availabilityFindFirst },
  },
  getSubmitOperation: mocks.getSubmitOperation,
  markSubmitCompleted: mocks.markSubmitCompleted,
  markSubmitDefinitiveFailure: mocks.markSubmitDefinitiveFailure,
  markSubmitProviderAccepted: mocks.markSubmitProviderAccepted,
  scopedTo: (scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  }),
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
  ends_at: new Date("2026-05-05T00:00:00.000Z"),
  id: input.recordId,
  person: {
    location_id: null,
    manager: { clerk_user_id: "manager_user_1", id: "manager_person_1" },
  },
  person_id: "person_1",
  record_type: "annual_leave",
  starts_at: new Date("2026-05-04T00:00:00.000Z"),
  title: "Annual leave",
};
const candidate = {
  approvalStatus: "submitted" as const,
  employeeId: "employee_1",
  endsAt: "2026-05-05",
  leaveTypeId: "leave_type_1",
  rawResponse: { LeaveApplicationID: "remote_1" },
  remoteId: "remote_1",
  startsAt: "2026-05-04",
  title: "Annual leave",
  units: 2,
};
const port = {
  approveLeaveApplication: vi.fn(),
  declineLeaveApplication: vi.fn(),
  findLeaveApplicationCandidates: vi.fn(),
  resolveEmployeeId: vi.fn(),
  resolveLeaveTypeId: vi.fn(),
  submitLeaveApplication: vi.fn(),
  withdrawLeaveApplication: vi.fn(),
};

describe("submit recovery service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availabilityFindFirst.mockResolvedValue(record);
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    mocks.computeWorkingDays.mockResolvedValue({ ok: true, value: 2 });
    mocks.getSubmitOperation.mockResolvedValue({
      attempt_generation: 1,
      status: "outcome_unknown",
    });
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
        action: "availability_records.submit_recovery_attached",
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
          { ...candidate, remoteId: "remote_2", units: 3 },
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

  it("cannot attach a different candidate after Xero accepted a known remote ID", async () => {
    mocks.getSubmitOperation.mockResolvedValueOnce({
      attempt_generation: 1,
      known_remote_id: "remote_accepted",
      status: "provider_accepted",
    });

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

  it("preserves an authoritative approved provider state when attaching", async () => {
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

    mocks.getSubmitOperation.mockResolvedValueOnce({
      attempt_generation: 1,
      known_remote_id: "remote_1",
      status: "provider_accepted",
    });
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
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

    mocks.getSubmitOperation.mockResolvedValueOnce({
      attempt_generation: 1,
      known_remote_id: "remote_1",
      status: "provider_accepted",
    });
    mocks.availabilityFindFirst.mockResolvedValueOnce({
      ...record,
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
