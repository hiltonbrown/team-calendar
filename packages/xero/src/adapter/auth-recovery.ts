import { resolveXeroAccess } from "../oauth/authorisation";
import type { XeroAccessContext, XeroWriteResult } from "../write/types";
import {
  classifyXeroFailure,
  mapXeroTransportError,
} from "./classify-xero-failure";
import { toResolvedXeroConnection } from "./resolved-tenant";
export async function executeWithXeroAuthRecovery<T>(
  xeroConnection: XeroAccessContext,
  operation: (currentTenant: XeroAccessContext) => Promise<XeroWriteResult<T>>,
  isMutation = false
): Promise<XeroWriteResult<T>> {
  let first: XeroWriteResult<T>;
  try {
    first = await operation(xeroConnection);
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
    capability: xeroConnection.capability,
    clerkOrgId: xeroConnection.clerk_org_id,
    organisationId: xeroConnection.organisation_id,
  };
  const refreshed = await resolveXeroAccess({
    ...scope,
    connectionId: xeroConnection.id,
    deadline: xeroConnection.deadline,
    previousAccessToken: xeroConnection.accessToken,
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
    return await operation(toResolvedXeroConnection(scope, refreshed.value));
  } catch (error) {
    return { error: mapXeroTransportError(error, isMutation), ok: false };
  }
}
