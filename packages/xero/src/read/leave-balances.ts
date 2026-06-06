import { z } from "zod";

export interface XeroLeaveBalance {
  balance: number;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string | null;
  rawPayload: unknown;
  unitType: "days" | "hours" | null;
}

const LeaveBalanceSchema = z
  .object({
    LeaveName: z.string().optional().nullable(),
    LeaveTypeID: z.string().optional().nullable(),
    LeaveTypeId: z.string().optional().nullable(),
    NumberOfUnits: z.number().optional().nullable(),
    TypeOfUnits: z.string().optional().nullable(),
  })
  .passthrough();

const EmployeeWithLeaveBalancesSchema = z
  .object({
    EmployeeID: z.string().optional().nullable(),
    EmployeeId: z.string().optional().nullable(),
    LeaveBalances: z.array(LeaveBalanceSchema).optional().nullable(),
  })
  .passthrough();

const EmployeesResponseSchema = z
  .object({
    Employees: z.array(EmployeeWithLeaveBalancesSchema),
  })
  .passthrough();

export function mapXeroLeaveBalances(payload: unknown): XeroLeaveBalance[] {
  const parsed = EmployeesResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.Employees.flatMap((employee) => {
    const employeeId = text(employee.EmployeeID ?? employee.EmployeeId);
    return (employee.LeaveBalances ?? []).map((balance) => ({
      balance: balance.NumberOfUnits ?? 0,
      employeeId,
      leaveTypeId: text(balance.LeaveTypeID ?? balance.LeaveTypeId),
      leaveTypeName: nullableText(balance.LeaveName),
      rawPayload: balance,
      unitType: normaliseUnitType(balance.TypeOfUnits),
    }));
  });
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: string | null | undefined): string | null {
  const normalised = text(value);
  return normalised.length > 0 ? normalised : null;
}

function normaliseUnitType(
  value: string | null | undefined
): "days" | "hours" | null {
  const normalised = text(value).toLowerCase();
  if (normalised === "day" || normalised === "days") {
    return "days";
  }
  if (normalised === "hour" || normalised === "hours") {
    return "hours";
  }
  return null;
}
