import { describe, expect, it } from "vitest";
import { mapXeroLeaveBalances } from "./leave-balances";

describe("Xero leave balances read mapper", () => {
  it("maps AU employee detail leave balances into narrow Xero balances", () => {
    const balances = mapXeroLeaveBalances({
      Employees: [
        {
          EmployeeID: "11111111-1111-4111-8111-111111111111",
          LeaveBalances: [
            {
              LeaveName: "Annual Leave",
              LeaveTypeID: "annual",
              NumberOfUnits: 76,
              TypeOfUnits: "Hours",
            },
            {
              LeaveName: "Personal Leave",
              LeaveTypeID: "personal",
              NumberOfUnits: 10,
              TypeOfUnits: "Days",
            },
          ],
        },
      ],
    });

    expect(balances).toEqual([
      {
        balance: 76,
        employeeId: "11111111-1111-4111-8111-111111111111",
        leaveTypeId: "annual",
        leaveTypeName: "Annual Leave",
        rawPayload: expect.objectContaining({ LeaveTypeID: "annual" }),
        unitType: "hours",
      },
      {
        balance: 10,
        employeeId: "11111111-1111-4111-8111-111111111111",
        leaveTypeId: "personal",
        leaveTypeName: "Personal Leave",
        rawPayload: expect.objectContaining({ LeaveTypeID: "personal" }),
        unitType: "days",
      },
    ]);
  });
});
