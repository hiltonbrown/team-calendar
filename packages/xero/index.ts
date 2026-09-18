import "./keys";

export { XeroWriteAdapter } from "./src/adapter/xero-write-adapter";
export type { XeroEmployeesFetchResult } from "./src/au/read";
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
export {
  toPlainLanguageMessage,
  type XeroWriteError,
  type XeroWriteResult,
} from "./src/write/types";
