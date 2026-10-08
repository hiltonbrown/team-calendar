import type { resolveXeroAccess } from "../oauth/authorisation";
import type { XeroAccessContext } from "../write/types";

type AccessResult = Awaited<ReturnType<typeof resolveXeroAccess>>;
type ResolvedAccess = Extract<AccessResult, { ok: true }>["value"];

export function toResolvedXeroConnection(
  scope: {
    clerkOrgId: string;
    organisationId: string;
    capability?: string | readonly string[];
  },
  access: ResolvedAccess
): XeroAccessContext {
  return {
    accessToken: access.accessToken,
    capability: scope.capability,
    clerk_org_id: scope.clerkOrgId,
    deadline: access.deadline,
    id: access.connectionId,
    organisation_id: scope.organisationId,
    payroll_region: access.payrollRegion,
    providerConnection: access.providerConnection,
    xero_tenant_id: access.xeroTenantId,
  };
}
