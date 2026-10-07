import "server-only";
import type { Prisma } from "../generated/client";
import { database } from "./client";
import { type XeroScope, xeroScope } from "./queries/xero-connections";
export async function lockXeroAuthorisation(
  tx: Prisma.TransactionClient,
  appId: string,
  xeroUserId: string
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-authorisation:${appId}:${xeroUserId}`}, 0))::text`;
}
export async function withXeroGrantLock<T>(
  input: {
    providerAppId: string;
    mode: "code" | "refresh";
    xeroUserId?: string;
    deadlineAt: number;
  },
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (input.mode === "refresh" && !input.xeroUserId) {
    throw new Error("Refresh requires verified Xero user identity");
  }
  const remaining = Math.min(15_000, input.deadlineAt - Date.now());
  if (remaining <= 0) {
    throw new Error("Xero operation deadline expired");
  }
  return await database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('lock_timeout', ${`${remaining}ms`}, true)`;
      const key = `xero-app:${input.providerAppId}`;
      if (input.mode === "code") {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      } else {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))::text`;
      }
      if (input.xeroUserId) {
        await lockXeroAuthorisation(tx, input.providerAppId, input.xeroUserId);
      }
      return await work(tx);
    },
    { maxWait: remaining, timeout: remaining }
  );
}
export async function withScopedXeroConnectionLock<T>(
  scope: XeroScope & {
    connectionId: string;
  },
  deadlineAt: number,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const remaining = Math.min(15_000, deadlineAt - Date.now());
  if (remaining <= 0) {
    throw new Error("Xero operation deadline expired");
  }
  return await database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('lock_timeout', ${`${remaining}ms`}, true)`;
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
        }>
      >`SELECT id FROM xero_connections WHERE id = ${scope.connectionId}::uuid AND clerk_org_id = ${scope.clerkOrgId} AND organisation_id = ${scope.organisationId}::uuid FOR UPDATE`;
      if (
        rows.length !== 1 ||
        !(await tx.xeroConnection.findFirst({
          where: { ...xeroScope(scope), id: scope.connectionId },
        }))
      ) {
        throw new Error("Xero connection not found");
      }
      return await work(tx);
    },
    { maxWait: remaining, timeout: remaining }
  );
}
