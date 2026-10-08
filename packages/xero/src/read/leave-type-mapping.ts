import type { availability_record_type } from "@repo/database/generated/enums";

export type XeroPayrollRegion = "AU" | "NZ" | "UK";

export type XeroLeaveTypeMapping =
  | {
      mapped: true;
      recordType: availability_record_type;
    }
  | {
      leaveTypeName: string | null;
      mapped: false;
      payrollRegion: XeroPayrollRegion;
      recordType: "leave";
    };

export function mapXeroLeaveType(input: {
  leaveTypeName: string | null;
  payrollRegion: XeroPayrollRegion;
}): XeroLeaveTypeMapping {
  const value = input.leaveTypeName?.trim().toLowerCase() ?? "";
  const recordType = knownRecordType(value);
  if (recordType) {
    return { mapped: true, recordType };
  }
  return {
    leaveTypeName: input.leaveTypeName,
    mapped: false,
    payrollRegion: input.payrollRegion,
    recordType: "leave",
  };
}

export function deriveXeroStableSourceKey(input: {
  employeeId: string;
  endsAt: Date;
  leaveTypeId: string;
  startsAt: Date;
  units: number;
  connectionId: string;
}): string {
  return [
    input.connectionId,
    input.employeeId,
    input.leaveTypeId,
    input.startsAt.toISOString(),
    input.endsAt.toISOString(),
    normaliseUnits(input.units),
  ].join("|");
}

function knownRecordType(value: string): availability_record_type | null {
  if (value.includes("annual")) {
    return "annual_leave";
  }
  if (value.includes("personal")) {
    return "personal_leave";
  }
  if (value.includes("sick")) {
    return "sick_leave";
  }
  if (value.includes("long service")) {
    return "long_service_leave";
  }
  if (value.includes("unpaid")) {
    return "unpaid_leave";
  }
  if (value.includes("community service")) {
    return "leave";
  }
  if (value.includes("holiday")) {
    return "holiday";
  }
  return null;
}

function normaliseUnits(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}
