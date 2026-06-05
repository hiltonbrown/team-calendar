import "./keys";

export { XeroWriteAdapter } from "./src/adapter/xero-write-adapter";
export {
  buildXeroOAuthStartUrl,
  completeXeroOAuth,
  completeXeroTenantSelection,
  disconnectXeroOAuthConnection,
  getPendingXeroOAuthSession,
  markXeroConnectionStale,
  type PendingXeroSessionOrganisation,
  type PendingXeroSessionTenant,
  refreshXeroOAuthConnection,
  type XeroOAuthError,
} from "./src/oauth/service";
export {
  fetchEmployeesForRegion,
  fetchLeaveApplicationStatusForRegion,
  fetchLeaveRecordsForRegion,
} from "./src/read/dispatch";
export type { XeroEmployee } from "./src/read/employees";
export type {
  XeroLeaveApplicationStatus,
  XeroLeaveApplicationStatusResult,
} from "./src/read/leave-application-status";
export type {
  XeroLeaveRecord,
  XeroLeaveRecordStatus,
} from "./src/read/leave-records";
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
