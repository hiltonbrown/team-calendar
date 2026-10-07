import "server-only";
import type { Prisma } from "@repo/database/generated/client";
// Explicit allowlist excludes authorisation credentials from client components.
export const connectionViewSelect = {
  disconnected_at: true,
  id: true,
  last_approval_state_reconciled_at: true,
  last_error_message: true,
  last_leave_balances_sync_at: true,
  last_leave_records_sync_at: true,
  last_people_sync_at: true,
  leave_balances_stale_since: true,
  payroll_region: true,
  status: true,
  sync_paused_at: true,
  tenant_name: true,
  xero_tenant_id: true,
} satisfies Prisma.XeroConnectionSelect;
export const organisationWithConnectionSelect = {
  country_code: true,
  id: true,
  name: true,
  xero_connection: { select: connectionViewSelect },
} satisfies Prisma.OrganisationSelect;
export type OrganisationWithConnectionView = Prisma.OrganisationGetPayload<{
  select: typeof organisationWithConnectionSelect;
}> & { xeroConnectionState: import("@repo/core").XeroConnectionDisplayState };
