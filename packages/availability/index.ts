import "server-only";

export type {
  ApproveLeaveInput,
  DeclineLeaveInput,
  ExternalWritePort,
  ProviderResolutionError,
  ProviderWriteError,
  SubmitLeaveInput,
  WithdrawLeaveInput,
} from "@repo/core";
export { materialiseAvailabilityPublication } from "@repo/feeds";
export {
  DATE_RANGE_PRESET_OPTIONS,
  type DateRangeError,
  type DateRangePreset,
  type ResolvedDateRange,
  resolveDateRange,
  zonedStartOfDayToUtc,
} from "./src/analytics/date-range";
export {
  type AnalyticsRecordListItem,
  type AnalyticsRole,
  type AnalyticsServiceError,
  aggregateLeaveReports,
  type LeaveReportsData,
  type LeaveReportsFilters,
  listLeaveReportRecordsForDrilldown,
  type RecordListPage,
  type XeroLeaveRecordType,
} from "./src/analytics/leave-reports-service";
export {
  aggregateOutOfOffice,
  type LocalOnlyRecordType,
  listOutOfOfficeRecordsForDrilldown,
  type OutOfOfficeData,
  type OutOfOfficeFilters,
} from "./src/analytics/out-of-office-service";
export {
  type AggregationCache,
  aggregationFingerprint,
  createAggregationCache,
  stableStringify,
} from "./src/analytics/request-cache";
export * from "./src/approvals/approval-service";
export {
  type ApprovalAction,
  type ApprovalDetail,
  type ApprovalListItem,
  type ApprovalRole,
  type ApprovalServiceError,
  type ApprovalSummaryCounts,
  approve,
  decline,
  dispatchApprovalReconciliation,
  getApprovalDetail,
  getApprovalSummaryCounts,
  listForApprover,
  requestMoreInfo,
  retryApproval,
  retryDecline,
  revertApprovalAttempt,
} from "./src/approvals/approval-service";
export * from "./src/calendar/calendar-service";
export {
  type CalendarDay,
  type CalendarEvent,
  type CalendarEventDetail,
  type CalendarPerson,
  type CalendarRange,
  type CalendarRole,
  type CalendarScope,
  type CalendarServiceError,
  type CalendarView,
  getCalendarRange,
  getEventDetail,
} from "./src/calendar/calendar-service";
export {
  createDashboardCache,
  type DashboardCache,
} from "./src/dashboard/dashboard-cache";
export {
  type AdminDashboardView,
  type DashboardRole,
  type DashboardSection,
  type DashboardServiceError,
  type EmployeeDashboardView,
  getAdminView,
  getEmployeeView,
  getManagerView,
  type ManagerDashboardView,
  resolveDashboardRole,
} from "./src/dashboard/dashboard-service";
export * from "./src/duration/working-days";
export { computeWorkingDays } from "./src/duration/working-days";
export * from "./src/holidays/holiday-service";
export {
  addCustomHoliday,
  deleteCustomHoliday,
  importForJurisdiction,
  listForOrganisation,
  restoreHoliday,
  suppressHoliday,
} from "./src/holidays/holiday-service";
export * from "./src/holidays/nager-client";
export * from "./src/people/alternative-contact-service";
export {
  type AlternativeContactServiceError,
  addAlternativeContact,
  deleteAlternativeContact,
  reorderAlternativeContacts,
  updateAlternativeContact,
} from "./src/people/alternative-contact-service";
export * from "./src/people/balance-refresh";
export * from "./src/people/current-status";
export {
  type CurrentStatus,
  type CurrentStatusKey,
  computeCurrentStatus,
} from "./src/people/current-status";
export type {
  CurrentUserPersonInput,
  OrganisationSettingsInput,
  PersonView,
  TenantContext,
} from "./src/people/current-user-service";
export {
  ensureCurrentUserPerson,
  ensureOrganisationForClerk,
  getInitials,
  listPersonViews,
} from "./src/people/current-user-service";
export * from "./src/people/field-ownership";
export {
  type FieldOwnership,
  fieldOwnershipForPerson,
} from "./src/people/field-ownership";
export * from "./src/people/manual-balance-service";
export {
  type ManualBalanceServiceError,
  setManualLeaveBalance,
} from "./src/people/manual-balance-service";
export * from "./src/people/people-service";
export {
  type AlternativeContactSnapshot,
  type AvailabilityRecordSummary,
  type BalanceRow,
  getPersonProfile,
  listHistoryPage,
  listPeople,
  listUpcomingRecords,
  type PeopleRole,
  type PeopleServiceError,
  type PersonListItem,
  type PersonProfile,
} from "./src/people/people-service";
export * from "./src/plans/plan-service";
export {
  archiveRecord,
  type BalanceChip,
  createRecord,
  deleteDraftRecord,
  type EditableAction,
  getRecord,
  listMyRecords,
  listTeamRecords,
  type PlanRecord,
  type PlanServiceError,
  type RecordDetail,
  type RecordListItem,
  restoreRecord,
  updateRecord,
} from "./src/plans/plan-service";
export * from "./src/plans/submit-service";
export {
  retrySubmission,
  revertToDraft,
  submitDraftRecord,
  withdrawSubmission,
} from "./src/plans/submit-service";
export type {
  AvailabilityRecordView,
  ManualAvailabilityInput,
} from "./src/records/manual-records-service";
export {
  archiveManualAvailability,
  createManualAvailability,
  listAvailabilityRecords,
  ManualAvailabilityInputSchema,
  updateAvailabilityApprovalStatus,
  updateManualAvailability,
} from "./src/records/manual-records-service";
export * from "./src/records/record-type-categories";
export {
  type AuditEventDetail,
  type AuditEventListItem,
  AuditLogFilterSchema,
  type AuditLogServiceError,
  exportCsv as exportAuditLogCsv,
  getEventDetail as getAuditEventDetail,
  listEvents as listAuditLogEvents,
} from "./src/settings/audit-log-service";
export {
  type BillingServiceError,
  type BillingSummary,
  type DashboardBillingSummary,
  getBillingSummary,
  getBillingSummaryForDashboard,
} from "./src/settings/billing-service";
export {
  defaultOrganisationSettingsPatch,
  getSettings,
  type SettingsServiceError,
  updateSettings,
} from "./src/settings/organisation-settings-service";
export type {
  OrganisationSettings,
  OrganisationSettingsPatch,
} from "./src/settings/shared";
export { deriveAvailabilityUidKey } from "./src/sync/availability-uid";
export {
  deriveXeroStableSourceKey,
  type InboundLeaveApprovalStatus,
  type InboundLeaveRecordInput,
  type NormalisedInboundLeaveRecord,
  normaliseInboundLeaveRecord,
} from "./src/sync/inbound-leave-normaliser";
export {
  cancelRun,
  dispatchManualSync,
  exportFailedRecordsCsv,
  getRunDetail,
  listRuns,
  listTenantSummaries,
  type RunDetail,
  type RunListItem,
  type SyncMonitorError,
  type SyncMonitorRole,
  type SyncRunFilters,
  type SyncRunStatus,
  type SyncRunType,
  type SyncTriggerType,
  type TenantSummary,
  type TimelineEvent,
} from "./src/sync/sync-monitor-service";
export * from "./src/xero-connection-state";
export { hasActiveXeroConnection } from "./src/xero-connection-state";
