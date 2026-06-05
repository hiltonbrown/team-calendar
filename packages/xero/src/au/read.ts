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
import type { XeroLeaveRecord } from "../read/leave-records";
import { mapXeroLeaveRecords } from "../read/leave-records";
import type { XeroTenantForWrite, XeroWriteResult } from "../write/types";

const XERO_DEFAULT_BASE_URL = "https://api.xero.com";

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
