import "server-only";
import type { Result } from "@repo/core";
import type { Prisma } from "../../generated/client";
import { database } from "../client";
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
  tx: Prisma.TransactionClient = database
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
    include: { authorisation: true },
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
  return { ok: true, value: connection };
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
  tx: Prisma.TransactionClient = database
): Promise<boolean> {
  const changed = await tx.xeroConnection.updateMany({
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
