import { resolveXeroAccess } from "../oauth/authorisation";
import { verifyXeroProviderConnection } from "../oauth/provider-connection";
import type {
  XeroAccessContext,
  XeroWriteError,
  XeroWriteResult,
} from "../write/types";
import {
  classifyXeroFailure,
  mapXeroTransportError,
} from "./classify-xero-failure";
import { toResolvedXeroConnection } from "./resolved-tenant";

function isDefiniteAuthFailure(error: XeroWriteError): boolean {
  return (
    error.code === "auth_error" &&
    error.httpStatus === 401 &&
    (error.recoveryReason === undefined ||
      error.recoveryReason === "reauthorise") &&
    error.dispatchPhase !== "before_dispatch"
  );
}

export async function executeWithXeroAuthRecovery<T>(
  xeroConnection: XeroAccessContext,
  operation: (currentTenant: XeroAccessContext) => Promise<XeroWriteResult<T>>,
  isMutation = false
): Promise<XeroWriteResult<T>> {
  const dispatchState = { accessToken: xeroConnection.accessToken };
  const initial = { ...xeroConnection, dispatchState };
  let first: XeroWriteResult<T>;
  try {
    first = await operation(initial);
  } catch (error) {
    return { error: mapXeroTransportError(error, isMutation), ok: false };
  }
  if (first.ok || !isDefiniteAuthFailure(first.error)) {
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
    previousAccessToken: dispatchState.accessToken,
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
  const current = toResolvedXeroConnection(scope, refreshed.value);
  let second: XeroWriteResult<T>;
  try {
    second = await operation(current);
  } catch (error) {
    return { error: mapXeroTransportError(error, isMutation), ok: false };
  }
  if (!second.ok && isDefiniteAuthFailure(second.error)) {
    const status = await verifyXeroProviderConnection(current, true);
    if (status === "reconnect_required") {
      return {
        error: {
          ...second.error,
          message: "Reconnect Xero to continue.",
          recoveryReason: "reauthorise",
        },
        ok: false,
      };
    }
  }
  return second;
}
