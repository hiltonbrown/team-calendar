import type { XeroLeaveBalanceFetchFailure } from "../au/read";
import {
  fetchEmployees as fetchAuEmployees,
  fetchLeaveApplicationStatus as fetchAuLeaveApplicationStatus,
  fetchLeaveBalances as fetchAuLeaveBalances,
  fetchLeaveRecords as fetchAuLeaveRecords,
} from "../au/read";
import { fetchLeaveApplicationStatus as fetchNzLeaveApplicationStatus } from "../nz/read";
import { fetchLeaveApplicationStatus as fetchUkLeaveApplicationStatus } from "../uk/read";
import type {
  PayrollRegion,
  XeroTenantForWrite,
  XeroWriteResult,
} from "../write/types";
import type { XeroEmployee } from "./employees";
import type {
  FetchLeaveApplicationStatusInput,
  XeroLeaveApplicationStatusResult,
} from "./leave-application-status";
import type { XeroLeaveBalance } from "./leave-balances";
import type { XeroLeaveRecord } from "./leave-records";

export async function fetchLeaveApplicationStatusForRegion(
  payrollRegion: PayrollRegion | string,
  input: FetchLeaveApplicationStatusInput
): Promise<XeroWriteResult<XeroLeaveApplicationStatusResult>> {
  switch (payrollRegion) {
    case "AU":
      return await fetchAuLeaveApplicationStatus(input);
    case "NZ":
      return await fetchNzLeaveApplicationStatus(input);
    case "UK":
      return await fetchUkLeaveApplicationStatus(input);
    default:
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "Unsupported payroll region.",
        },
      };
  }
}

export async function fetchEmployeesForRegion(
  payrollRegion: PayrollRegion | string,
  input: { xeroTenant: XeroTenantForWrite }
): Promise<
  XeroWriteResult<{ rawResponse: unknown; employees: XeroEmployee[] }>
> {
  switch (payrollRegion) {
    case "AU":
      return await fetchAuEmployees(input);
    case "NZ":
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "NZ payroll employee reads are not yet available.",
        },
      };
    case "UK":
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "UK payroll employee reads are not yet available.",
        },
      };
    default:
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "Unsupported payroll region.",
        },
      };
  }
}

export async function fetchLeaveRecordsForRegion(
  payrollRegion: PayrollRegion | string,
  input: { xeroTenant: XeroTenantForWrite }
): Promise<
  XeroWriteResult<{ leaveRecords: XeroLeaveRecord[]; rawResponse: unknown }>
> {
  switch (payrollRegion) {
    case "AU":
      return await fetchAuLeaveRecords(input);
    case "NZ":
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "NZ payroll leave reads are not yet available.",
        },
      };
    case "UK":
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "UK payroll leave reads are not yet available.",
        },
      };
    default:
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "Unsupported payroll region.",
        },
      };
  }
}

export async function fetchLeaveBalancesForRegion(
  payrollRegion: PayrollRegion | string,
  input: {
    employeeIds: string[];
    onProgress?: (processed: number, total: number) => Promise<void> | void;
    xeroTenant: XeroTenantForWrite;
  }
): Promise<
  XeroWriteResult<{
    failures: XeroLeaveBalanceFetchFailure[];
    leaveBalances: XeroLeaveBalance[];
    rawResponses: unknown[];
  }>
> {
  switch (payrollRegion) {
    case "AU":
      return await fetchAuLeaveBalances(input);
    case "NZ":
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "NZ payroll leave balance reads are not yet available.",
        },
      };
    case "UK":
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "UK payroll leave balance reads are not yet available.",
        },
      };
    default:
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: "Unsupported payroll region.",
        },
      };
  }
}
