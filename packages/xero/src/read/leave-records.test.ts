import { describe, expect, it } from "vitest";
import { mapXeroLeaveRecords } from "./leave-records";

describe("Xero leave records read mapper", () => {
  it("maps AU leave application payloads into narrow Xero leave records", () => {
    const records = mapXeroLeaveRecords({
      LeaveApplications: [
        {
          EmployeeID: "11111111-1111-4111-8111-111111111111",
          EndDate: "2026-05-08",
          LeaveApplicationID: "22222222-2222-4222-8222-222222222222",
          LeavePeriods: [{ NumberOfUnits: 7.6 }, { NumberOfUnits: 7.6 }],
          LeaveType: "Annual Leave",
          LeaveTypeID: "annual",
          StartDate: "2026-05-07",
          Status: "APPROVED",
          Title: "Annual leave",
          UpdatedDateUTC: "2026-05-01T01:02:03.000Z",
        },
      ],
    });

    expect(records).toEqual([
      {
        employeeId: "11111111-1111-4111-8111-111111111111",
        endDate: "2026-05-08",
        leaveApplicationId: "22222222-2222-4222-8222-222222222222",
        leaveTypeId: "annual",
        leaveTypeName: "Annual Leave",
        rawPayload: expect.objectContaining({
          LeaveApplicationID: "22222222-2222-4222-8222-222222222222",
        }),
        startDate: "2026-05-07",
        status: "APPROVED",
        title: "Annual leave",
        units: 15.2,
        updatedDateUtc: "2026-05-01T01:02:03.000Z",
      },
    ]);
  });

  it("normalises known Xero status aliases", () => {
    const [scheduled, declined, pending] = mapXeroLeaveRecords({
      LeaveApplications: [
        { Status: "SCHEDULED" },
        { Status: "DECLINED" },
        { Status: "PENDING" },
      ],
    });

    expect(scheduled?.status).toBe("APPROVED");
    expect(declined?.status).toBe("REJECTED");
    expect(pending?.status).toBe("SUBMITTED");
  });

  it("maps AU V2 dates, period statuses, and PayItems leave-type names", () => {
    const [record] = mapXeroLeaveRecords(
      {
        LeaveApplications: [
          {
            EmployeeID: "11111111-1111-4111-8111-111111111111",
            EndDate: "/Date(1788912000000+0000)/",
            LeaveApplicationID: "22222222-2222-4222-8222-222222222222",
            LeavePeriods: [
              {
                LeavePeriodStatus: "REQUESTED",
                NumberOfUnits: 22.8,
              },
            ],
            LeaveTypeID: "annual",
            StartDate: "/Date(1788739200000+0000)/",
            Title: "Annual Leave",
            UpdatedDateUTC: "/Date(1788000000000+0000)/",
          },
        ],
      },
      new Map([["annual", "Annual Leave"]])
    );

    expect(record).toMatchObject({
      endDate: "2026-09-09",
      leaveTypeName: "Annual Leave",
      startDate: "2026-09-07",
      status: "SUBMITTED",
      updatedDateUtc: "2026-08-29T10:40:00.000Z",
    });
  });

  it.each([
    ["REQUESTED", "SUBMITTED"],
    ["SCHEDULED", "APPROVED"],
    ["PROCESSED", "APPROVED"],
    ["REJECTED", "REJECTED"],
  ] as const)(
    "derives %s application state from AU leave periods",
    (periodStatus, expected) => {
      const [record] = mapXeroLeaveRecords({
        LeaveApplications: [
          {
            LeavePeriods: [{ LeavePeriodStatus: periodStatus }],
          },
        ],
      });

      expect(record?.status).toBe(expected);
    }
  );

  it("distinguishes malformed envelopes from valid empty arrays", async () => {
    const { tryMapXeroLeaveRecords } = await import("./leave-records");

    const emptyResult = tryMapXeroLeaveRecords({ LeaveApplications: [] });
    expect(emptyResult).toEqual({
      failures: [],
      ok: true,
      rawItemCount: 0,
      records: [],
      seenLeaveApplicationIds: [],
    });

    const malformedEnvelope = tryMapXeroLeaveRecords({
      LeaveApplications: "not-an-array",
    });
    expect(malformedEnvelope).toEqual({
      ok: false,
      reason: "malformed_envelope",
    });

    const missingEnvelope = tryMapXeroLeaveRecords({});
    expect(missingEnvelope).toEqual({
      ok: false,
      reason: "malformed_envelope",
    });
  });

  it("isolates malformed rows from valid neighbouring rows and records diagnostics", async () => {
    const { tryMapXeroLeaveRecords } = await import("./leave-records");

    const result = tryMapXeroLeaveRecords({
      LeaveApplications: [
        {
          EmployeeID: "11111111-1111-4111-8111-111111111111",
          EndDate: "2026-05-08",
          LeaveApplicationID: "valid-1",
          LeaveTypeID: "annual",
          StartDate: "2026-05-07",
          Status: "APPROVED",
        },
        "not an object",
        {
          LeaveApplicationID: "invalid-row-2",
          LeavePeriods: "not-an-array",
        },
        {
          EmployeeID: "22222222-2222-4222-8222-222222222222",
          EndDate: "2026-06-08",
          LeaveApplicationID: "valid-2",
          LeaveTypeID: "sick",
          StartDate: "2026-06-07",
          Status: "SUBMITTED",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rawItemCount).toBe(4);
      expect(result.records).toHaveLength(2);
      expect(result.records[0]?.leaveApplicationId).toBe("valid-1");
      expect(result.records[1]?.leaveApplicationId).toBe("valid-2");
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0]).toEqual({
        index: 1,
        rawLeaveApplicationId: null,
        rawPayload: "not an object",
        reason: "Leave application record does not match the expected shape",
      });
      expect(result.failures[1]).toEqual({
        index: 2,
        rawLeaveApplicationId: "invalid-row-2",
        rawPayload: expect.objectContaining({
          LeaveApplicationID: "invalid-row-2",
        }),
        reason: "Leave application record does not match the expected shape",
      });
      expect(result.seenLeaveApplicationIds).toEqual([
        "valid-1",
        "invalid-row-2",
        "valid-2",
      ]);
    }
  });
});
