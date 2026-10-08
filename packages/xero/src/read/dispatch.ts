import { executeWithXeroAuthRecovery } from "../adapter/auth-recovery";
import type { XeroEmployeesFetchResult } from "../au/read";
import {
  fetchEmployees as fetchAuEmployees,
  fetchLeaveApplicationStatus as fetchAuLeaveApplicationStatus,
  fetchLeaveBalances as fetchAuLeaveBalances,
  fetchLeaveRecords as fetchAuLeaveRecords,
} from "../au/read";
import {
  fetchEmployees as fetchNzEmployees,
  fetchLeaveApplicationStatus as fetchNzLeaveApplicationStatus,
  fetchLeaveBalancesForEmployee as fetchNzLeaveBalancesForEmployee,
  fetchLeaveForEmployee as fetchNzLeaveForEmployee,
} from "../nz/read";
import {
  fetchEmployees as fetchUkEmployees,
  fetchLeaveApplicationStatus as fetchUkLeaveApplicationStatus,
  fetchLeaveBalancesForEmployee as fetchUkLeaveBalancesForEmployee,
  fetchLeaveForEmployee as fetchUkLeaveForEmployee,
} from "../uk/read";
import type {
  PayrollRegion,
  XeroAccessContext,
  XeroWriteResult,
} from "../write/types";
import type {
  FetchLeaveApplicationStatusInput,
  XeroLeaveApplicationStatusResult,
} from "./leave-application-status";
import type {
  XeroLeaveBalance,
  XeroLeaveBalanceFetchFailure,
} from "./leave-balances";
import type {
  XeroLeaveRecord,
  XeroLeaveRecordsFetchResult,
} from "./leave-records";
export async function fetchLeaveApplicationStatusForRegion(
  payrollRegion: PayrollRegion | string,
  input: FetchLeaveApplicationStatusInput
): Promise<XeroWriteResult<XeroLeaveApplicationStatusResult>> {
  return await executeWithXeroAuthRecovery(
    input.xeroConnection,
    async (xeroConnection) => {
      const nextInput = { ...input, xeroConnection };
      switch (payrollRegion) {
        case "AU":
          return await fetchAuLeaveApplicationStatus(nextInput);
        case "NZ":
          return await fetchNzLeaveApplicationStatus(nextInput);
        case "UK":
          return await fetchUkLeaveApplicationStatus(nextInput);
        default:
          return unsupportedRegion();
      }
    }
  );
}
export async function fetchEmployeesForRegion(
  payrollRegion: PayrollRegion | string,
  input: {
    mode?: "full" | "incremental";
    modifiedSince?: Date | null;
    xeroConnection: XeroAccessContext;
  }
): Promise<XeroWriteResult<XeroEmployeesFetchResult>> {
  return await executeWithXeroAuthRecovery(
    input.xeroConnection,
    async (xeroConnection) => {
      switch (payrollRegion) {
        case "AU":
          return await fetchAuEmployees({ ...input, xeroConnection });
        case "NZ":
          return await fetchNzEmployees({ xeroConnection });
        case "UK":
          return await fetchUkEmployees({ xeroConnection });
        default:
          return unsupportedRegion();
      }
    }
  );
}
export async function fetchLeaveRecordsForRegion(
  payrollRegion: PayrollRegion | string,
  input: {
    mode?: "full" | "incremental";
    modifiedSince?: Date | null;
    xeroConnection: XeroAccessContext;
  }
): Promise<XeroWriteResult<XeroLeaveRecordsFetchResult>> {
  return await executeWithXeroAuthRecovery(
    input.xeroConnection,
    async (xeroConnection) => {
      switch (payrollRegion) {
        case "AU":
          return await fetchAuLeaveRecords({ ...input, xeroConnection });
        case "NZ":
          return unsupportedRegion(
            "NZ payroll requires per-employee leave reads."
          );
        case "UK":
          return unsupportedRegion(
            "UK payroll requires per-employee leave reads."
          );
        default:
          return unsupportedRegion();
      }
    }
  );
}
export async function fetchLeaveForEmployeeForRegion(
  payrollRegion: PayrollRegion | string,
  input: {
    xeroEmployeeId: string;
    xeroConnection: XeroAccessContext;
  }
): Promise<
  XeroWriteResult<{
    complete: boolean;
    leaveRecords: XeroLeaveRecord[];
    rawResponse: unknown;
  }>
> {
  return await executeWithXeroAuthRecovery(
    input.xeroConnection,
    async (xeroConnection) => {
      const nextInput = { ...input, xeroConnection };
      switch (payrollRegion) {
        case "NZ":
          return await fetchNzLeaveForEmployee(nextInput);
        case "UK":
          return await fetchUkLeaveForEmployee(nextInput);
        case "AU":
          return unsupportedRegion(
            "AU payroll does not support per-employee leave reads."
          );
        default:
          return unsupportedRegion();
      }
    }
  );
}
export async function fetchLeaveBalancesForRegion(
  payrollRegion: PayrollRegion | string,
  input: {
    employeeIds: string[];
    onProgress?: (processed: number, total: number) => Promise<void> | void;
    xeroConnection: XeroAccessContext;
  }
): Promise<
  XeroWriteResult<{
    failures: XeroLeaveBalanceFetchFailure[];
    leaveBalances: XeroLeaveBalance[];
    rawResponses: unknown[];
  }>
> {
  return await executeWithXeroAuthRecovery(
    input.xeroConnection,
    async (xeroConnection) => {
      const nextInput = { ...input, xeroConnection };
      switch (payrollRegion) {
        case "AU":
          return await fetchAuLeaveBalances(nextInput);
        case "NZ":
          return await fetchPerEmployeeLeaveBalances(
            input.employeeIds,
            fetchNzLeaveBalancesForEmployee,
            xeroConnection,
            input.onProgress
          );
        case "UK":
          return await fetchPerEmployeeLeaveBalances(
            input.employeeIds,
            fetchUkLeaveBalancesForEmployee,
            xeroConnection,
            input.onProgress
          );
        default:
          return unsupportedRegion();
      }
    }
  );
}
function unsupportedRegion(
  message = "Unsupported payroll region."
): XeroWriteResult<never> {
  return { error: { code: "unknown_error", message }, ok: false };
}
async function fetchPerEmployeeLeaveBalances(
  employeeIds: string[],
  fetchFn: (input: {
    xeroEmployeeId: string;
    xeroConnection: XeroAccessContext;
  }) => Promise<
    XeroWriteResult<{
      leaveBalances: XeroLeaveBalance[];
      rawResponse: unknown;
    }>
  >,
  xeroConnection: XeroAccessContext,
  onProgress?: (processed: number, total: number) => Promise<void> | void
): Promise<
  XeroWriteResult<{
    failures: XeroLeaveBalanceFetchFailure[];
    leaveBalances: XeroLeaveBalance[];
    rawResponses: unknown[];
  }>
> {
  const leaveBalances: XeroLeaveBalance[] = [];
  const rawResponses: unknown[] = [];
  const failures: XeroLeaveBalanceFetchFailure[] = [];
  for (const [index, employeeId] of employeeIds.entries()) {
    const result = await fetchFn({
      xeroConnection,
      xeroEmployeeId: employeeId,
    });
    if (!result.ok) {
      if (
        result.error.recoveryReason ||
        result.error.code === "auth_error" ||
        result.error.code === "rate_limit_error" ||
        result.error.code === "permission_error" ||
        result.error.code === "network_error"
      ) {
        return { error: result.error, ok: false };
      }
      failures.push({ employeeId, error: result.error });
      if (result.error.rawPayload !== undefined) {
        rawResponses.push(result.error.rawPayload);
      }
      await onProgress?.(index + 1, employeeIds.length);
      continue;
    }
    leaveBalances.push(...result.value.leaveBalances);
    rawResponses.push(result.value.rawResponse);
    await onProgress?.(index + 1, employeeIds.length);
  }
  return {
    ok: true,
    value: {
      failures,
      leaveBalances,
      rawResponses,
    },
  };
}
