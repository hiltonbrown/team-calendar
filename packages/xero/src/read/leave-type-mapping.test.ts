import { describe, expect, it } from "vitest";
import {
  deriveXeroStableSourceKey,
  mapXeroLeaveType,
  type XeroPayrollRegion,
} from "./leave-type-mapping";

const knownTypes = [
  ["Annual Leave", "annual_leave"],
  ["Personal/Carer's Leave", "personal_leave"],
  ["Sick Leave", "sick_leave"],
  ["Long Service Leave", "long_service_leave"],
  ["Unpaid Leave", "unpaid_leave"],
  ["Community Service Leave", "leave"],
  ["Public Holiday", "holiday"],
] as const;

describe("Xero leave-type mapping", () => {
  it.each(["AU", "NZ", "UK"] as const)(
    "maps every known canonical leave type for %s payroll",
    (payrollRegion) => {
      for (const [leaveTypeName, recordType] of knownTypes) {
        expect(mapXeroLeaveType({ leaveTypeName, payrollRegion })).toEqual({
          mapped: true,
          recordType,
        });
      }
    }
  );

  it.each(["AU", "NZ", "UK"] as const)(
    "flags an unmapped %s leave type without silently defaulting it",
    (payrollRegion: XeroPayrollRegion) => {
      expect(
        mapXeroLeaveType({
          leaveTypeName: "Custom Purchased Leave",
          payrollRegion,
        })
      ).toEqual({
        leaveTypeName: "Custom Purchased Leave",
        mapped: false,
        payrollRegion,
        recordType: "leave",
      });
    }
  );

  it("keeps the stable source key deterministic", () => {
    const input = {
      connectionId: "30000000-0000-4000-8000-000000000003",
      employeeId: "11111111-1111-4111-8111-111111111111",
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      leaveTypeId: "annual",
      startsAt: new Date("2026-05-07T00:00:00.000Z"),
      units: 15.2,
    };

    expect(deriveXeroStableSourceKey(input)).toBe(
      deriveXeroStableSourceKey(input)
    );
    expect(deriveXeroStableSourceKey(input)).toBe(
      "30000000-0000-4000-8000-000000000003|11111111-1111-4111-8111-111111111111|annual|2026-05-07T00:00:00.000Z|2026-05-08T00:00:00.000Z|15.2000"
    );
  });
});
