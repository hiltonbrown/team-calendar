import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availabilityUpdateMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

const transactionClient = {
  availabilityRecord: { updateMany: mocks.availabilityUpdateMany },
  outboundOperation: {
    count: mocks.count,
    create: mocks.create,
    findFirst: mocks.findFirst,
    updateMany: mocks.updateMany,
  },
};

vi.mock("../client", () => ({
  database: {
    $transaction: async (
      callback: (client: typeof transactionClient) => unknown
    ) => await callback(transactionClient),
    outboundOperation: transactionClient.outboundOperation,
  },
}));

vi.mock("../xero-locks", () => ({
  lockActiveScopedXeroConnection: vi.fn(async () => true),
}));

const {
  hasUnresolvedSubmitOperation,
  markSubmitDispatchStarted,
  prepareAndClaimSubmitOperation,
} = await import("./outbound-operations");

const request = {
  body: '[{"EmployeeID":"employee_1"}]',
  method: "POST" as const,
  url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications",
  xeroTenantId: "tenant_1",
};
const scope = {
  action: "approve" as const,
  availabilityRecordId: "00000000-0000-4000-8000-000000000099",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
};

describe("outbound operation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates one prepared operation with both tenant boundaries", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "operation_1" });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      prepareAndClaimSubmitOperation({
        ...scope,
        actorUserId: "user_1",
        claimableBefore: new Date("2026-05-01T00:00:00.000Z"),
        expectedFailedAction: null,
        expectedSequence: 2,
        expectedStatus: "draft",
        request,
        requestEmployeeId: "employee_1",
        requestEndsAt: new Date("2026-05-02T00:00:00.000Z"),
        requestFingerprint: "fingerprint",
        requestLeaveTypeId: "leave_type_1",
        requestStartsAt: new Date("2026-05-01T00:00:00.000Z"),
        requestTitle: "Annual leave",
        requestUnits: 2,
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attemptGeneration: 1,
        claimedAt: expect.any(Date),
      })
    );

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        availability_record_id: scope.availabilityRecordId,
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        request_fingerprint: "fingerprint",
        status: "prepared",
      }),
    });
  });

  it("fences approval creates by their domain action", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "approval_1" });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    expect(
      await prepareAndClaimSubmitOperation({
        ...scope,
        action: "approve",
        actorUserId: "manager_1",
        claimableBefore: new Date(),
        expectedFailedAction: null,
        expectedSequence: 2,
        expectedStatus: "submitted",
        request,
        requestEmployeeId: "employee_1",
        requestEndsAt: new Date(),
        requestFingerprint: "immutable",
        requestLeaveTypeId: "leave_type_1",
        requestStartsAt: new Date(),
        requestTitle: "Annual leave",
        requestUnits: 2,
      })
    ).not.toBeNull();
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "approve",
        actor_user_id: "manager_1",
      }),
    });
    expect(mocks.availabilityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          outbound_operations: {
            none: {
              action: { not: "approve" },
              status: {
                in: ["prepared", "outcome_unknown", "provider_accepted"],
              },
            },
          },
          source_remote_id: null,
        }),
      })
    );
    mocks.findFirst.mockResolvedValue({ dispatch_started_at: null });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await markSubmitDispatchStarted({
      ...scope,
      action: "approve",
      attemptGeneration: 1,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: "approve",
          attempt_generation: 1,
        }),
      })
    );
  });

  it("assigns different bounded provider keys to separate logical mutations", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValueOnce({ id: "operation_1" });
    mocks.create.mockResolvedValueOnce({ id: "operation_2" });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    const input = {
      ...scope,
      actorUserId: "manager_1",
      claimableBefore: new Date(),
      expectedFailedAction: null,
      expectedSequence: 2,
      expectedStatus: "submitted" as const,
      request,
      requestEmployeeId: "employee_1",
      requestEndsAt: new Date("2026-05-02T00:00:00.000Z"),
      requestFingerprint: "immutable",
      requestLeaveTypeId: "leave_type_1",
      requestStartsAt: new Date("2026-05-01T00:00:00.000Z"),
      requestTitle: "Annual leave",
      requestUnits: 2,
    };
    const first = await prepareAndClaimSubmitOperation(input);
    const second = await prepareAndClaimSubmitOperation({
      ...input,
      availabilityRecordId: "00000000-0000-4000-8000-000000000100",
    });
    expect(first?.mutation.idempotencyKey).toHaveLength(36);
    expect(second?.mutation.idempotencyKey).toHaveLength(36);
    expect(second?.mutation.idempotencyKey).not.toBe(
      first?.mutation.idempotencyKey
    );
  });

  it("blocks a second create while the existing outcome is unresolved", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "operation_1",
      status: "outcome_unknown",
    });

    await expect(
      prepareAndClaimSubmitOperation({
        ...scope,
        actorUserId: "user_2",
        claimableBefore: new Date("2026-05-01T00:00:00.000Z"),
        expectedFailedAction: null,
        expectedSequence: 2,
        expectedStatus: "draft",
        request,
        requestEmployeeId: "employee_1",
        requestEndsAt: new Date("2026-05-02T00:00:00.000Z"),
        requestFingerprint: "fingerprint",
        requestLeaveTypeId: "leave_type_1",
        requestStartsAt: new Date("2026-05-01T00:00:00.000Z"),
        requestTitle: "Annual leave",
        requestUnits: 2,
      })
    ).resolves.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("fences and retries a prepared operation only after its record claim is reclaimable", async () => {
    mocks.findFirst.mockResolvedValue({
      actor_user_id: "user_1",
      attempt_generation: 1,
      dispatch_started_at: null,
      id: "operation_1",
      idempotency_first_dispatched_at: new Date(),
      idempotency_key: "11111111-1111-4111-8111-111111111111",
      idempotency_replay_before: new Date(Date.now() + 300_000),
      request_body_json: request.body,
      request_fingerprint: "same-request-fingerprint",
      request_method: request.method,
      request_url: request.url,
      request_xero_tenant_id: request.xeroTenantId,
      status: "prepared",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      prepareAndClaimSubmitOperation({
        ...scope,
        actorUserId: "user_2",
        claimableBefore: new Date("2026-05-01T00:00:00.000Z"),
        expectedFailedAction: null,
        expectedSequence: 2,
        expectedStatus: "draft",
        request,
        requestEmployeeId: "employee_1",
        requestEndsAt: new Date("2026-05-02T00:00:00.000Z"),
        requestFingerprint: "same-request-fingerprint",
        requestLeaveTypeId: "leave_type_1",
        requestStartsAt: new Date("2026-05-01T00:00:00.000Z"),
        requestTitle: "Annual leave",
        requestUnits: 2,
      })
    ).resolves.toEqual(
      expect.objectContaining({
        attemptGeneration: 2,
        claimedAt: expect.any(Date),
      })
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempt_generation: 2 }),
        where: expect.objectContaining({
          attempt_generation: 1,
          dispatch_started_at: null,
          status: "prepared",
        }),
      })
    );
  });

  it("uses a conditional transition before network dispatch", async () => {
    mocks.findFirst.mockResolvedValue({ dispatch_started_at: null });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      markSubmitDispatchStarted({ ...scope, attemptGeneration: 1 })
    ).resolves.toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: {
        dispatch_started_at: expect.any(Date),
        idempotency_first_dispatched_at: expect.any(Date),
        idempotency_replay_before: expect.any(Date),
        status: "outcome_unknown",
      },
      where: {
        action: "approve",
        attempt_generation: 1,
        availability_record_id: scope.availabilityRecordId,
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        status: { in: ["prepared", "outcome_unknown"] },
      },
    });
  });

  it("detects unresolved operations only inside the requested tenant", async () => {
    mocks.count.mockResolvedValue(1);

    await expect(hasUnresolvedSubmitOperation(scope)).resolves.toBe(true);
    expect(mocks.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        clerk_org_id: scope.clerkOrgId,
        organisation_id: scope.organisationId,
        status: { in: ["prepared", "outcome_unknown", "provider_accepted"] },
      }),
    });
  });
  it("replays an uncertain identical request at 4:59 with its UUID and original actor", async () => {
    const now = new Date("2026-10-07T12:04:59Z");
    vi.setSystemTime(now);
    mocks.findFirst.mockResolvedValue({
      actor_user_id: "original_actor",
      attempt_generation: 1,
      dispatch_started_at: new Date("2026-10-07T12:00:00Z"),
      id: "operation_1",
      idempotency_first_dispatched_at: new Date("2026-10-07T12:00:00Z"),
      idempotency_key: "11111111-1111-4111-8111-111111111111",
      idempotency_replay_before: new Date("2026-10-07T12:05:00Z"),
      request_body_json: request.body,
      request_fingerprint: "fingerprint",
      request_method: request.method,
      request_url: request.url,
      request_xero_tenant_id: request.xeroTenantId,
      status: "outcome_unknown",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.availabilityUpdateMany.mockResolvedValue({ count: 1 });
    const input = {
      ...scope,
      actorUserId: "retry_actor",
      claimableBefore: now,
      expectedFailedAction: null,
      expectedSequence: 2,
      expectedStatus: "submitted" as const,
      request,
      requestEmployeeId: "employee_1",
      requestEndsAt: now,
      requestFingerprint: "fingerprint",
      requestLeaveTypeId: "leave_type_1",
      requestStartsAt: now,
      requestTitle: null,
      requestUnits: 2,
    };
    const replay = await prepareAndClaimSubmitOperation(input);
    expect(replay).toEqual(
      expect.objectContaining({
        attemptGeneration: 2,
        mutation: expect.objectContaining({
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          replayBefore: new Date("2026-10-07T12:05:00Z"),
        }),
      })
    );
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      "actor_user_id"
    );
    vi.setSystemTime(new Date("2026-10-07T12:05:00Z"));
    expect(await prepareAndClaimSubmitOperation(input)).toBeNull();
    vi.useRealTimers();
  });
  it("rejects an uncertain replay with changed body or tenant", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "operation_1",
      idempotency_key: "11111111-1111-4111-8111-111111111111",
      idempotency_replay_before: new Date(Date.now() + 60_000),
      request_body_json: request.body,
      request_fingerprint: "fingerprint",
      request_method: request.method,
      request_url: request.url,
      request_xero_tenant_id: "different_tenant",
      status: "outcome_unknown",
    });
    expect(
      await prepareAndClaimSubmitOperation({
        ...scope,
        actorUserId: "actor",
        claimableBefore: new Date(),
        expectedFailedAction: null,
        expectedSequence: 2,
        expectedStatus: "submitted",
        request,
        requestEmployeeId: "employee",
        requestEndsAt: new Date(),
        requestFingerprint: "fingerprint",
        requestLeaveTypeId: "type",
        requestStartsAt: new Date(),
        requestTitle: null,
        requestUnits: 1,
      })
    ).toBeNull();
  });

  it("starts the fixed window at dispatch after an undispatched operation stalls", async () => {
    const preparedAt = new Date("2026-10-07T10:00:00Z");
    const dispatchAt = new Date("2026-10-07T13:00:00Z");
    vi.setSystemTime(dispatchAt);
    mocks.findFirst.mockResolvedValue({
      dispatch_started_at: null,
      idempotency_first_dispatched_at: null,
      idempotency_key: "11111111-1111-4111-8111-111111111111",
      idempotency_replay_before: null,
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const mutation = {
      firstDispatchedAt: preparedAt,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      replayBefore: new Date(preparedAt.getTime() + 300_000),
      request,
    };
    expect(
      await markSubmitDispatchStarted(
        { ...scope, attemptGeneration: 1 },
        mutation
      )
    ).toBe(true);
    expect(mutation.firstDispatchedAt).toEqual(dispatchAt);
    expect(mutation.replayBefore).toEqual(new Date("2026-10-07T13:05:00Z"));
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotency_first_dispatched_at: dispatchAt,
          idempotency_replay_before: mutation.replayBefore,
        }),
      })
    );
    vi.useRealTimers();
  });
});
