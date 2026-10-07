import { type Result, xeroRecoveryMessage } from "@repo/core";
import type { XeroProviderConnectionCapture } from "@repo/database/queries/xero-connections";
import type { XeroDeadline } from "../rate-limit/deadline";

export type XeroWriteError =
  | XeroWriteErrorVariant<"auth_error">
  | XeroWriteErrorVariant<"conflict_error">
  | XeroWriteErrorVariant<"network_error">
  | XeroWriteErrorVariant<"not_found_error">
  | XeroWriteErrorVariant<"permission_error">
  | XeroWriteErrorVariant<"rate_limit_error">
  | XeroWriteErrorVariant<"region_not_supported_error">
  | XeroWriteErrorVariant<"unknown_error">
  | XeroWriteErrorVariant<"validation_error">;

export type XeroRecoveryReason =
  | "update_permissions"
  | "reauthorise"
  | "access_denied"
  | "operational_incident"
  | "retry_later"
  | "outcome_unknown"
  | "not_connected";

export interface XeroWriteErrorDetails {
  correlationId?: string;
  dispatchPhase?: "before_dispatch" | "after_dispatch";
  httpStatus?: number;
  message: string;
  rawPayload?: unknown;
  recoveryReason?: XeroRecoveryReason;
  retryAfterMs?: number;
}

export type XeroWriteErrorVariant<TCode extends string> =
  XeroWriteErrorDetails & {
    code: TCode;
  };

export type XeroWriteResult<T> = Result<T, XeroWriteError>;

export type PayrollRegion = "AU" | "NZ" | "UK";

export interface XeroAccessContext {
  accessToken: string;
  capability?: string | readonly string[];
  clerk_org_id: string;
  deadline: XeroDeadline;
  id: string;
  organisation_id: string;
  payroll_region: PayrollRegion;
  providerConnection?: XeroProviderConnectionCapture;
  xero_tenant_id: string;
}

export interface SubmitLeaveApplicationInput {
  endsAt: Date;
  startsAt: Date;
  title?: string;
  units: number;
  xeroConnection: XeroAccessContext;
  xeroEmployeeId: string;
  xeroLeaveTypeId: string;
}

export interface ApproveLeaveApplicationInput {
  xeroConnection: XeroAccessContext;
  xeroEmployeeId: string;
  xeroLeaveApplicationId: string;
}

export interface DeclineLeaveApplicationInput {
  reason: string;
  xeroConnection: XeroAccessContext;
  xeroEmployeeId: string;
  xeroLeaveApplicationId: string;
}

export interface WithdrawLeaveApplicationInput {
  xeroConnection: XeroAccessContext;
  xeroEmployeeId: string;
  xeroLeaveApplicationId: string;
}

export function toPlainLanguageMessage(error: XeroWriteError): string {
  if (error.recoveryReason) {
    return error.recoveryReason === "not_connected"
      ? "Xero is not connected."
      : xeroRecoveryMessage(error.recoveryReason, {
          retryAfterMs: error.retryAfterMs,
        });
  }
  switch (error.code) {
    case "auth_error":
      return "Your Xero connection needs to be reauthorised. Ask an administrator to reconnect Xero in Settings > Integrations.";
    case "conflict_error":
      return "This leave overlaps an existing record in Xero. Review the dates and try again.";
    case "network_error":
      return "Could not reach Xero. Check your internet connection and try again.";
    case "not_found_error":
      return "This employee or leave type is not yet set up in Xero. Ask your administrator to check the Xero configuration.";
    case "permission_error":
      return "Your Xero organisation does not have permission to access this payroll feature. Check your Xero subscription and permissions.";
    case "rate_limit_error":
      return "Xero is temporarily rate-limited. Try again in a few minutes.";
    case "region_not_supported_error":
      return "Sending leave to Xero is not yet available for this payroll region. Manage this leave directly in Xero for now.";
    case "unknown_error":
      return "Something went wrong when sending this to Xero. Try again or contact support if the issue continues.";
    case "validation_error":
      return "Xero rejected this request. Check the dates and leave type and try again.";
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}
