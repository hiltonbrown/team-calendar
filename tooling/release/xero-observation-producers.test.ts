import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  produceXeroLeaveObservations,
  produceXeroOperationObservation,
  produceXeroScheduledObservations,
} from "./xero-observation-producers.js";

const mocks = vi.hoisted(() => ({
  assertCurrent: vi.fn(),
  authority: vi.fn(),
  control: vi.fn(),
  end: vi.fn(),
  fetch: vi.fn(),
  provider: vi.fn(),
  query: vi.fn(),
}));
vi.mock("pg", () => ({
  Pool: class {
    end = mocks.end;
  },
}));
vi.mock("./xero-observer-authority.js", () => ({
  requireXeroObserverAuthority: mocks.authority,
}));
vi.mock("./e2e/xero-provider-oracle.js", async (original) => ({
  ...(await original<typeof import("./e2e/xero-provider-oracle.js")>()),
  readIndependentAuLeave: mocks.provider,
}));
const ids = {
  employee: "00000000-0000-4000-8000-000000000001",
  operation: "00000000-0000-4000-8000-000000000007",
  organisation: "00000000-0000-4000-8000-000000000002",
  person: "00000000-0000-4000-8000-000000000003",
  record: "00000000-0000-4000-8000-000000000004",
  run: "00000000-0000-4000-8000-000000000008",
  tenant: "00000000-0000-4000-8000-000000000006",
  type: "00000000-0000-4000-8000-000000000005",
};
const eventAliasPattern = /^event-[a-f0-9]{32}$/;
const logicalRunAliasPattern = /^sync-[a-f0-9]{32}$/;
const instant = (second: string) => `2026-09-29T02:00:${second}.000Z`;
let output: string;
function input() {
  return {
    actionCompletedAt: instant("10"),
    expected: {
      approvalStatus: "submitted",
      employeeId: ids.employee,
      endsAt: "2026-10-02",
      leaveTypeId: ids.type,
      personId: ids.person,
      rawApplicationStatuses: ["REQUESTED"],
      rawPeriodStatuses: ["REQUESTED"],
      recordId: ids.record,
      remoteId: "remote-owned",
      sourceType: "team_calendar_leave" as const,
      startsAt: "2026-10-01",
      units: 8,
    },
    fixtureAlias: "fixture-owned",
    observationId: "X10.submit",
    operationAlias: "submit-owned",
    startedAt: instant("01"),
  };
}
function rawLeave() {
  return {
    EmployeeID: ids.employee,
    EndDate: "2026-10-02",
    LeaveApplicationID: "remote-owned",
    LeavePeriods: [{ LeavePeriodStatus: "REQUESTED", NumberOfUnits: 8 }],
    LeaveTypeID: ids.type,
    StartDate: "2026-10-01",
    Status: "REQUESTED",
  };
}
function canonical() {
  return {
    approval_status: "submitted",
    employee_id: ids.employee,
    ends_at: "2026-10-02",
    id: ids.record,
    person_id: ids.person,
    source_payload_json: rawLeave(),
    source_remote_id: "remote-owned",
    source_type: "team_calendar_leave",
    starts_at: "2026-10-01",
    updated_at: instant("09"),
  };
}
function authority() {
  return {
    assertCurrent: mocks.assertCurrent,
    context: {
      candidateSha: "a".repeat(40),
      createdAt: instant("00"),
      expiresAt: "2026-09-29T03:00:00.000Z",
      output,
      runId: ids.run,
    },
    databaseUrl: "postgresql://test:test@invalid.test/test",
    fixture: {
      alias: "fixture-owned",
      bindingGeneration: 3,
      clerkOrgId: "org_owned",
      employeeIds: [ids.employee],
      leaveTypeIds: [ids.type],
      organisationId: ids.organisation,
      permittedOperations: ["read"],
      xeroTenantId: ids.tenant,
    },
    manifest: {
      dateWindow: { from: "2026-10-01", until: "2026-10-31" },
      workers: { environmentId: "environment-owned" },
    },
    observeProvider: async <T>(observe: () => Promise<T>) => {
      await mocks.assertCurrent();
      const value = await observe();
      await mocks.assertCurrent();
      return value;
    },
    readControl: mocks.control,
    readOnly: async (
      _pool: unknown,
      observe: (client: { query: typeof mocks.query }) => Promise<unknown>
    ) => {
      await mocks.assertCurrent();
      const value = await observe({ query: mocks.query });
      await mocks.assertCurrent();
      return value;
    },
  };
}
function operationInput() {
  const { expected, ...context } = input();
  return {
    ...context,
    expected: {
      action: "submit" as const,
      employeeId: expected.employeeId,
      endsAt: expected.endsAt,
      fingerprint: "b".repeat(64),
      leaveTypeId: expected.leaveTypeId,
      operationId: ids.operation,
      recordId: expected.recordId,
      remoteId: expected.remoteId,
      startsAt: expected.startsAt,
      units: expected.units,
    },
  };
}
function operation() {
  return {
    action: "submit",
    availability_record_id: ids.record,
    completed_at: instant("09"),
    dispatch_started_at: instant("03"),
    id: ids.operation,
    known_remote_id: "remote-owned",
    prepared_at: instant("02"),
    provider_accepted_at: instant("08"),
    request_employee_id: ids.employee,
    request_ends_at: "2026-10-02",
    request_fingerprint: "b".repeat(64),
    request_leave_type_id: ids.type,
    request_starts_at: "2026-10-01",
    request_units: 8,
    status: "completed",
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(instant("15"));
  vi.stubEnv("XERO_CLIENT_ID", "unit-provider-app");
  vi.stubEnv("INNGEST_SIGNING_KEY", "unit-signing-key");
  vi.stubGlobal("fetch", mocks.fetch);
  const root = resolve("tooling/release/test-results");
  mkdirSync(root, { mode: 0o700, recursive: true });
  output = mkdtempSync(resolve(root, "producer-unit-"));
  mocks.assertCurrent.mockResolvedValue(undefined);
  mocks.authority.mockImplementation(async () => authority());
  mocks.query.mockResolvedValue({ rows: [canonical()] });
  mocks.provider.mockResolvedValue({
    complete: true,
    intercepted: false,
    observedAt: instant("15"),
    origin: "https://api.xero.com",
    payload: { LeaveApplications: [rawLeave()] },
  });
});
afterEach(() => {
  rmSync(output, { force: true, recursive: true });
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("actual Xero observation producers", () => {
  it("queries both tenant identifiers and exact record/person IDs, then independently enumerates raw provider data", async () => {
    const receipts = await produceXeroLeaveObservations(input());
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ar.clerk_org_id=$1 AND ar.organisation_id=$2::uuid AND ar.id=$3::uuid"
      ),
      ["org_owned", ids.organisation, ids.record, ids.person, ids.employee]
    );
    expect(mocks.provider).toHaveBeenCalledWith(
      expect.objectContaining({
        assertAuthority: mocks.assertCurrent,
        bindingGeneration: 3,
        clerkOrgId: "org_owned",
        expectedTenantId: ids.tenant,
        organisationId: ids.organisation,
        remoteId: null,
      })
    );
    expect(receipts.map((entry) => entry.receipt.assertionPassed)).toEqual([
      true,
      true,
    ]);
    for (const entry of receipts) {
      expect(statSync(entry.path).mode % 0o1000).toBe(0o600);
      const bytes = readFileSync(entry.path, "utf8");
      expect(bytes).not.toContain(ids.employee);
      expect(bytes).not.toContain("remote-owned");
      expect(entry.receipt.observedAt).toBe(instant("15"));
      expect(entry.receipt.runId).toBe(ids.run);
    }
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it.each([
    { approval_status: "approved" },
    {
      source_payload_json: { ...rawLeave(), LeaveApplicationID: "foreign" },
      source_remote_id: "foreign",
    },
    { person_id: ids.organisation },
    { updated_at: instant("00") },
    { updated_at: instant("20") },
  ])(
    "retains a database FAIL when observed canonical state differs: %j",
    async (patch) => {
      mocks.query.mockResolvedValue({ rows: [{ ...canonical(), ...patch }] });
      const receipts = await produceXeroLeaveObservations(input());
      expect(receipts[0].receipt.assertionPassed).toBe(false);
      expect(receipts[1].receipt.assertionPassed).toBe(true);
    }
  );
  it("reads the actual submit response envelope as well as the imported raw row", async () => {
    mocks.query.mockResolvedValue({
      rows: [
        {
          ...canonical(),
          source_payload_json: { LeaveApplications: [rawLeave()] },
        },
      ],
    });
    expect(
      (await produceXeroLeaveObservations(input()))[0].receipt.assertionPassed
    ).toBe(true);
  });
  it("does not hide a duplicate whose optional application status is absent", async () => {
    const { Status, ...withoutStatus } = rawLeave();
    mocks.provider.mockResolvedValue({
      complete: true,
      intercepted: false,
      observedAt: instant("15"),
      origin: "https://api.xero.com",
      payload: {
        LeaveApplications: [
          rawLeave(),
          { ...withoutStatus, LeaveApplicationID: "duplicate" },
        ],
      },
    });
    expect(
      (await produceXeroLeaveObservations(input()))[1].receipt.assertionPassed
    ).toBe(false);
  });
  it("detects a second identity match even when its provider status differs", async () => {
    mocks.provider.mockResolvedValue({
      complete: true,
      intercepted: false,
      observedAt: instant("15"),
      origin: "https://api.xero.com",
      payload: {
        LeaveApplications: [
          rawLeave(),
          {
            ...rawLeave(),
            LeaveApplicationID: "duplicate",
            LeavePeriods: [{ LeavePeriodStatus: "APPROVED", NumberOfUnits: 8 }],
            Status: "APPROVED",
          },
        ],
      },
    });
    expect(
      (await produceXeroLeaveObservations(input()))[1].receipt.assertionPassed
    ).toBe(false);
  });
  it("preserves canonical failure evidence when the later provider transport fails", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.provider.mockRejectedValue(new Error("Provider unavailable"));
    await expect(produceXeroLeaveObservations(input())).rejects.toThrow(
      "Provider unavailable"
    );
    expect(
      JSON.parse(
        readFileSync(resolve(output, "X10.submit-database.json"), "utf8")
      ).assertionPassed
    ).toBe(false);
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it.each([
    { LeaveApplicationID: "wrong-remote" },
    { EmployeeID: ids.organisation },
    { LeaveTypeID: ids.person },
    { StartDate: "2026-10-02" },
    { LeavePeriods: [{ LeavePeriodStatus: "APPROVED", NumberOfUnits: 8 }] },
    { LeavePeriods: [{ LeavePeriodStatus: "REQUESTED", NumberOfUnits: 9 }] },
  ])(
    "fails independent provider mismatches without production mapping: %j",
    async (patch) => {
      mocks.provider.mockResolvedValue({
        complete: true,
        intercepted: false,
        observedAt: instant("15"),
        origin: "https://api.xero.com",
        payload: { LeaveApplications: [{ ...rawLeave(), ...patch }] },
      });
      const receipts = await produceXeroLeaveObservations(input());
      expect(receipts[1].receipt.assertionPassed).toBe(false);
    }
  );
  it("detects a second matching provider application instead of selecting the expected ID", async () => {
    mocks.provider.mockResolvedValue({
      complete: true,
      intercepted: false,
      observedAt: instant("15"),
      origin: "https://api.xero.com",
      payload: {
        LeaveApplications: [
          rawLeave(),
          { ...rawLeave(), LeaveApplicationID: "duplicate" },
        ],
      },
    });
    expect(
      (await produceXeroLeaveObservations(input()))[1].receipt.assertionPassed
    ).toBe(false);
  });
  it.each(["X03.expired-state", "X26.remote-effects"])(
    "rejects foreign evidence modes/phases before any service access: %s",
    async (id) => {
      await expect(
        produceXeroLeaveObservations({ ...input(), observationId: id })
      ).rejects.toThrow();
      expect(mocks.authority).not.toHaveBeenCalled();
    }
  );
  it("rejects unowned employees, reversed dates and observations preceding the causal action", async () => {
    for (const value of [
      {
        ...input(),
        expected: { ...input().expected, employeeId: ids.organisation },
      },
      { ...input(), expected: { ...input().expected, startsAt: "2026-10-03" } },
      { ...input(), actionCompletedAt: instant("20") },
      { ...input(), startedAt: "2026-09-28T00:00:00.000Z" },
    ]) {
      await expect(produceXeroLeaveObservations(value)).rejects.toThrow();
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("does not emit evidence after read-only authority is lost", async () => {
    mocks.assertCurrent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Lost authority"));
    await expect(produceXeroLeaveObservations(input())).rejects.toThrow(
      "Lost authority"
    );
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it("observes approval creates with their own action identity", async () => {
    const approval = operationInput();
    mocks.query.mockResolvedValue({
      rows: [{ ...operation(), action: "approve" }],
    });
    const result = await produceXeroOperationObservation({
      ...approval,
      expected: { ...approval.expected, action: "approve" },
      observationId: "X11.authorised-approval",
    });
    expect(result.receipt.assertionPassed).toBe(true);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("action::text=$5"),
      expect.arrayContaining(["approve"])
    );
  });
  it("queries the exact submitted operation and proves ordered dispatch, acceptance and completion", async () => {
    mocks.query.mockResolvedValue({ rows: [operation()] });
    const result = await produceXeroOperationObservation(operationInput());
    expect(result.receipt.assertionPassed).toBe(true);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "clerk_org_id=$1 AND organisation_id=$2::uuid AND id=$3::uuid"
      ),
      ["org_owned", ids.organisation, ids.operation, ids.record, "submit"]
    );
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it.each([
    { dispatch_started_at: null, status: "prepared" },
    { provider_accepted_at: null, status: "outcome_unknown" },
    { completed_at: null, status: "definitive_failure" },
    { request_fingerprint: "c".repeat(64) },
    { dispatch_started_at: instant("09"), provider_accepted_at: instant("08") },
    { completed_at: instant("20") },
    { known_remote_id: "foreign" },
  ])(
    "does not turn incomplete, unrelated or misordered operation state into PASS: %j",
    async (patch) => {
      mocks.query.mockResolvedValue({ rows: [{ ...operation(), ...patch }] });
      expect(
        (await produceXeroOperationObservation(operationInput())).receipt
          .assertionPassed
      ).toBe(false);
    }
  );
  it("never infers no-effect or operation success from an empty scoped query", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const result = await produceXeroOperationObservation(operationInput());
    expect(result.receipt.assertionPassed).toBe(false);
    expect(result.receipt.terminal).toBe("failed");
  });
});

function scheduledInput() {
  const base = input();
  return {
    ...base,
    actionCompletedAt: instant("03"),
    deadline: instant("30"),
    dispatchId: ids.operation,
    expected: {
      employeeId: ids.employee,
      logicalRunId: ids.run,
      personId: ids.person,
      recordId: ids.record,
      remoteId: "remote-owned",
    },
    observationId: "X08.primary" as const,
  };
}
function control() {
  return {
    resources: [{ organisationId: ids.organisation, xeroTenantId: ids.tenant }],
    tickets: [
      {
        bindingGeneration: 3,
        clerkOrgId: "org_owned",
        dispatchId: ids.operation,
        eventIds: ["event-owned"],
        functionId: "sync-xero-leave-records",
        organisationId: ids.organisation,
        outcome: "succeeded",
        scheduledSlot: "2026-09-29T02:00Z",
        schedulerRunId: "scheduler-owned",
        userId: null,
        workerRunId: "worker-owned",
      },
    ],
  };
}
function inngestRun(scheduler: boolean) {
  return {
    data: {
      cron: scheduler ? "*/15 * * * *" : null,
      ended_at: scheduler ? instant("14") : instant("13"),
      environment_id: "environment-owned",
      event_id: scheduler ? "cron-event" : "event-owned",
      original_run_id: null,
      output: scheduler
        ? { dispatched: 1 }
        : { ok: true, value: { runId: ids.run, status: "succeeded" } },
      run_id: scheduler ? "scheduler-owned" : "worker-owned",
      run_started_at: scheduler ? instant("04") : instant("05"),
      status: "Completed",
    },
    metadata: { fetchedAt: instant("15") },
  };
}
function scheduledRun() {
  return {
    completed_at: instant("12"),
    id: ids.run,
    records_failed: 0,
    run_type: "leave_records",
    started_at: instant("06"),
    status: "succeeded",
    trigger_type: "scheduled",
  };
}
function scheduledRecord() {
  return {
    employee_id: ids.employee,
    id: ids.record,
    person_id: ids.person,
    source_remote_id: "remote-owned",
    updated_at: instant("08"),
  };
}
function prepareScheduled() {
  mocks.control.mockResolvedValue(control());
  mocks.fetch.mockImplementation(async (url: string) =>
    Response.json(inngestRun(url.endsWith("scheduler-owned")))
  );
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("FROM sync_runs")
      ? [scheduledRun()]
      : [scheduledRecord()],
  }));
}
describe("scheduled X08 causal observation", () => {
  it("joins actual scheduler and worker executions to the exact logical run, binding and remote record", async () => {
    prepareScheduled();
    const receipts = await produceXeroScheduledObservations(scheduledInput());
    expect(receipts?.map((entry) => entry.receipt.assertionPassed)).toEqual([
      true,
      true,
      true,
    ]);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.inngest.com/v1/runs/scheduler-owned",
      expect.objectContaining({ method: "GET", redirect: "error" })
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.inngest.com/v1/runs/worker-owned",
      expect.objectContaining({ method: "GET", redirect: "error" })
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "sr.clerk_org_id=$1 AND sr.organisation_id=$2::uuid AND sr.id=$3::uuid"
      ),
      ["org_owned", ids.organisation, ids.run, ids.tenant, ids.tenant, 3]
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ar.clerk_org_id=$1 AND ar.organisation_id=$2::uuid AND ar.source_remote_id=$3"
      ),
      ["org_owned", ids.organisation, "remote-owned"]
    );
    expect(
      receipts?.find((entry) => entry.layer === "worker")?.receipt
    ).toMatchObject({
      eventAlias: expect.stringMatching(eventAliasPattern),
      logicalRunAlias: expect.stringMatching(logicalRunAliasPattern),
      terminal: "succeeded",
    });
    expect(mocks.control).toHaveBeenCalledTimes(2);
  });
  it.each([
    { eventIds: [] },
    { schedulerRunId: null },
    { scheduledSlot: null },
    { userId: "manual-admin" },
    { bindingGeneration: 4 },
    { functionId: "sync-xero-people" },
  ])(
    "refuses unsupported or foreign scheduled attribution before transport: %j",
    async (patch) => {
      prepareScheduled();
      const state = control();
      mocks.control.mockResolvedValue({
        ...state,
        tickets: [{ ...state.tickets[0], ...patch }],
      });
      await expect(
        produceXeroScheduledObservations(scheduledInput())
      ).rejects.toThrow("attributed scheduler");
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );
  it("returns pending rather than PASS for queued/running worker state", async () => {
    prepareScheduled();
    mocks.fetch.mockImplementation((url: string) => {
      const run = inngestRun(url.endsWith("scheduler-owned"));
      if (run.data.run_id === "worker-owned") {
        run.data.status = "Running";
      }
      return Response.json(run);
    });
    expect(await produceXeroScheduledObservations(scheduledInput())).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([
    { event_id: "foreign-event" },
    { output: { ok: true, value: { runId: ids.person, status: "succeeded" } } },
    { output: { error: { code: "failed" }, ok: false } },
    { status: "Failed" },
    { run_started_at: instant("02") },
  ])(
    "retains a worker FAIL for observed terminal mismatch: %j",
    async (patch) => {
      prepareScheduled();
      mocks.fetch.mockImplementation((url: string) => {
        const run = inngestRun(url.endsWith("scheduler-owned"));
        return Response.json(
          run.data.run_id === "worker-owned"
            ? { ...run, data: { ...run.data, ...patch } }
            : run
        );
      });
      const receipts = await produceXeroScheduledObservations(scheduledInput());
      expect(
        receipts?.find((entry) => entry.layer === "worker")?.receipt
          .assertionPassed
      ).toBe(false);
    }
  );
  it.each([
    { trigger_type: "manual" },
    { records_failed: 1 },
    { status: "partial" },
    { completed_at: null },
  ])(
    "retains scoped database failure even when Inngest completed: %j",
    async (patch) => {
      prepareScheduled();
      mocks.query.mockImplementation(async (sql: string) => ({
        rows: sql.includes("FROM sync_runs")
          ? [{ ...scheduledRun(), ...patch }]
          : [scheduledRecord()],
      }));
      const receipts = await produceXeroScheduledObservations(scheduledInput());
      expect(
        receipts?.find((entry) => entry.layer === "database")?.receipt
          .assertionPassed
      ).toBe(false);
    }
  );
  it("rejects a changed dispatch ticket after asynchronous API and SQL observation", async () => {
    prepareScheduled();
    mocks.control
      .mockResolvedValueOnce(control())
      .mockResolvedValueOnce({ ...control(), tickets: [] });
    await expect(
      produceXeroScheduledObservations(scheduledInput())
    ).rejects.toThrow("dispatch changed");
  });
  it("rejects stale API metadata and reruns instead of treating them as ordinary scheduled work", async () => {
    prepareScheduled();
    const run = inngestRun(true);
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ ...run, metadata: { fetchedAt: instant("00") } })
    );
    await expect(
      produceXeroScheduledObservations(scheduledInput())
    ).rejects.toThrow("freshness");
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        ...run,
        data: { ...run.data, original_run_id: "old-run" },
      })
    );
    await expect(
      produceXeroScheduledObservations(scheduledInput())
    ).rejects.toThrow("freshness");
  });
  it("does not turn duplicate canonical associations into exactly-once discovery", async () => {
    prepareScheduled();
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("FROM sync_runs")
        ? [scheduledRun()]
        : [scheduledRecord(), { ...scheduledRecord(), id: ids.operation }],
    }));
    const receipts = await produceXeroScheduledObservations(scheduledInput());
    expect(
      receipts?.find((entry) => entry.layer === "database")?.receipt
        .assertionPassed
    ).toBe(false);
  });
});
