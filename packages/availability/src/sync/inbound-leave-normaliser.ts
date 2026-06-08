import { createHash } from "node:crypto";
import type {
  availability_approval_status,
  availability_record_type,
} from "@repo/database/generated/enums";
import { deriveAvailabilityUidKey } from "./availability-uid";

export type InboundLeaveApprovalStatus =
  | "approved"
  | "cancelled"
  | "declined"
  | "submitted"
  | "withdrawn";

export interface InboundLeaveRecordInput {
  approvalStatus: InboundLeaveApprovalStatus;
  clerkOrgId: string;
  endsAt: Date;
  leaveTypeId: string;
  leaveTypeName: string | null;
  organisationId: string;
  personId: string;
  provider: "xero";
  rawPayload: unknown;
  sourceLastModifiedAt: Date | null;
  sourceRemoteId: string;
  stableSourceKey: string;
  startsAt: Date;
  title: string | null;
  units: number;
}

export interface NormalisedInboundLeaveRecord {
  allDay: true;
  approvalStatus: availability_approval_status;
  contactability: "unavailable";
  derivedUidKey: string;
  endsAt: Date;
  includeInFeed: boolean;
  personId: string;
  privacyMode: "named";
  publishStatus: "archived" | "eligible";
  rawPayload: unknown;
  recordType: availability_record_type;
  sourceLastModifiedAt: Date | null;
  sourceRemoteHash: string;
  sourceRemoteId: string;
  sourceType: "xero_leave";
  startsAt: Date;
  title: string | null;
}

export function normaliseInboundLeaveRecord(
  input: InboundLeaveRecordInput
): NormalisedInboundLeaveRecord {
  const approvalStatus = mapApprovalStatus(input.approvalStatus);
  const recordType = recordTypeFromLeaveType(input.leaveTypeName);
  return {
    allDay: true,
    approvalStatus,
    contactability: "unavailable",
    derivedUidKey: deriveAvailabilityUidKey({
      clerkOrgId: input.clerkOrgId,
      endsAt: input.endsAt,
      organisationId: input.organisationId,
      personId: input.personId,
      recordType,
      sourceType: "xero_leave",
      stableSourceKey: input.stableSourceKey,
      startsAt: input.startsAt,
    }),
    endsAt: input.endsAt,
    includeInFeed: approvalStatus === "approved",
    personId: input.personId,
    privacyMode: "named",
    publishStatus: approvalStatus === "cancelled" ? "archived" : "eligible",
    rawPayload: input.rawPayload,
    recordType,
    sourceLastModifiedAt: input.sourceLastModifiedAt,
    sourceRemoteHash: hashJson(input.rawPayload),
    sourceRemoteId: input.sourceRemoteId,
    sourceType: "xero_leave",
    startsAt: input.startsAt,
    title: input.title,
  };
}

export function deriveXeroStableSourceKey(input: {
  employeeId: string;
  endsAt: Date;
  leaveTypeId: string;
  startsAt: Date;
  units: number;
  xeroTenantId: string;
}): string {
  return [
    input.xeroTenantId,
    input.employeeId,
    input.leaveTypeId,
    input.startsAt.toISOString(),
    input.endsAt.toISOString(),
    normaliseUnits(input.units),
  ].join("|");
}

function mapApprovalStatus(
  status: InboundLeaveApprovalStatus
): availability_approval_status {
  switch (status) {
    case "approved":
      return "approved";
    case "cancelled":
      return "cancelled";
    case "declined":
      return "declined";
    case "submitted":
      return "submitted";
    case "withdrawn":
      return "withdrawn";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function recordTypeFromLeaveType(
  leaveTypeName: string | null
): availability_record_type {
  const value = leaveTypeName?.toLowerCase() ?? "";
  if (value.includes("annual")) {
    return "annual_leave";
  }
  if (value.includes("personal")) {
    return "personal_leave";
  }
  if (value.includes("sick")) {
    return "sick_leave";
  }
  if (value.includes("long service")) {
    return "long_service_leave";
  }
  if (value.includes("unpaid")) {
    return "unpaid_leave";
  }
  if (value.includes("holiday")) {
    return "holiday";
  }
  return "leave";
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function normaliseUnits(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}
