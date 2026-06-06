import { keys } from "../../keys";
import { decryptXeroToken } from "../crypto/tokens";
import type { XeroEmployee } from "../read/employees";
import { mapXeroEmployees } from "../read/employees";
import {
  type FetchLeaveApplicationStatusInput,
  mapLeaveApplicationStatus,
  mapXeroReadHttpError,
  readXeroPayload,
  type XeroLeaveApplicationStatusResult,
} from "../read/leave-application-status";
import type { XeroLeaveBalance } from "../read/leave-balances";
import { mapXeroLeaveBalances } from "../read/leave-balances";
import type { XeroLeaveRecord } from "../read/leave-records";
import { mapXeroLeaveRecords } from "../read/leave-records";
import type {
  XeroTenantForWrite,
  XeroWriteError,
  XeroWriteResult,
} from "../write/types";

const XERO_DEFAULT_BASE_URL = "https://api.xero.com";

// Xero permits 60 calls/min per connected organisation. Space the per-employee
// detail reads at least this far apart so a full balance sync stays within that
// ceiling instead of bursting into a 429 partway through.
const XERO_CALLS_PER_MINUTE = 60;
const LEAVE_BALANCE_READ_INTERVAL_MS = Math.ceil(
  60_000 / XERO_CALLS_PER_MINUTE
);

export interface XeroLeaveBalanceFetchFailure {
  employeeId: string;
  error: XeroWriteError;
}

export async function fetchEmployees(input: {
  xeroTenant: XeroTenantForWrite;
}): Promise<
  XeroWriteResult<{ rawResponse: unknown; employees: XeroEmployee[] }>
> {
  const accessToken = input.xeroTenant.xero_connection.access_token_encrypted;
  const decryptedAccessToken = decryptXeroToken({
    authTag: input.xeroTenant.xero_connection.access_token_auth_tag ?? null,
    encrypted: accessToken,
    iv: input.xeroTenant.xero_connection.access_token_iv ?? null,
  });

  if (!decryptedAccessToken || input.xeroTenant.xero_connection.revoked_at) {
    return {
      ok: false,
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
      },
    };
  }

  try {
    const response = await fetch(`${baseUrl()}/payroll.xro/1.0/Employees`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${decryptedAccessToken}`,
        "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
      },
      method: "GET",
    });
    const rawPayload = await readXeroPayload(response);

    if (!response.ok) {
      return {
        ok: false,
        error: mapXeroReadHttpError(response, rawPayload),
      };
    }

    return {
      ok: true,
      value: {
        rawResponse: rawPayload,
        employees: mapXeroEmployees(rawPayload),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message:
          error instanceof Error ? error.message : "Failed to reach Xero.",
      },
    };
  }
}

export async function fetchLeaveRecords(input: {
  xeroTenant: XeroTenantForWrite;
}): Promise<
  XeroWriteResult<{ leaveRecords: XeroLeaveRecord[]; rawResponse: unknown }>
> {
  const accessToken = input.xeroTenant.xero_connection.access_token_encrypted;
  const decryptedAccessToken = decryptXeroToken({
    authTag: input.xeroTenant.xero_connection.access_token_auth_tag ?? null,
    encrypted: accessToken,
    iv: input.xeroTenant.xero_connection.access_token_iv ?? null,
  });

  if (!decryptedAccessToken || input.xeroTenant.xero_connection.revoked_at) {
    return {
      ok: false,
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
      },
    };
  }

  try {
    const response = await fetch(
      `${baseUrl()}/payroll.xro/1.0/LeaveApplications`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
        },
        method: "GET",
      }
    );
    const rawPayload = await readXeroPayload(response);

    if (!response.ok) {
      return {
        ok: false,
        error: mapXeroReadHttpError(response, rawPayload),
      };
    }

    return {
      ok: true,
      value: {
        leaveRecords: mapXeroLeaveRecords(rawPayload),
        rawResponse: rawPayload,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message:
          error instanceof Error ? error.message : "Failed to reach Xero.",
      },
    };
  }
}

export async function fetchLeaveBalances(input: {
  employeeIds: string[];
  // Override the per-request pacing. Defaults to the Xero rate-limit interval;
  // tests pass 0 to run without the real-time delay.
  readIntervalMs?: number;
  xeroTenant: XeroTenantForWrite;
}): Promise<
  XeroWriteResult<{
    failures: XeroLeaveBalanceFetchFailure[];
    leaveBalances: XeroLeaveBalance[];
    rawResponses: unknown[];
  }>
> {
  const accessToken = input.xeroTenant.xero_connection.access_token_encrypted;
  const decryptedAccessToken = decryptXeroToken({
    authTag: input.xeroTenant.xero_connection.access_token_auth_tag ?? null,
    encrypted: accessToken,
    iv: input.xeroTenant.xero_connection.access_token_iv ?? null,
  });

  if (!decryptedAccessToken || input.xeroTenant.xero_connection.revoked_at) {
    return {
      ok: false,
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
      },
    };
  }

  const intervalMs = input.readIntervalMs ?? LEAVE_BALANCE_READ_INTERVAL_MS;
  const leaveBalances: XeroLeaveBalance[] = [];
  const rawResponses: unknown[] = [];
  const failures: XeroLeaveBalanceFetchFailure[] = [];

  for (const [index, employeeId] of input.employeeIds.entries()) {
    if (index > 0 && intervalMs > 0) {
      await sleep(intervalMs);
    }

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl()}/payroll.xro/1.0/Employees/${encodeURIComponent(employeeId)}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${decryptedAccessToken}`,
            "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
          },
          method: "GET",
        }
      );
    } catch (error) {
      // A transport failure is environmental rather than employee-specific, so
      // abort and let the run retry instead of flagging every employee.
      return {
        ok: false,
        error: {
          code: "network_error",
          message:
            error instanceof Error ? error.message : "Failed to reach Xero.",
        },
      };
    }

    const rawPayload = await readXeroPayload(response);
    rawResponses.push(rawPayload);

    if (!response.ok) {
      const mappedError = mapXeroReadHttpError(response, rawPayload);
      // Auth and rate-limit failures affect every subsequent call, so stop and
      // let the handler fail the run. Other errors (e.g. an employee removed
      // from Xero returning 404) are isolated so the rest still sync.
      if (
        mappedError.code === "auth_error" ||
        mappedError.code === "rate_limit_error"
      ) {
        return { ok: false, error: mappedError };
      }
      failures.push({ employeeId, error: mappedError });
      continue;
    }

    leaveBalances.push(...mapXeroLeaveBalances(rawPayload));
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

export async function fetchLeaveApplicationStatus(
  input: FetchLeaveApplicationStatusInput
): Promise<XeroWriteResult<XeroLeaveApplicationStatusResult>> {
  const accessToken = input.xeroTenant.xero_connection.access_token_encrypted;
  const decryptedAccessToken = decryptXeroToken({
    authTag: input.xeroTenant.xero_connection.access_token_auth_tag ?? null,
    encrypted: accessToken,
    iv: input.xeroTenant.xero_connection.access_token_iv ?? null,
  });

  if (!decryptedAccessToken || input.xeroTenant.xero_connection.revoked_at) {
    return {
      ok: false,
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
      },
    };
  }

  try {
    const response = await fetch(
      `${baseUrl()}/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(
        input.xeroLeaveApplicationId
      )}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
        },
        method: "GET",
      }
    );
    const rawPayload = await readXeroPayload(response);

    if (!response.ok) {
      return {
        ok: false,
        error: mapXeroReadHttpError(response, rawPayload),
      };
    }

    return { ok: true, value: mapLeaveApplicationStatus(rawPayload) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "network_error",
        message:
          error instanceof Error ? error.message : "Failed to reach Xero.",
      },
    };
  }
}

function baseUrl(): string {
  return keys().XERO_API_BASE_URL ?? XERO_DEFAULT_BASE_URL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
