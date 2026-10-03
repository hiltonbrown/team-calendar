import { z } from "zod";
import { normaliseXeroDateOnly, normaliseXeroDateTime } from "./date";

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

export interface XeroLeaveRecordMapFailure {
  index: number;
  rawLeaveApplicationId: string | null;
  rawPayload: unknown;
  reason: string;
}

export interface XeroLeaveRecordsFetchResult {
  complete: boolean;
  failures: XeroLeaveRecordMapFailure[];
  hasInvalidRecords: boolean;
  leaveRecords: XeroLeaveRecord[];
  rawItemCount: number;
  rawResponse: unknown;
  seenLeaveApplicationIds: string[];
  traversalOutcome:
    | "completed"
    | "envelope_error"
    | "malformed_rows"
    | "page_limit_exceeded";
}

const LeavePeriodSchema = z
  .object({
    LeavePeriodStatus: z.string().optional().nullable(),
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

const XeroLeaveApplicationsEnvelopeSchema = z
  .object({
    LeaveApplications: z.array(z.unknown()).optional(),
    leaveApplications: z.array(z.unknown()).optional(),
  })
  .passthrough()
  .refine(
    (data) =>
      Array.isArray(data.LeaveApplications) ||
      Array.isArray(data.leaveApplications),
    {
      message:
        "Envelope must contain LeaveApplications or leaveApplications array",
    }
  );

export type MapXeroLeaveRecordsResult =
  | {
      failures: XeroLeaveRecordMapFailure[];
      ok: true;
      rawItemCount: number;
      records: XeroLeaveRecord[];
      seenLeaveApplicationIds: string[];
    }
  | { ok: false; reason: "malformed_envelope" };

export function mapXeroLeaveRecords(
  payload: unknown,
  leaveTypeNamesById: ReadonlyMap<string, string> = new Map()
): XeroLeaveRecord[] {
  const result = tryMapXeroLeaveRecords(payload, leaveTypeNamesById);
  return result.ok ? result.records : [];
}

export function tryMapXeroLeaveRecords(
  payload: unknown,
  leaveTypeNamesById: ReadonlyMap<string, string> = new Map()
): MapXeroLeaveRecordsResult {
  const parsedEnvelope = XeroLeaveApplicationsEnvelopeSchema.safeParse(payload);
  if (!parsedEnvelope.success) {
    return { ok: false, reason: "malformed_envelope" };
  }

  const rawItems =
    parsedEnvelope.data.LeaveApplications ??
    parsedEnvelope.data.leaveApplications ??
    [];
  const rawItemCount = rawItems.length;
  const records: XeroLeaveRecord[] = [];
  const failures: XeroLeaveRecordMapFailure[] = [];
  const seenLeaveApplicationIds: string[] = [];

  rawItems.forEach((rawItem, index) => {
    const rawLeaveApplicationId = extractRawLeaveApplicationId(rawItem);
    if (rawLeaveApplicationId) {
      seenLeaveApplicationIds.push(rawLeaveApplicationId);
    }

    const parsedItem = LeaveApplicationSchema.safeParse(rawItem);
    if (!parsedItem.success) {
      failures.push({
        index,
        rawLeaveApplicationId,
        rawPayload: rawItem,
        reason: "Leave application record does not match the expected shape",
      });
      return;
    }

    const application = parsedItem.data;
    const leaveApplicationId = text(
      application.LeaveApplicationID ?? application.LeaveApplicationId
    );
    const leaveTypeId = text(
      application.LeaveTypeID ?? application.LeaveTypeId
    );
    const periods = application.LeavePeriods ?? [];

    records.push({
      employeeId: text(application.EmployeeID ?? application.EmployeeId),
      endDate: normaliseXeroDateOnly(application.EndDate) ?? "",
      leaveApplicationId,
      leaveTypeId,
      leaveTypeName:
        nullableText(application.LeaveType) ??
        leaveTypeNamesById.get(leaveTypeId) ??
        null,
      rawPayload: application,
      startDate: normaliseXeroDateOnly(application.StartDate) ?? "",
      status: normaliseApplicationStatus(application.Status, periods),
      title: nullableText(application.Title),
      units: sumUnits(periods),
      updatedDateUtc: normaliseXeroDateTime(
        application.UpdatedDateUTC ?? application.UpdatedDateUtc
      ),
    });
  });

  return {
    failures,
    ok: true,
    rawItemCount,
    records,
    seenLeaveApplicationIds,
  };
}

function extractRawLeaveApplicationId(rawItem: unknown): string | null {
  if (typeof rawItem !== "object" || rawItem === null) {
    return null;
  }
  const item = rawItem as Record<string, unknown>;
  const candidate =
    item.LeaveApplicationID ??
    item.LeaveApplicationId ??
    item.leaveApplicationID ??
    item.leaveApplicationId;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: string | null | undefined): string | null {
  const normalised = text(value);
  return normalised.length > 0 ? normalised : null;
}

function normaliseApplicationStatus(
  applicationStatus: string | null | undefined,
  periods: Array<{ LeavePeriodStatus?: null | string }>
): XeroLeaveRecordStatus {
  const explicit = normaliseStatus(applicationStatus);
  if (explicit !== "UNKNOWN") {
    return explicit;
  }

  const statuses = periods.map((period) =>
    normaliseStatus(period.LeavePeriodStatus)
  );
  if (statuses.includes("SUBMITTED")) {
    return "SUBMITTED";
  }
  if (statuses.includes("APPROVED")) {
    return "APPROVED";
  }
  if (statuses.includes("REJECTED")) {
    return "REJECTED";
  }
  if (statuses.includes("WITHDRAWN")) {
    return "WITHDRAWN";
  }
  if (statuses.includes("DELETED")) {
    return "DELETED";
  }
  return "UNKNOWN";
}

function normaliseStatus(
  value: string | null | undefined
): XeroLeaveRecordStatus {
  const status = value?.trim().toUpperCase();
  if (
    status === "APPROVED" ||
    status === "SCHEDULED" ||
    status === "PROCESSED"
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

function sumUnits(periods: Array<{ NumberOfUnits?: null | number }>): number {
  return periods.reduce(
    (total, period) => total + (period.NumberOfUnits ?? 0),
    0
  );
}
