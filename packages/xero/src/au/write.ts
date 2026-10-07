import type {
  PrepareLeaveMutationInput,
  ProviderMutationRequest,
  XeroMutationIdentity,
} from "@repo/core";
import { z } from "zod";
import { keys } from "../../keys";
import {
  classifyXeroHttpFailure,
  mapXeroTransportError,
} from "../adapter/classify-xero-failure";
import { xeroFetch } from "../rate-limit/xero-fetch";
import type {
  ApproveLeaveApplicationInput,
  DeclineLeaveApplicationInput,
  SubmitLeaveApplicationInput,
  WithdrawLeaveApplicationInput,
  XeroAccessContext,
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
            LeaveApplicationID: z.string().trim().min(1).optional(),
            LeaveApplicationId: z.string().trim().min(1).optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();
export async function submitLeaveApplication(
  input: SubmitLeaveApplicationInput
): Promise<
  XeroWriteResult<{
    rawResponse: unknown;
    xeroLeaveApplicationId: string;
  }>
> {
  const payload = [
    {
      EmployeeID: input.xeroEmployeeId,
      EndDate: dateOnly(input.endsAt),
      LeaveTypeID: input.xeroLeaveTypeId,
      StartDate: dateOnly(input.startsAt),
      Title: input.title ?? "Leave request",
    },
  ];
  const response = await xeroRequest(
    input.xeroConnection,
    {
      body: payload,
      method: "POST",
      path: "/payroll.xro/1.0/LeaveApplications",
    },
    input.mutation
  );
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
      error: {
        code: "unknown_error",
        dispatchPhase: "after_dispatch",
        message: "Xero did not return a leave application ID.",
        rawPayload: response.value,
        recoveryReason: "outcome_unknown",
      },
      ok: false,
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
): Promise<
  XeroWriteResult<{
    rawResponse: unknown;
  }>
> {
  const response = await xeroRequest(
    input.xeroConnection,
    {
      method: "POST",
      path: `/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(input.xeroLeaveApplicationId)}/approve`,
    },
    input.mutation
  );
  return response.ok
    ? { ok: true, value: { rawResponse: response.value } }
    : response;
}
export async function declineLeaveApplication(
  input: DeclineLeaveApplicationInput
): Promise<
  XeroWriteResult<{
    rawResponse: unknown;
  }>
> {
  const response = await xeroRequest(
    input.xeroConnection,
    {
      body: {
        Reason: input.reason,
      },
      method: "POST",
      path: `/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(input.xeroLeaveApplicationId)}/reject`,
    },
    input.mutation
  );
  return response.ok
    ? { ok: true, value: { rawResponse: response.value } }
    : response;
}
export async function withdrawLeaveApplication(
  input: WithdrawLeaveApplicationInput
): Promise<
  XeroWriteResult<{
    rawResponse: unknown;
  }>
> {
  const response = await xeroRequest(
    input.xeroConnection,
    {
      body: {
        Reason: "Withdrawn by employee in Team Calendar.",
      },
      method: "POST",
      path: `/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(input.xeroLeaveApplicationId)}/reject`,
    },
    input.mutation
  );
  return response.ok
    ? { ok: true, value: { rawResponse: response.value } }
    : response;
}
async function xeroRequest(
  xeroConnection: XeroAccessContext,
  request: {
    body?: unknown;
    method: "POST" | "PUT";
    path: string;
  },
  mutation?: XeroMutationIdentity
): Promise<XeroWriteResult<unknown>> {
  if (!mutation) {
    return {
      error: {
        code: "validation_error",
        dispatchPhase: "before_dispatch",
        message:
          "A recorded mutation identity is required for Xero payroll writes.",
      },
      ok: false,
    };
  }
  if (!xeroConnection.accessToken) {
    return {
      error: {
        code: "unknown_error",
        dispatchPhase: "before_dispatch",
        message: "Xero access is unavailable.",
        recoveryReason: "operational_incident",
      },
      ok: false,
    };
  }
  const descriptor: ProviderMutationRequest = {
    body: request.body === undefined ? null : JSON.stringify(request.body),
    method: request.method,
    url: `${baseUrl()}${request.path}`,
    xeroTenantId: xeroConnection.xero_tenant_id,
  };
  if (!sameMutationRequest(mutation.request, descriptor)) {
    return {
      error: {
        code: "validation_error",
        dispatchPhase: "before_dispatch",
        message: "The recorded Xero mutation request has changed.",
        recoveryReason: "outcome_unknown",
      },
      ok: false,
    };
  }
  const frozen = mutation.request;
  try {
    const response = await xeroFetch({
      attemptBudget: xeroConnection.mutationAttemptBudget,
      deadline: xeroConnection.deadline,
      init: {
        body: frozen.body ?? undefined,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${xeroConnection.accessToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": mutation.idempotencyKey,
          "Xero-Tenant-Id": frozen.xeroTenantId,
        },
        method: frozen.method,
      },
      maxAttempts: 4,
      mutation,
      rateClass: {
        kind: "tenant",
        providerAppId: keys().XERO_CLIENT_ID ?? "",
        xeroTenantId: xeroConnection.xero_tenant_id,
      },
      retryOnAmbiguousFailure: true,
      url: frozen.url,
    });
    const rawPayload = await readPayload(response);
    if (!response.ok) {
      return {
        error: mapHttpError(response, rawPayload),
        ok: false,
      };
    }
    const parsed = LeaveApplicationResponseSchema.safeParse(rawPayload);
    const application = parsed.success
      ? parsed.data.LeaveApplications?.[0]
      : undefined;
    if (!(application?.LeaveApplicationID || application?.LeaveApplicationId)) {
      return {
        error: {
          code: "unknown_error",
          dispatchPhase: "after_dispatch",
          message: "Xero response could not be confirmed.",
          rawPayload,
          recoveryReason: "outcome_unknown",
        },
        ok: false,
      };
    }
    return { ok: true, value: rawPayload };
  } catch (error) {
    return {
      error: mapXeroTransportError(error, true),
      ok: false,
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
  const classified = classifyXeroHttpFailure(response, true);
  if (classified.code) {
    return { ...details, ...classified, code: classified.code };
  }
  if (response.status === 400) {
    return { ...details, code: "validation_error" };
  }
  if (response.status === 401) {
    return { ...details, code: "auth_error" };
  }
  if (response.status === 403) {
    return { ...details, code: "permission_error" };
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

function sameMutationRequest(
  left: ProviderMutationRequest,
  right: ProviderMutationRequest
): boolean {
  return (
    left.body === right.body &&
    left.method === right.method &&
    left.url === right.url &&
    left.xeroTenantId === right.xeroTenantId
  );
}

export function prepareAuLeaveMutation(
  input: PrepareLeaveMutationInput,
  xeroTenantId: string
): XeroWriteResult<ProviderMutationRequest> {
  let body: unknown;
  let path: string;
  if (input.action === "create") {
    if (!(input.startsAt && input.endsAt && input.leaveTypeId)) {
      return {
        error: {
          code: "validation_error",
          dispatchPhase: "before_dispatch",
          message: "Leave dates and type are required.",
        },
        ok: false,
      };
    }
    path = "/payroll.xro/1.0/LeaveApplications";
    body = [
      {
        EmployeeID: input.employeeId,
        EndDate: dateOnly(input.endsAt),
        LeaveTypeID: input.leaveTypeId,
        StartDate: dateOnly(input.startsAt),
        Title: input.title ?? "Leave request",
      },
    ];
  } else {
    if (!input.remoteId || (input.action === "decline" && !input.reason)) {
      return {
        error: {
          code: "validation_error",
          dispatchPhase: "before_dispatch",
          message: "Remote leave ID and decline reason are required.",
        },
        ok: false,
      };
    }
    const transition = input.action === "approve" ? "approve" : "reject";
    path = `/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(input.remoteId)}/${transition}`;
    if (input.action !== "approve") {
      body = {
        Reason:
          input.action === "withdraw"
            ? "Withdrawn by employee in Team Calendar."
            : input.reason,
      };
    }
  }
  return {
    ok: true,
    value: {
      body: body === undefined ? null : JSON.stringify(body),
      method: "POST",
      url: `${baseUrl()}${path}`,
      xeroTenantId,
    },
  };
}
