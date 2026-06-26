import { z } from "zod";
import { keys } from "../../keys";
import { decryptXeroToken } from "../crypto/tokens";
import { orgRateLimitKey, xeroFetch } from "../rate-limit/xero-fetch";
import type {
  ApproveLeaveApplicationInput,
  DeclineLeaveApplicationInput,
  SubmitLeaveApplicationInput,
  WithdrawLeaveApplicationInput,
  XeroTenantForWrite,
  XeroWriteError,
  XeroWriteResult,
} from "../write/types";

const XERO_DEFAULT_BASE_URL = "https://api.xero.com";

const LeaveApplicationResponseSchema = z
  .object({
    LeaveApplications: z
      .array(
        z
          .object({
            LeaveApplicationID: z.string().optional(),
            LeaveApplicationId: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

export async function submitLeaveApplication(
  input: SubmitLeaveApplicationInput
): Promise<
  XeroWriteResult<{ rawResponse: unknown; xeroLeaveApplicationId: string }>
> {
  const payload = {
    LeaveApplications: [
      {
        EmployeeID: input.xeroEmployeeId,
        EndDate: dateOnly(input.endsAt),
        LeavePeriods: [
          {
            NumberOfUnits: input.units,
          },
        ],
        LeaveTypeID: input.xeroLeaveTypeId,
        StartDate: dateOnly(input.startsAt),
        Title: input.title ?? "Leave request",
      },
    ],
  };

  const response = await xeroRequest(input.xeroTenant, {
    body: payload,
    method: "POST",
    path: "/payroll.xro/1.0/LeaveApplications",
  });

  if (!response.ok) {
    return response;
  }

  const parsed = LeaveApplicationResponseSchema.safeParse(response.value);
  const xeroLeaveApplicationId = parsed.success
    ? (parsed.data.LeaveApplications?.[0]?.LeaveApplicationID ??
      parsed.data.LeaveApplications?.[0]?.LeaveApplicationId)
    : null;

  if (!xeroLeaveApplicationId) {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Xero did not return a leave application ID.",
        rawPayload: response.value,
      },
    };
  }

  return {
    ok: true,
    value: {
      rawResponse: response.value,
      xeroLeaveApplicationId,
    },
  };
}

export async function approveLeaveApplication(
  input: ApproveLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  const response = await xeroRequest(input.xeroTenant, {
    method: "POST",
    path: `/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(
      input.xeroLeaveApplicationId
    )}/approve`,
  });

  return response.ok
    ? { ok: true, value: { rawResponse: response.value } }
    : response;
}

export async function declineLeaveApplication(
  input: DeclineLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  const response = await xeroRequest(input.xeroTenant, {
    body: {
      Reason: input.reason,
    },
    method: "POST",
    path: `/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(
      input.xeroLeaveApplicationId
    )}/reject`,
  });

  return response.ok
    ? { ok: true, value: { rawResponse: response.value } }
    : response;
}

export async function withdrawLeaveApplication(
  input: WithdrawLeaveApplicationInput
): Promise<XeroWriteResult<{ rawResponse: unknown }>> {
  const response = await xeroRequest(input.xeroTenant, {
    body: {
      Reason: "Withdrawn by employee in Team Calendar.",
    },
    method: "POST",
    path: `/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(
      input.xeroLeaveApplicationId
    )}/reject`,
  });

  return response.ok
    ? { ok: true, value: { rawResponse: response.value } }
    : response;
}

async function xeroRequest(
  xeroTenant: XeroTenantForWrite,
  request: {
    body?: unknown;
    method: "POST" | "PUT";
    path: string;
  }
): Promise<XeroWriteResult<unknown>> {
  const accessToken = xeroTenant.xero_connection.access_token_encrypted;
  const decryptedAccessToken = decryptXeroToken({
    authTag: xeroTenant.xero_connection.access_token_auth_tag ?? null,
    encrypted: accessToken,
    iv: xeroTenant.xero_connection.access_token_iv ?? null,
  });

  if (!decryptedAccessToken || xeroTenant.xero_connection.revoked_at) {
    return {
      ok: false,
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
      },
    };
  }

  try {
    const response = await xeroFetch({
      init: {
        body: request.body ? JSON.stringify(request.body) : undefined,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Content-Type": "application/json",
          "Xero-Tenant-Id": xeroTenant.xero_tenant_id,
        },
        method: request.method,
      },
      orgKey: orgRateLimitKey({
        clerkOrgId: xeroTenant.clerk_org_id,
        organisationId: xeroTenant.organisation_id,
      }),
      url: `${baseUrl()}${request.path}`,
    });
    const rawPayload = await readPayload(response);

    if (!response.ok) {
      return {
        ok: false,
        error: mapHttpError(response, rawPayload),
      };
    }

    return { ok: true, value: rawPayload };
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

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapHttpError(response: Response, rawPayload: unknown): XeroWriteError {
  const details = {
    correlationId: response.headers.get("xero-correlation-id") ?? undefined,
    httpStatus: response.status,
    message: messageFromPayload(rawPayload) ?? response.statusText,
    rawPayload,
  };

  if (response.status === 400) {
    return { ...details, code: "validation_error" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ...details, code: "auth_error" };
  }
  if (response.status === 404) {
    return { ...details, code: "not_found_error" };
  }
  if (response.status === 409) {
    return { ...details, code: "conflict_error" };
  }
  if (response.status === 429) {
    return { ...details, code: "rate_limit_error" };
  }
  return { ...details, code: "unknown_error" };
}

function messageFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if ("Message" in payload && typeof payload.Message === "string") {
    return payload.Message;
  }
  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return null;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function baseUrl(): string {
  return keys().XERO_API_BASE_URL ?? XERO_DEFAULT_BASE_URL;
}
