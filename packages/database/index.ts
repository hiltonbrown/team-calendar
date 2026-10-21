export { limitTypes } from "@repo/core";
export * from "./generated/client";
export {
  getOrCreateForOrganisation as getOrCreateOrganisationSettings,
  type OrganisationSettingsRow,
  type OrganisationSettingsUpdateInput,
  updateForOrganisation as updateOrganisationSettings,
} from "./src/organisation-settings/repository";
export * from "./src/queries/account-companies";
export {
  getAccountSettings,
  type ManagerVisibilityScope,
  updateAccountSettings,
} from "./src/queries/account-settings";
export * from "./src/queries/activation-dashboard";
export * from "./src/queries/billing";
export * from "./src/queries/outbound-operations";
export * from "./src/queries/payroll-entitlements";
export * from "./src/queries/public-holiday-resolution";
export * from "./src/queries/schedulable-xero-connections";
export * from "./src/queries/xero-authorisation";
export {
  getScopedXeroAuthorisationMetadata,
  getScopedXeroConnection,
  hasScopedXeroReconnectTarget,
  markScopedXeroConnectionReconnectRequired,
} from "./src/queries/xero-connections";
export * from "./src/queries/xero-ownership";
export * from "./src/seed/plan-sync";
export * from "./src/seed/plans";
export type { Database } from "./src/system-client";
export { systemDatabase } from "./src/system-client";

export {
  afterTenantCommit,
  assertNoTenantTransaction,
  assertTenantDb,
  isTenantScopeActive,
  TENANT_READ_TRANSACTION_OPTIONS,
  TENANT_REQUEST_OPTIONS,
  type TenantDb,
  TenantMismatchError,
  TenantNestingError,
  TenantPhaseError,
  type TenantTransactionOptions,
  withTenantDb,
  withTenantReads,
  withTenantResult,
} from "./src/tenant-db";
export {
  type ScopedQueryResult,
  scopedQuery,
  scopedTo,
} from "./src/tenant-query";
export { withTenantQueryTiming } from "./src/tenant-query-timing";
export * from "./src/xero-locks";
