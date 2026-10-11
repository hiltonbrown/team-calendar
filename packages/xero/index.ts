import "./keys";

export { XERO_OPERATION_CAPABILITIES } from "./src/adapter/capabilities";
export { classifyXeroFailure } from "./src/adapter/classify-xero-failure";
export { toResolvedXeroConnection } from "./src/adapter/resolved-tenant";
export { XeroWriteAdapter } from "./src/adapter/xero-write-adapter";
export type { XeroEmployeesFetchResult } from "./src/au/read";
export { emitXeroMetric } from "./src/metrics";
export {
  refreshDormantXeroAuthorisations,
  resolveXeroAccess,
} from "./src/oauth/authorisation";
export {
  disconnectAllXeroConnections,
  disconnectXeroOAuthConnection,
  removeXeroCompany,
  type XeroDisconnectResult,
} from "./src/oauth/disconnect";
export { hasXeroCapability, XERO_SCOPES } from "./src/oauth/scopes";
export {
  buildXeroOAuthStartUrl,
  cancelXeroOAuth,
  completeXeroOAuth,
  completeXeroTenantSelection,
  getPendingXeroOAuthSession,
  isLocalApplicationPath,
  isPreviewDeployment,
  type PendingXeroSessionOrganisation,
  type PendingXeroSessionTenant,
  purgeClosedXeroOAuthSessions,
  readOAuthStateReturnTo,
  type XeroMultiTenantSelectionResult,
  type XeroOAuthError,
  type XeroTenantSelectionOutcome,
} from "./src/oauth/service";
export {
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
  XeroLeaveRecordMapFailure,
  XeroLeaveRecordStatus,
  XeroLeaveRecordsFetchResult,
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
export type { XeroAccessContext, XeroRecoveryReason } from "./src/write/types";
export {
  toPlainLanguageMessage,
  type XeroWriteError,
  type XeroWriteResult,
} from "./src/write/types";
