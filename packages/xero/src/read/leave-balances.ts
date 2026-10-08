import { z } from "zod";
import type { XeroWriteError } from "../write/types";

export interface XeroLeaveBalance {
  balance: number;
  currencyCode: string | null;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string | null;
  rawPayload: unknown;
  unitType: "currency" | "days" | "hours" | null;
}

export interface XeroLeaveBalanceFetchFailure {
  employeeId: string;
  error: XeroWriteError;
}

// Supported ISO 4217 currency codes for monetary leave balances (e.g. NZ Payroll
// Holiday Pay in dollars). Deliberately an explicit allowlist, not a regex that
// pretends to validate all of ISO 4217: extend only alongside a documented
// provider mapping (see packages/database/prisma/schema.prisma comment on
// leave_balances.currency_code).
export const SupportedCurrencyCodeSchema = z.enum(["NZD"]);
export type SupportedCurrencyCode = z.infer<typeof SupportedCurrencyCodeSchema>;

export function isSupportedCurrencyCode(
  value: unknown
): value is SupportedCurrencyCode {
  return SupportedCurrencyCodeSchema.safeParse(value).success;
}

// Generic JSON-safe value schema used to validate that a raw Xero leave balance
// payload can be persisted into the leave_balances.source_payload_json jsonb
// column via Prisma. Xero balances are already parsed from an HTTP JSON
// response, so this validation is a defensive, explicit guarantee rather than a
// transformation.
const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>;
export type LeaveBalanceRawPayload =
  | JsonPrimitive
  | LeaveBalanceRawPayload[]
  | { [key: string]: LeaveBalanceRawPayload };

export const LeaveBalanceRawPayloadSchema: z.ZodType<LeaveBalanceRawPayload> =
  z.lazy(() =>
    z.union([
      JsonPrimitiveSchema,
      z.array(LeaveBalanceRawPayloadSchema),
      z.record(z.string(), LeaveBalanceRawPayloadSchema),
    ])
  );

// Validates a raw Xero payload against LeaveBalanceRawPayloadSchema and returns
// a Prisma-safe JSON value, or null when the payload cannot be represented as
// JSON (defensive fallback; a well-formed HTTP JSON response always succeeds).
export function toValidatedLeaveBalanceRawPayload(
  value: unknown
): LeaveBalanceRawPayload | null {
  const parsed = LeaveBalanceRawPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const LeaveBalanceSchema = z
  .object({
    CurrencyCode: z.string().optional().nullable(),
    LeaveName: z.string().optional().nullable(),
    LeaveTypeID: z.string().optional().nullable(),
    LeaveTypeId: z.string().optional().nullable(),
    NumberOfUnits: z.number(),
    TypeOfUnits: z.string().optional().nullable(),
  })
  .passthrough();

const EmployeeWithLeaveBalancesSchema = z
  .object({
    EmployeeID: z.string().optional().nullable(),
    EmployeeId: z.string().optional().nullable(),
    LeaveBalances: z.array(LeaveBalanceSchema),
  })
  .passthrough()
  .refine(
    (employee) => text(employee.EmployeeID ?? employee.EmployeeId).length > 0,
    {
      message: "Employee balance detail requires an Employee ID",
    }
  );

const EmployeesResponseSchema = z
  .object({
    Employees: z.array(EmployeeWithLeaveBalancesSchema).min(1),
  })
  .passthrough();

export function mapXeroLeaveBalances(payload: unknown): XeroLeaveBalance[] {
  const parsed = EmployeesResponseSchema.parse(payload);

  return parsed.Employees.flatMap((employee) => {
    const employeeId = text(employee.EmployeeID ?? employee.EmployeeId);
    return employee.LeaveBalances.map((balance) => {
      const unitType = normaliseUnitType(balance.TypeOfUnits);
      return {
        balance: balance.NumberOfUnits,
        currencyCode:
          unitType === "currency"
            ? nullableUppercaseText(balance.CurrencyCode)
            : null,
        employeeId,
        leaveTypeId: text(balance.LeaveTypeID ?? balance.LeaveTypeId),
        leaveTypeName: nullableText(balance.LeaveName),
        rawPayload: balance,
        unitType,
      };
    });
  });
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: string | null | undefined): string | null {
  const normalised = text(value);
  return normalised.length > 0 ? normalised : null;
}

function nullableUppercaseText(
  value: string | null | undefined
): string | null {
  const normalised = nullableText(value);
  return normalised ? normalised.toUpperCase() : null;
}

function normaliseUnitType(
  value: string | null | undefined
): "currency" | "days" | "hours" | null {
  const normalised = text(value).toLowerCase();
  if (normalised === "day" || normalised === "days") {
    return "days";
  }
  if (normalised === "hour" || normalised === "hours") {
    return "hours";
  }
  if (
    normalised === "dollar" ||
    normalised === "dollars" ||
    normalised === "currency"
  ) {
    return "currency";
  }
  return null;
}
