import { database } from "@repo/database";
import {
  ensureFreshXeroConnection,
  markXeroConnectionStale,
} from "../oauth/service";
import type { XeroTenantForWrite, XeroWriteResult } from "../write/types";

export async function executeWithXeroAuthRecovery<T>(
  xeroTenant: XeroTenantForWrite,
  operation: (currentTenant: XeroTenantForWrite) => Promise<XeroWriteResult<T>>
): Promise<XeroWriteResult<T>> {
  const first = await operation(xeroTenant);
  if (!(isHttpAuthFailure(first, 401) || isHttpAuthFailure(first, 403))) {
    return first;
  }

  const connection = await database.xeroTenant.findFirst({
    select: { xero_connection_id: true },
    where: {
      clerk_org_id: xeroTenant.clerk_org_id,
      id: xeroTenant.id,
      organisation_id: xeroTenant.organisation_id,
    },
  });
  if (!connection) {
    return first;
  }

  if (isHttpAuthFailure(first, 403)) {
    await markXeroConnectionStale({
      clerkOrgId: xeroTenant.clerk_org_id,
      connectionId: connection.xero_connection_id,
      errorCode: "xero_permission_denied",
      errorMessage:
        "Xero rejected this connection's permissions or tenant access. Reconnect Xero after checking the authorising user's access.",
      organisationId: xeroTenant.organisation_id,
    });
    return first;
  }

  const refreshed = await ensureFreshXeroConnection({
    clerkOrgId: xeroTenant.clerk_org_id,
    connectionId: connection.xero_connection_id,
    forceRefresh: true,
    organisationId: xeroTenant.organisation_id,
    previousAccessTokenEncrypted:
      xeroTenant.xero_connection.access_token_encrypted,
  });
  if (!refreshed.ok) {
    return first;
  }

  const reloaded = await loadXeroTenantForRetry(xeroTenant);
  if (!reloaded) {
    return first;
  }
  const second = await operation(reloaded);
  if (isHttpAuthFailure(second, 401)) {
    await markXeroConnectionStale({
      clerkOrgId: xeroTenant.clerk_org_id,
      connectionId: connection.xero_connection_id,
      errorCode: "xero_auth_rejected_after_refresh",
      errorMessage:
        "Xero rejected the connection after a fresh token was issued. Reconnect Xero.",
      organisationId: xeroTenant.organisation_id,
    });
  } else if (isHttpAuthFailure(second, 403)) {
    await markXeroConnectionStale({
      clerkOrgId: xeroTenant.clerk_org_id,
      connectionId: connection.xero_connection_id,
      errorCode: "xero_permission_denied",
      errorMessage:
        "Xero rejected this connection's permissions or tenant access. Reconnect Xero after checking the authorising user's access.",
      organisationId: xeroTenant.organisation_id,
    });
  }
  return second;
}

function isHttpAuthFailure<T>(
  result: XeroWriteResult<T>,
  status: 401 | 403
): boolean {
  return (
    !result.ok &&
    (result.error.code === "auth_error" ||
      result.error.code === "permission_error") &&
    result.error.httpStatus === status
  );
}

async function loadXeroTenantForRetry(
  xeroTenant: XeroTenantForWrite
): Promise<XeroTenantForWrite | null> {
  return await database.xeroTenant.findFirst({
    select: {
      clerk_org_id: true,
      id: true,
      organisation_id: true,
      payroll_region: true,
      xero_connection: {
        select: {
          access_token_auth_tag: true,
          access_token_encrypted: true,
          access_token_iv: true,
          revoked_at: true,
          token_key_version: true,
        },
      },
      xero_tenant_id: true,
    },
    where: {
      clerk_org_id: xeroTenant.clerk_org_id,
      id: xeroTenant.id,
      organisation_id: xeroTenant.organisation_id,
      xero_connection: {
        disconnected_at: null,
        revoked_at: null,
        status: "active",
      },
    },
  });
}
