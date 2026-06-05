import { z } from "zod";

export type XeroLeaveRecordStatus =
  | "APPROVED"
  | "DELETED"
  | "REJECTED"
  | "SUBMITTED"
  | "UNKNOWN"
  | "WITHDRAWN";

export interface XeroLeaveRecord {
  employeeId: string;
  endDate: string;
  leaveApplicationId: string;
  leaveTypeId: string;
  leaveTypeName: string | null;
  rawPayload: unknown;
  startDate: string;
  status: XeroLeaveRecordStatus;
  title: string | null;
  units: number;
  updatedDateUtc: string | null;
}

const LeavePeriodSchema = z
  .object({
    NumberOfUnits: z.number().optional().nullable(),
  })
  .passthrough();

const LeaveApplicationSchema = z
  .object({
    EmployeeID: z.string().optional().nullable(),
    EmployeeId: z.string().optional().nullable(),
    EndDate: z.string().optional().nullable(),
    LeaveApplicationID: z.string().optional().nullable(),
    LeaveApplicationId: z.string().optional().nullable(),
    LeavePeriods: z.array(LeavePeriodSchema).optional().nullable(),
    LeaveType: z.string().optional().nullable(),
    LeaveTypeID: z.string().optional().nullable(),
    LeaveTypeId: z.string().optional().nullable(),
    StartDate: z.string().optional().nullable(),
    Status: z.string().optional().nullable(),
    Title: z.string().optional().nullable(),
    UpdatedDateUTC: z.string().optional().nullable(),
    UpdatedDateUtc: z.string().optional().nullable(),
  })
  .passthrough();

const LeaveApplicationsResponseSchema = z
  .object({
    LeaveApplications: z.array(LeaveApplicationSchema),
  })
  .passthrough();

export function mapXeroLeaveRecords(payload: unknown): XeroLeaveRecord[] {
  const parsed = LeaveApplicationsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.LeaveApplications.map((application) => ({
    employeeId: text(application.EmployeeID ?? application.EmployeeId),
    endDate: text(application.EndDate),
    leaveApplicationId: text(
      application.LeaveApplicationID ?? application.LeaveApplicationId
    ),
    leaveTypeId: text(application.LeaveTypeID ?? application.LeaveTypeId),
    leaveTypeName: nullableText(application.LeaveType),
    rawPayload: application,
    startDate: text(application.StartDate),
    status: normaliseStatus(application.Status),
    title: nullableText(application.Title),
    units: sumUnits(application.LeavePeriods ?? []),
    updatedDateUtc: nullableText(
      application.UpdatedDateUTC ?? application.UpdatedDateUtc
    ),
  }));
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: string | null | undefined): string | null {
  const normalised = text(value);
  return normalised.length > 0 ? normalised : null;
}

function normaliseStatus(
  value: string | null | undefined
): XeroLeaveRecordStatus {
  const status = value?.trim().toUpperCase();
  if (status === "APPROVED" || status === "SCHEDULED") {
    return "APPROVED";
  }
  if (status === "REJECTED" || status === "DECLINED") {
    return "REJECTED";
  }
  if (status === "WITHDRAWN") {
    return "WITHDRAWN";
  }
  if (status === "DELETED") {
    return "DELETED";
  }
  if (status === "SUBMITTED" || status === "PENDING") {
    return "SUBMITTED";
  }
  return "UNKNOWN";
}

function sumUnits(periods: Array<{ NumberOfUnits?: null | number }>): number {
  return periods.reduce(
    (total, period) => total + (period.NumberOfUnits ?? 0),
    0
  );
}
