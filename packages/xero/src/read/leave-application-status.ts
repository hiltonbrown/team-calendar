import { classifyXeroHttpFailure } from "../adapter/classify-xero-failure";
import type {
  XeroAccessContext,
  XeroWriteError,
  XeroWriteResult,
} from "../write/types";
import { normaliseXeroDateTime } from "./date";

export type XeroLeaveApplicationStatus =
  | "APPROVED"
  | "DELETED"
  | "REJECTED"
  | "SUBMITTED"
  | "UNKNOWN"
  | "WITHDRAWN";

export interface XeroLeaveApplicationStatusResult {
  approvedAt: Date | null;
  rawResponse: unknown;
  status: XeroLeaveApplicationStatus;
}

export interface FetchLeaveApplicationStatusInput {
  xeroConnection: XeroAccessContext;
  xeroEmployeeId?: string;
  xeroLeaveApplicationId: string;
}

export interface FetchNzLeaveApplicationStatusInput
  extends FetchLeaveApplicationStatusInput {
  xeroEmployeeId: string;
}

export interface FetchUkLeaveApplicationStatusInput
  extends FetchLeaveApplicationStatusInput {
  xeroEmployeeId: string;
}

export function mapLeaveApplicationStatus(
  payload: unknown
): XeroLeaveApplicationStatusResult {
  const application = firstLeaveApplication(payload);
  const rawStatus = extractRawStatus(application);
  const status = normaliseStatus(rawStatus);
  const approvedAtValue =
    readString(application, "ApprovedDate") ??
    readString(application, "approvedDate") ??
    readString(application, "UpdatedDateUTC") ??
    readString(application, "updatedDateUTC");

  return {
    approvedAt: approvedAtValue ? parseDate(approvedAtValue) : null,
    rawResponse: payload,
    status,
  };
}

export function unsupportedReadRegion(region: string): XeroWriteResult<never> {
  return {
    error: {
      code: "unknown_error",
      message: `${region} payroll approval-state reads are not yet available.`,
    },
    ok: false,
  };
}

export async function readXeroPayload(response: Response): Promise<unknown> {
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

export function mapXeroReadHttpError(
  response: Response,
  rawPayload: unknown
): XeroWriteError {
  const details = {
    correlationId: response.headers.get("xero-correlation-id") ?? undefined,
    httpStatus: response.status,
    message: messageFromPayload(rawPayload) ?? response.statusText,
    rawPayload,
  };

  const classified = classifyXeroHttpFailure(response, false);
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

function firstLeaveApplication(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const objectPayload = payload as Record<string, unknown>;
  const applications =
    objectPayload.LeaveApplications ??
    objectPayload.leaveApplications ??
    objectPayload.Leave ??
    objectPayload.leave;
  if (
    Array.isArray(applications) &&
    typeof applications[0] === "object" &&
    applications[0] !== null
  ) {
    return applications[0] as Record<string, unknown>;
  }
  if (
    applications &&
    typeof applications === "object" &&
    !Array.isArray(applications)
  ) {
    return applications as Record<string, unknown>;
  }
  return objectPayload;
}

function extractRawStatus(application: Record<string, unknown>): string | null {
  const direct =
    readString(application, "Status") ??
    readString(application, "status") ??
    readString(application, "LeaveApplicationStatus") ??
    readString(application, "leaveApplicationStatus") ??
    readString(application, "LeavePeriodStatus") ??
    readString(application, "leavePeriodStatus") ??
    readString(application, "PeriodStatus") ??
    readString(application, "periodStatus");
  if (direct) {
    return direct;
  }
  const periods =
    application.Periods ??
    application.periods ??
    application.LeavePeriods ??
    application.leavePeriods;
  if (
    Array.isArray(periods) &&
    periods.length > 0 &&
    typeof periods[0] === "object" &&
    periods[0] !== null
  ) {
    const period = periods[0] as Record<string, unknown>;
    return (
      readString(period, "PeriodStatus") ??
      readString(period, "periodStatus") ??
      readString(period, "Status") ??
      readString(period, "status") ??
      readString(period, "LeavePeriodStatus") ??
      readString(period, "leavePeriodStatus")
    );
  }
  return null;
}

function readString(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normaliseStatus(value: string | null): XeroLeaveApplicationStatus {
  const status = value?.trim().toUpperCase();
  if (
    status === "APPROVED" ||
    status === "SCHEDULED" ||
    status === "PROCESSED" ||
    status === "COMPLETED" ||
    status === "ESTIMATED"
  ) {
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
  if (
    status === "SUBMITTED" ||
    status === "PENDING" ||
    status === "REQUESTED"
  ) {
    return "SUBMITTED";
  }
  return "UNKNOWN";
}

function parseDate(value: string): Date | null {
  const normalised = normaliseXeroDateTime(value);
  return normalised ? new Date(normalised) : null;
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
