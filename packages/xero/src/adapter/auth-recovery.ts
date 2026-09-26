import { resolveXeroAccess } from "../oauth/credential-owner";
import type { XeroTenantForWrite, XeroWriteResult } from "../write/types";
import {
  classifyXeroFailure,
  mapXeroTransportError,
} from "./classify-xero-failure";
import { toResolvedXeroTenant } from "./resolved-tenant";

export async function executeWithXeroAuthRecovery<T>(
  xeroTenant: XeroTenantForWrite,
  operation: (currentTenant: XeroTenantForWrite) => Promise<XeroWriteResult<T>>,
  isMutation = false
): Promise<XeroWriteResult<T>> {
  let first: XeroWriteResult<T>;
  try {
    first = await operation(xeroTenant);
  } catch (error) {
    return { error: mapXeroTransportError(error, isMutation), ok: false };
  }
  if (
    first.ok ||
    first.error.httpStatus !== 401 ||
    first.error.recoveryReason === "update_permissions" ||
    first.error.recoveryReason === "outcome_unknown" ||
    first.error.dispatchPhase === "before_dispatch"
  ) {
    return first;
  }

  const scope = {
    capability: xeroTenant.capability,
    clerkOrgId: xeroTenant.clerk_org_id,
    organisationId: xeroTenant.organisation_id,
  };
  const refreshed = await resolveXeroAccess({
    ...scope,
    deadline: xeroTenant.deadline,
    expectedBindingGeneration: xeroTenant.bindingGeneration,
    forceRefresh: true,
    previousAccessToken:
      xeroTenant.tokenVersion === null ? xeroTenant.accessToken : undefined,
    previousTokenVersion: xeroTenant.tokenVersion,
  });
  if (!refreshed.ok) {
    return {
      error: {
        ...classifyXeroFailure({
          dispatched: false,
          error: refreshed.error,
          isMutation,
        }),
        dispatchPhase: "before_dispatch",
        message: refreshed.error.message,
        retryAfterMs: refreshed.error.retryAfterMs,
      },
      ok: false,
    };
  }
  try {
    return await operation(toResolvedXeroTenant(scope, refreshed.value));
  } catch (error) {
    return { error: mapXeroTransportError(error, isMutation), ok: false };
  }
}
