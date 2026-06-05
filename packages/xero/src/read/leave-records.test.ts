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
});
