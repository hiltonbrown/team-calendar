import { describe, expect, it } from "vitest";
import {
  assertActualScheduledDiscovery,
  assertIndependentInitialImport,
} from "./xero-import-observer.js";

const personId = "00000000-0000-4000-8000-000000000001";
const organisationId = "00000000-0000-4000-8000-000000000002";
const now = "2026-09-27T00:00:00.000Z";
const scope = {
  clerkOrgId: "org_owned",
  organisationId,
  xeroTenantId: "tenant-owned",
};
const importScope = {
  ...scope,
  expectedRunIds: [
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000005",
  ],
  verificationStartedAt: now,
};
function raw() {
  return {
    balances: [
      {
        EmployeeID: "employee-owned",
        LeaveBalances: [
          {
            LeaveTypeID: "type-owned",
            NumberOfUnits: 24,
            TypeOfUnits: "Hours",
          },
        ],
      },
    ],
    complete: true,
    employeePages: 1,
    employees: [{ EmployeeID: "employee-owned" }],
    intercepted: false,
    leavePages: 1,
    leaves: [
      {
        EmployeeID: "employee-owned",
        EndDate: "2026-10-02",
        LeaveApplicationID: "leave-owned",
        LeavePeriods: [{ LeavePeriodStatus: "SCHEDULED", NumberOfUnits: 8 }],
        LeaveTypeID: "type-owned",
        StartDate: "2026-10-01",
      },
    ],
    observedAt: now,
    origin: "https://api.xero.com",
  };
}
function canonical() {
  return {
    ...scope,
    balances: [
      { leaveTypeId: "type-owned", personId, unit: "hours", value: 24 },
    ],
    leaves: [
      {
        endsAt: "2026-10-02",
        personId,
        rawLeaveTypeId: "type-owned",
        rawUnits: 8,
        sourceId: "leave-owned",
        startsAt: "2026-10-01",
      },
    ],
    observedAt: now,
    people: [{ personId, sourceId: "employee-owned" }],
    runs: ["people", "leave_records", "leave_balances"].map(
      (entity, index) => ({
        completedAt: now,
        entity,
        failed: 0,
        fetched: 1,
        id: `00000000-0000-4000-8000-00000000000${index + 3}`,
        startedAt: now,
        status: "succeeded",
      })
    ),
  };
}
describe("actual independent import and scheduler assertions", () => {
  it("compares exact raw source IDs, counts, leave dates/type/units and balance units", () => {
    expect(
      assertIndependentInitialImport(raw(), canonical(), importScope)
    ).toMatchObject({
      balanceCount: 1,
      employeeCount: 1,
      leaveCount: 1,
      liveMultiplePages: false,
    });
  });
  it.each([
    "omission",
    "duplicate",
    "dates",
    "units",
    "balance",
    "stage",
    "scope",
  ])("rejects %s", (fault) => {
    const value = canonical();
    if (fault === "omission") {
      value.people = [];
    }
    if (fault === "duplicate" && value.people[0]) {
      value.people.push(value.people[0]);
    }
    if (fault === "dates" && value.leaves[0]) {
      value.leaves[0].startsAt = "2026-10-03";
    }
    if (fault === "units" && value.leaves[0]) {
      value.leaves[0].rawUnits = 9;
    }
    if (fault === "balance" && value.balances[0]) {
      value.balances[0].value = 25;
    }
    if (fault === "stage") {
      value.runs.pop();
    }
    if (fault === "scope") {
      value.clerkOrgId = "org_foreign";
    }
    expect(() =>
      assertIndependentInitialImport(raw(), value, importScope)
    ).toThrow();
  });
  it("requires a real scheduled dispatch and separately correlated terminal worker", () => {
    const value = {
      ...scope,
      candidateSha: "a".repeat(40),
      canonicalRemoteIds: ["leave-owned"],
      completedAt: now,
      dispatchedAt: now,
      eventId: "event-owned",
      logicalRunId: personId,
      providerRemoteId: "leave-owned",
      schedulerFunction: "schedule-xero-syncs",
      terminal: "completed",
      trigger: "scheduled",
      uiRemoteIds: ["leave-owned"],
      workerFunction: "sync-xero-leave-records",
      workerRunId: "worker-owned",
    };
    const expected = {
      ...scope,
      candidateSha: "a".repeat(40),
      deadline: now,
      remoteId: "leave-owned",
      startedAt: now,
    };
    expect(assertActualScheduledDiscovery(value, expected).eventId).toBe(
      "event-owned"
    );
    expect(() =>
      assertActualScheduledDiscovery({ ...value, trigger: "manual" }, expected)
    ).toThrow();
    expect(() =>
      assertActualScheduledDiscovery({ ...value, terminal: "queued" }, expected)
    ).toThrow();
    expect(() =>
      assertActualScheduledDiscovery(
        { ...value, canonicalRemoteIds: ["leave-owned", "leave-owned"] },
        expected
      )
    ).toThrow();
  });
  it.each(["count", "reversed", "future"])(
    "rejects incorrect stage %s evidence",
    (fault) => {
      const value = canonical();
      const [run] = value.runs;
      if (!run) {
        throw new Error("Missing stage");
      }
      if (fault === "count") {
        run.fetched = 2;
      }
      if (fault === "reversed") {
        run.startedAt = "2026-09-27T00:01:00.000Z";
      }
      if (fault === "future") {
        run.completedAt = "2026-09-27T00:01:00.000Z";
      }
      expect(() =>
        assertIndependentInitialImport(raw(), value, importScope)
      ).toThrow();
    }
  );
  it.each(["stale", "replaced"])(
    "rejects %s import stage provenance despite matching scope, counts and terminal status",
    (fault) => {
      const value = canonical();
      const [run] = value.runs;
      if (!run) {
        throw new Error("Missing run");
      }
      if (fault === "stale") {
        run.startedAt = "2026-09-26T23:59:00.000Z";
        run.completedAt = "2026-09-26T23:59:30.000Z";
      } else {
        run.id = "00000000-0000-4000-8000-000000000099";
      }
      expect(() =>
        assertIndependentInitialImport(raw(), value, importScope)
      ).toThrow();
    }
  );
});
