import type { resolveXeroAccess } from "../oauth/credential-owner";
import type { XeroTenantForWrite } from "../write/types";

type AccessResult = Awaited<ReturnType<typeof resolveXeroAccess>>;
type ResolvedAccess = Extract<AccessResult, { ok: true }>["value"];

export function toResolvedXeroTenant(
  scope: {
    clerkOrgId: string;
    organisationId: string;
    capability?: string | readonly string[];
  },
  access: ResolvedAccess
): XeroTenantForWrite {
  return {
    accessToken: access.accessToken,
    bindingGeneration: access.bindingGeneration,
    capability: scope.capability,
    clerk_org_id: scope.clerkOrgId,
    deadline: access.deadline,
    id: access.xeroTenantDatabaseId,
    organisation_id: scope.organisationId,
    payroll_region: access.payrollRegion,
    tokenVersion: access.tokenVersion,
    xero_tenant_id: access.xeroTenantId,
  };
}
