import "server-only";
import {
  getScopedXeroConnection,
  markScopedXeroConnectionReconnectRequired,
} from "@repo/database/queries/xero-connections";
import { z } from "zod";
import { xeroFetch } from "../rate-limit/xero-fetch";
import type { XeroAccessContext } from "../write/types";

const inventorySchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      tenantId: z.string().uuid(),
      tenantName: z.string().trim().min(1),
      tenantType: z.string().trim().min(1),
    })
  )
  .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length);

export type XeroProviderConnectionStatus =
  | "present"
  | "reconnect_required"
  | "connection_changed"
  | "inconclusive";

// No refresh authority here: callers supply the access resolved for their one
// allowed replay. An unreadable inventory never establishes loss of access.
export async function verifyXeroProviderConnection(
  context: XeroAccessContext,
  definiteTenantAuthFailure = false
): Promise<XeroProviderConnectionStatus> {
  const captured = context.providerConnection;
  if (!captured) {
    return "inconclusive";
  }
  try {
    const scope = {
      clerkOrgId: context.clerk_org_id,
      connectionId: context.id,
      organisationId: context.organisation_id,
    };
    const scoped = await getScopedXeroConnection(scope);
    if (!scoped.ok) {
      return "connection_changed";
    }
    const current = scoped.value;
    if (
      current.status !== "active" ||
      current.disconnected_at !== null ||
      current.xero_authorisation_id !== captured.authorisationId ||
      current.remote_connection_id !== captured.remoteConnectionId ||
      current.xero_tenant_id !== context.xero_tenant_id ||
      current.last_connected_at?.getTime() !==
        captured.lastConnectedAt?.getTime() ||
      current.authorisation?.status !== "active" ||
      current.authorisation.updated_at.getTime() !==
        captured.authorisationUpdatedAt.getTime()
    ) {
      return "connection_changed";
    }
    const response = await xeroFetch({
      deadline: context.deadline,
      init: {
        headers: { Authorization: `Bearer ${context.accessToken}` },
        method: "GET",
      },
      maxAttempts: 1,
      rateClass: {
        kind: "user_inventory",
        providerAppId: current.authorisation.provider_app_id,
      },
      url: "https://api.xero.com/connections",
    });
    if (
      response.status !== 200 ||
      response.headers.has("content-range") ||
      response.headers.has("link")
    ) {
      return "inconclusive";
    }
    const inventory = inventorySchema.safeParse(await response.json());
    if (!inventory.success) {
      return "inconclusive";
    }
    const present = inventory.data.some(
      (row) =>
        row.id === captured.remoteConnectionId &&
        row.tenantId === context.xero_tenant_id
    );
    if (present && !definiteTenantAuthFailure) {
      return "present";
    }
    const changed = await markScopedXeroConnectionReconnectRequired({
      ...scope,
      ...captured,
      xeroTenantId: context.xero_tenant_id,
    });
    return changed ? "reconnect_required" : "connection_changed";
  } catch {
    return "inconclusive";
  }
}
