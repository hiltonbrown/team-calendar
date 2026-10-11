import "server-only";
import type { Result } from "@repo/core";
import type { Prisma } from "../../generated/client";
import { systemDatabase } from "../system-client";
import { tenantDatabase } from "../tenant-client";
export interface XeroScope {
  clerkOrgId: string;
  organisationId: string;
}
export function xeroScope(input: XeroScope) {
  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
}
export async function getScopedXeroConnection(
  input: XeroScope & {
    connectionId?: string;
  },
  tx: Pick<Prisma.TransactionClient, "xeroConnection"> = tenantDatabase(
    input.clerkOrgId
  )
): Promise<
  Result<
    Prisma.XeroConnectionGetPayload<{
      include: {
        authorisation: true;
      };
    }>,
    {
      code: "not_connected";
      message: string;
    }
  >
> {
  const connection = await tx.xeroConnection.findFirst({
    where: {
      ...xeroScope(input),
      ...(input.connectionId ? { id: input.connectionId } : {}),
    },
  });
  if (!connection) {
    return {
      error: { code: "not_connected", message: "Xero is not connected." },
      ok: false,
    };
  }
  const authorisation = connection.xero_authorisation_id
    ? await systemDatabase.xeroAuthorisation.findUnique({
        where: { id: connection.xero_authorisation_id },
      })
    : null;
  return { ok: true, value: { ...connection, authorisation } };
}

export interface XeroProviderConnectionCapture {
  authorisationId: string;
  authorisationUpdatedAt: Date;
  lastConnectedAt: Date | null;
  remoteConnectionId: string;
}

// Provider I/O happens before this atomic update. A fresh reconnect or changed
// authorisation must invalidate the old probe even when its tenant is unchanged.
export async function markScopedXeroConnectionReconnectRequired(
  input: XeroScope &
    XeroProviderConnectionCapture & {
      connectionId: string;
      xeroTenantId: string;
    },
  tx: Pick<Prisma.TransactionClient, "xeroConnection"> = tenantDatabase(
    input.clerkOrgId
  )
): Promise<boolean> {
  const connection = await tx.xeroConnection.findFirst({
    select: { id: true },
    where: { ...xeroScope(input), id: input.connectionId },
  });
  if (!connection) {
    return false;
  }
  // This credential-lifecycle mutation must compare the grant timestamp in the
  // same SQL statement; a separate grant read permits a concurrent rotation.
  const changed = await systemDatabase.xeroConnection.updateMany({
    data: {
      last_error_code: "reauthorisation_required",
      last_error_message: "Reconnect Xero to continue.",
      status: "reconnect_required",
    },
    where: {
      ...xeroScope(input),
      authorisation: {
        status: "active",
        updated_at: input.authorisationUpdatedAt,
      },
      disconnected_at: null,
      id: input.connectionId,
      last_connected_at: input.lastConnectedAt,
      remote_connection_id: input.remoteConnectionId,
      status: "active",
      xero_authorisation_id: input.authorisationId,
      xero_tenant_id: input.xeroTenantId,
    },
  });
  return changed.count === 1;
}

/** Resolve the tenant connection before reading its credential owner's health. */
export async function getScopedXeroAuthorisationMetadata(
  input: XeroScope & { connectionId?: string },
  client: Pick<Prisma.TransactionClient, "xeroConnection"> = tenantDatabase(
    input.clerkOrgId
  )
): Promise<{ status: string; last_refreshed_at: Date | null } | null> {
  const connection = await client.xeroConnection.findFirst({
    select: { xero_authorisation_id: true },
    where: {
      ...xeroScope(input),
      ...(input.connectionId ? { id: input.connectionId } : {}),
    },
  });
  if (!connection?.xero_authorisation_id) {
    return null;
  }
  return await systemDatabase.xeroAuthorisation.findUnique({
    select: { last_refreshed_at: true, status: true },
    where: { id: connection.xero_authorisation_id },
  });
}
