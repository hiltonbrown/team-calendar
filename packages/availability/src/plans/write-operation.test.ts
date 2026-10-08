import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accepted: vi.fn(),
  completed: vi.fn(),
  failure: vi.fn(),
  prepare: vi.fn(),
  start: vi.fn(),
  unknown: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  markSubmitCompleted: mocks.completed,
  markSubmitDefinitiveFailure: mocks.failure,
  markSubmitDispatchStarted: mocks.start,
  markSubmitOutcomeUnknown: mocks.unknown,
  markSubmitProviderAccepted: mocks.accepted,
  prepareAndClaimSubmitOperation: mocks.prepare,
}));
vi.mock("./submit-side-effects", () => ({
  completeSubmitSideEffects: vi.fn(),
}));
const { prepareXeroWrite, recordXeroWriteOutcome } = await import(
  "./write-operation"
);
const request = {
  body: null,
  method: "POST" as const,
  url: "https://api.xero.com/payroll.xro/1.0/LeaveApplications/id/approve",
  xeroTenantId: "tenant",
};
const port = { prepareLeaveMutation: vi.fn() };
const input = {
  action: "approve" as const,
  actorUserId: "actor",
  clerkOrgId: "org",
  employeeId: "employee",
  endsAt: new Date(),
  expectedFailedAction: null,
  expectedSequence: 1,
  expectedStatus: "submitted" as const,
  organisationId: "organisation",
  recordId: "record",
  remoteId: "remote",
  startsAt: new Date(),
  title: null,
  units: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  port.prepareLeaveMutation.mockResolvedValue({ ok: true, value: request });
  mocks.prepare.mockResolvedValue({
    actorUserId: "actor",
    attemptGeneration: 1,
    claimedAt: new Date(),
    knownRemoteId: "remote",
    mutation: {
      firstDispatchedAt: new Date(),
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      replayBefore: new Date(Date.now() + 300_000),
      request,
    },
    providerAccepted: false,
  });
  mocks.start.mockResolvedValue(true);
});
it("persists the exact provider descriptor before dispatch and returns the frozen journal identity", async () => {
  const result = await prepareXeroWrite(input, port as never);
  expect(result.ok).toBe(true);
  expect(mocks.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "approve",
      actorUserId: "actor",
      remoteId: "remote",
      request,
    })
  );
  expect(mocks.start).toHaveBeenCalledWith(
    expect.objectContaining({ action: "approve", attemptGeneration: 1 }),
    expect.anything()
  );
  expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.start.mock.invocationCallOrder[0]
  );
});
it("preserves accepted state for a failed local save without redispatch", async () => {
  mocks.prepare.mockResolvedValue({
    ...(await mocks.prepare()),
    providerAccepted: true,
  });
  const result = await prepareXeroWrite(input, port as never);
  expect(result.ok).toBe(true);
  expect(mocks.start).not.toHaveBeenCalled();
});
it("does not convert a cached internal failure into permission to mint another key", async () => {
  await recordXeroWriteOutcome(
    { ...input, attemptGeneration: 1, availabilityRecordId: input.recordId },
    {
      error: {
        certainty: "outcome_unknown",
        code: "unknown_error",
        httpStatus: 500,
        message: "unknown",
        userMessage: "unknown",
      },
      ok: false,
    }
  );
  expect(mocks.unknown).toHaveBeenCalled();
  expect(mocks.failure).not.toHaveBeenCalled();
});

it("retains an earlier uncertain write when its replay is stopped before dispatch", async () => {
  await recordXeroWriteOutcome(
    { ...input, attemptGeneration: 2, availabilityRecordId: input.recordId },
    {
      error: {
        certainty: "definitive_failure",
        code: "auth_error",
        dispatchPhase: "before_dispatch",
        message: "unavailable",
        userMessage: "unavailable",
      },
      ok: false,
    },
    undefined,
    true
  );
  expect(mocks.unknown).toHaveBeenCalled();
  expect(mocks.failure).not.toHaveBeenCalled();
});

it("does not treat a code-only conflict requiring recovery as definitive", async () => {
  await recordXeroWriteOutcome(
    { ...input, attemptGeneration: 1, availabilityRecordId: input.recordId },
    {
      error: {
        code: "conflict_error",
        message: "Unresolved",
        recoveryReason: "outcome_unknown",
        userMessage: "Unresolved",
      },
      ok: false,
    }
  );
  expect(mocks.unknown).toHaveBeenCalled();
  expect(mocks.failure).not.toHaveBeenCalled();
});

it("marks a first write stopped before dispatch as definitively unprocessed", async () => {
  await recordXeroWriteOutcome(
    { ...input, attemptGeneration: 1, availabilityRecordId: input.recordId },
    {
      error: {
        code: "network_error",
        dispatchPhase: "before_dispatch",
        message: "Preflight failed",
        userMessage: "Not sent",
      },
      ok: false,
    }
  );
  expect(mocks.failure).toHaveBeenCalled();
  expect(mocks.unknown).not.toHaveBeenCalled();
});
