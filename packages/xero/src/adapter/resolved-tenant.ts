import type { resolveXeroAccess } from "../oauth/authorisation";
import type { XeroAccessContext } from "../write/types";

type AccessResult = Awaited<ReturnType<typeof resolveXeroAccess>>;
type ResolvedAccess = Extract<AccessResult, { ok: true }>["value"];

export function toResolvedXeroConnection(
  scope: {
    accountId: string;
    organisationId: string;
    capability?: string | readonly string[];
  },
  access: ResolvedAccess
): XeroAccessContext {
  return {
    accessToken: access.accessToken,
    account_id: scope.accountId,
    capability: scope.capability,
    deadline: access.deadline,
    id: access.connectionId,
    organisation_id: scope.organisationId,
    payroll_region: access.payrollRegion,
    providerConnection: access.providerConnection,
    xero_tenant_id: access.xeroTenantId,
  };
}
