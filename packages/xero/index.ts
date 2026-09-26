import "./keys";

export { XERO_OPERATION_CAPABILITIES } from "./src/adapter/capabilities";
export { classifyXeroFailure } from "./src/adapter/classify-xero-failure";
export { toResolvedXeroTenant } from "./src/adapter/resolved-tenant";
export { XeroWriteAdapter } from "./src/adapter/xero-write-adapter";
export type { XeroEmployeesFetchResult } from "./src/au/read";
export {
  aggregateXeroDisconnectReceipt,
  getXeroDisconnectReceipt,
  processXeroCleanupAttempt,
  reissueXeroCleanupAttempt,
  type XeroDisconnectReceipt,
} from "./src/oauth/connection-cleanup";
export {
  recoverXeroRefreshAttempts,
  refreshXeroCredentialOwner,
  resolveXeroAccess,
} from "./src/oauth/credential-owner";
export {
  buildXeroOAuthStartUrl,
  completeXeroOAuth,
  completeXeroTenantSelection,
  disconnectXeroOAuthConnection,
  ensureFreshXeroConnection,
  getPendingXeroOAuthSession,
  isLocalApplicationPath,
  isPreviewDeployment,
  markXeroConnectionStale,
  type PendingXeroSessionOrganisation,
  type PendingXeroSessionTenant,
  refreshXeroOAuthConnection,
  scrubInactiveXeroOAuthSessionCredentials,
  type XeroConnectionRefreshDecision,
  type XeroOAuthError,
  xeroConnectionRefreshDecision,
} from "./src/oauth/service";
export {
  initialiseXeroRateNamespace,
  type XeroRateClass,
  xeroRateKeys,
} from "./src/rate-limit/shared-store";
export {
  fetchEmployeesForRegion,
  fetchLeaveApplicationStatusForRegion,
  fetchLeaveBalancesForRegion,
  fetchLeaveForEmployeeForRegion,
  fetchLeaveRecordsForRegion,
} from "./src/read/dispatch";
export type {
  XeroEmployee,
  XeroEmployeeMapFailure,
} from "./src/read/employees";
export type {
  FetchLeaveApplicationStatusInput,
  FetchNzLeaveApplicationStatusInput,
  FetchUkLeaveApplicationStatusInput,
  XeroLeaveApplicationStatus,
  XeroLeaveApplicationStatusResult,
} from "./src/read/leave-application-status";
export {
  isSupportedCurrencyCode,
  type LeaveBalanceRawPayload,
  LeaveBalanceRawPayloadSchema,
  type SupportedCurrencyCode,
  SupportedCurrencyCodeSchema,
  toValidatedLeaveBalanceRawPayload,
  type XeroLeaveBalance,
  type XeroLeaveBalanceFetchFailure,
} from "./src/read/leave-balances";
export type {
  XeroLeaveRecord,
  XeroLeaveRecordStatus,
} from "./src/read/leave-records";
export {
  deriveXeroStableSourceKey,
  mapXeroLeaveType,
  type XeroLeaveTypeMapping,
  type XeroPayrollRegion,
} from "./src/read/leave-type-mapping";
export {
  type ResolutionError,
  resolveXeroEmployeeId,
} from "./src/resolution/resolve-employee";
export { resolveXeroLeaveTypeId } from "./src/resolution/resolve-leave-type";
export {
  approveLeaveApplicationForRegion,
  declineLeaveApplicationForRegion,
  submitLeaveApplicationForRegion,
  withdrawLeaveApplicationForRegion,
} from "./src/write/dispatch";
export type { XeroRecoveryReason, XeroTenantForWrite } from "./src/write/types";
export {
  toPlainLanguageMessage,
  type XeroWriteError,
  type XeroWriteResult,
} from "./src/write/types";
