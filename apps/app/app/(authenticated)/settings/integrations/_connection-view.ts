import "server-only";
import type { Prisma } from "@repo/database/generated/client";

// This explicit allowlist is safe to pass to client components. Never replace it
// with `omit`, because new credential fields must remain excluded by default.
export const connectionViewSelect = {
  disconnected_at: true,
  expires_at: true,
  id: true,
  last_error_message: true,
  revoked_at: true,
  status: true,
} satisfies Prisma.XeroConnectionSelect;

export const organisationWithConnectionSelect = {
  country_code: true,
  id: true,
  name: true,
  xero_connection: {
    select: {
      ...connectionViewSelect,
      xero_tenant: {
        select: {
          id: true,
          last_approval_state_reconciled_at: true,
          last_leave_balances_sync_at: true,
          last_leave_records_sync_at: true,
          last_people_sync_at: true,
          leave_balances_stale_since: true,
          payroll_region: true,
          sync_paused_at: true,
          tenant_name: true,
          xero_tenant_id: true,
        },
      },
    },
  },
} satisfies Prisma.OrganisationSelect;

export type OrganisationWithConnectionView = Prisma.OrganisationGetPayload<{
  select: typeof organisationWithConnectionSelect;
}>;
