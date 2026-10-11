import type { Prisma } from "../../generated/client";
import { systemDatabase } from "../system-client";

export type XeroTenantOwnership =
  | { status: "unowned" }
  | { status: "owned_elsewhere" }
  | { status: "same_account"; connectionId: string; organisationId: string };

const classify = (
  clerkOrgId: string,
  owner: { id: string; clerk_org_id: string; organisation_id: string } | null
): XeroTenantOwnership => {
  if (!owner) {
    return { status: "unowned" };
  }
  if (owner.clerk_org_id !== clerkOrgId) {
    return { status: "owned_elsewhere" };
  }
  return {
    connectionId: owner.id,
    organisationId: owner.organisation_id,
    status: "same_account",
  };
};

/** Call and insert in the same transaction; its lock survives until commit. */
export const claimXeroTenant = async (
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: { clerkOrgId: string; organisationId?: string },
  tenantId: string
): Promise<XeroTenantOwnership> => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-tenant:${tenantId}`}, 0))::text`;
  const owner = await systemDatabase.xeroConnection.findFirst({
    select: { clerk_org_id: true, id: true, organisation_id: true },
    where: { released_at: null, xero_tenant_id: tenantId },
  });
  return classify(scope.clerkOrgId, owner);
};

/** Picker classification is advisory; selection always claims under the lock. */
export const listXeroTenantOwnership = async (
  clerkOrgId: string,
  tenantIds: string[]
): Promise<Map<string, XeroTenantOwnership>> => {
  const owners = await systemDatabase.xeroConnection.findMany({
    select: {
      clerk_org_id: true,
      id: true,
      organisation_id: true,
      xero_tenant_id: true,
    },
    where: { released_at: null, xero_tenant_id: { in: tenantIds } },
  });
  const byTenant = new Map(
    owners.map((owner) => [owner.xero_tenant_id, owner])
  );
  return new Map(
    tenantIds.map((tenantId) => [
      tenantId,
      classify(clerkOrgId, byTenant.get(tenantId) ?? null),
    ])
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isXeroTenantBindingConflict = (error: unknown): boolean => {
  if (!isRecord(error) || error.code !== "P2002" || !isRecord(error.meta)) {
    return false;
  }
  const { target } = error.meta;
  if (typeof target === "string" || Array.isArray(target)) {
    const fields = String(target);
    if (
      fields.includes("xero_tenant_id") ||
      fields.includes("remote_connection_id") ||
      fields.includes("xero_connections_owned_")
    ) {
      return true;
    }
  }
  const adapter = error.meta.driverAdapterError;
  if (
    !(
      isRecord(adapter) &&
      isRecord(adapter.cause) &&
      isRecord(adapter.cause.constraint)
    )
  ) {
    return false;
  }
  return (
    adapter.cause.constraint.index === "xero_connections_owned_tenant_key" ||
    adapter.cause.constraint.index ===
      "xero_connections_owned_remote_connection_key"
  );
};
