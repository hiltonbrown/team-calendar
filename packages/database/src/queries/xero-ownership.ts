import type { Prisma } from "../../generated/client";
import { systemDatabase } from "../system-client";

export type XeroTenantOwnership =
  | { status: "unowned" }
  | { status: "owned_elsewhere" }
  | { status: "same_account"; connectionId: string; organisationId: string };

const classify = (
  accountId: string,
  owner: { id: string; account_id: string; organisation_id: string } | null
): XeroTenantOwnership => {
  if (!owner) {
    return { status: "unowned" };
  }
  if (owner.account_id !== accountId) {
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
  scope: { accountId: string; organisationId?: string },
  tenantId: string
): Promise<XeroTenantOwnership> => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-tenant:${tenantId}`}, 0))::text`;
  const owner = await systemDatabase.xeroConnection.findFirst({
    select: { account_id: true, id: true, organisation_id: true },
    where: { released_at: null, xero_tenant_id: tenantId },
  });
  return classify(scope.accountId, owner);
};

/** Picker classification is advisory; selection always claims under the lock. */
export const listXeroTenantOwnership = async (
  accountId: string,
  tenantIds: string[]
): Promise<Map<string, XeroTenantOwnership>> => {
  const owners = await systemDatabase.xeroConnection.findMany({
    select: {
      account_id: true,
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
      classify(accountId, byTenant.get(tenantId) ?? null),
    ])
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const OPAQUE_OWNERSHIP_MESSAGES = new Set([
  'duplicate key value violates unique constraint "xero_connections_owned_tenant_key"',
  'duplicate key value violates unique constraint "xero_connections_owned_remote_connection_key"',
]);

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
  if (!(isRecord(adapter) && isRecord(adapter.cause))) {
    return false;
  }
  if (!isRecord(adapter.cause.constraint)) {
    // RLS can suppress PostgreSQL detail fields for another account's row.
    return (
      adapter.cause.constraint === undefined &&
      error.meta.modelName === "XeroConnection" &&
      adapter.cause.kind === "UniqueConstraintViolation" &&
      adapter.cause.originalCode === "23505" &&
      typeof adapter.cause.originalMessage === "string" &&
      OPAQUE_OWNERSHIP_MESSAGES.has(adapter.cause.originalMessage)
    );
  }
  const { fields, index } = adapter.cause.constraint;
  return (
    index === "xero_connections_owned_tenant_key" ||
    index === "xero_connections_owned_remote_connection_key" ||
    (Array.isArray(fields) &&
      fields.length === 1 &&
      (fields[0] === "xero_tenant_id" || fields[0] === "remote_connection_id"))
  );
};
