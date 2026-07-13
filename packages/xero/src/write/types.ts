import type { Result } from "@repo/core";

export type XeroWriteError =
  | XeroWriteErrorVariant<"auth_error">
  | XeroWriteErrorVariant<"conflict_error">
  | XeroWriteErrorVariant<"network_error">
  | XeroWriteErrorVariant<"not_found_error">
  | XeroWriteErrorVariant<"rate_limit_error">
  | XeroWriteErrorVariant<"region_not_supported_error">
  | XeroWriteErrorVariant<"unknown_error">
  | XeroWriteErrorVariant<"validation_error">;

export interface XeroWriteErrorDetails {
  correlationId?: string;
  httpStatus?: number;
  message: string;
  rawPayload?: unknown;
}

export type XeroWriteErrorVariant<TCode extends string> =
  XeroWriteErrorDetails & {
    code: TCode;
  };

export type XeroWriteResult<T> = Result<T, XeroWriteError>;

export type PayrollRegion = "AU" | "NZ" | "UK";

export interface XeroTenantForWrite {
  clerk_org_id: string;
  id: string;
  organisation_id: string;
  payroll_region: PayrollRegion;
  xero_connection: {
    access_token_auth_tag?: null | string;
    access_token_encrypted: string;
    access_token_iv?: null | string;
    revoked_at: Date | null;
  };
  xero_tenant_id: string;
}

export interface SubmitLeaveApplicationInput {
  endsAt: Date;
  startsAt: Date;
  title?: string;
  units: number;
  xeroEmployeeId: string;
  xeroLeaveTypeId: string;
  xeroTenant: XeroTenantForWrite;
}

export interface ApproveLeaveApplicationInput {
  xeroEmployeeId: string;
  xeroLeaveApplicationId: string;
  xeroTenant: XeroTenantForWrite;
}

export interface DeclineLeaveApplicationInput {
  reason: string;
  xeroEmployeeId: string;
  xeroLeaveApplicationId: string;
  xeroTenant: XeroTenantForWrite;
}

export interface WithdrawLeaveApplicationInput {
  xeroEmployeeId: string;
  xeroLeaveApplicationId: string;
  xeroTenant: XeroTenantForWrite;
}

export function toPlainLanguageMessage(error: XeroWriteError): string {
  switch (error.code) {
    case "auth_error":
      return "Your Xero connection needs to be reauthorised. Ask an administrator to reconnect Xero in Settings > Integrations.";
    case "conflict_error":
      return "This leave overlaps an existing record in Xero. Review the dates and try again.";
    case "network_error":
      return "Could not reach Xero. Check your internet connection and try again.";
    case "not_found_error":
      return "This employee or leave type is not yet set up in Xero. Ask your administrator to check the Xero configuration.";
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
