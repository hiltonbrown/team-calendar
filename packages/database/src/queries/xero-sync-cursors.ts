import "server-only";
import type { Prisma } from "../../generated/client";
import { tenantDatabase, tenantTransaction } from "../tenant-client";
import {
  getScopedXeroAuthorisationMetadata,
  type XeroScope,
  xeroScope,
} from "./xero-connections";
export async function advanceXeroSyncCursor(
  input: {
    scope: XeroScope;
    connectionId: string;
    entityType: "people" | "leave_records";
    expectedModifiedSince: Date | null;
    nextModifiedSince: Date;
  },
  tx: Pick<
    Prisma.TransactionClient,
    "xeroSyncCursor" | "xeroConnection" | "$queryRaw"
  > = tenantDatabase(input.scope.clerkOrgId)
) {
  if (
    input.expectedModifiedSince &&
    input.nextModifiedSince <= input.expectedModifiedSince
  ) {
    return false;
  }
  const where = {
    ...xeroScope(input.scope),
    entity_type: input.entityType,
    xero_connection_id: input.connectionId,
  };
  const existing = await tx.xeroSyncCursor.findFirst({ where });
  if (!existing) {
    if (input.expectedModifiedSince) {
      return false;
    }
    const connection = await tx.xeroConnection.findFirst({
      select: { id: true },
      where: { ...xeroScope(input.scope), id: input.connectionId },
    });
    if (!connection) {
      return false;
    }
    const created = await tx.xeroSyncCursor.createMany({
      data: { ...where, modified_since: input.nextModifiedSince },
      skipDuplicates: true,
    });
    return created.count === 1;
  }
  const result = await tx.xeroSyncCursor.updateMany({
    data: { modified_since: input.nextModifiedSince },
    where: {
      ...where,
      id: existing.id,
      modified_since: input.expectedModifiedSince,
    },
  });
  return result.count === 1;
}

/** Reuse the saved reconnect/import request; enqueue failures must not mint a new request. */
export async function ensureXeroInitialSyncRequested(
  input: XeroScope & { connectionId: string }
): Promise<string | null> {
  return await tenantTransaction(input.clerkOrgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM xero_connections WHERE id = ${input.connectionId}::uuid AND clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${input.organisationId}::uuid FOR UPDATE`;
    const grant = await getScopedXeroAuthorisationMetadata(input, tx);
    if (grant?.status !== "active") {
      return null;
    }
    const where = {
      ...xeroScope(input),
      id: input.connectionId,
      status: "active" as const,
      sync_paused_at: null,
    };
    const connection = await tx.xeroConnection.findFirst({
      select: { initial_sync_requested_at: true },
      where,
    });
    if (!connection) {
      return null;
    }
    if (connection.initial_sync_requested_at) {
      return connection.initial_sync_requested_at.toISOString();
    }
    const requestedAt = new Date();
    const changed = await tx.xeroConnection.updateMany({
      data: {
        balance_next_person_id: null,
        balance_sweep_failed: false,
        initial_sync_completed_at: null,
        initial_sync_requested_at: requestedAt,
      },
      where: { ...where, initial_sync_requested_at: null },
    });
    return changed.count === 1 ? requestedAt.toISOString() : null;
  });
}

export async function completeXeroInitialSync(
  input: XeroScope & { connectionId: string; requestedAt: string },
  tx: Pick<
    Prisma.TransactionClient,
    "xeroSyncCursor" | "xeroConnection" | "$queryRaw"
  > = tenantDatabase(input.clerkOrgId)
): Promise<Date | null> {
  const grant = await getScopedXeroAuthorisationMetadata(input, tx);
  if (grant?.status !== "active") {
    return null;
  }
  const completedAt = new Date();
  const changed = await tx.xeroConnection.updateMany({
    data: { initial_sync_completed_at: completedAt },
    where: {
      ...xeroScope(input),
      balance_next_person_id: null,
      balance_sweep_failed: false,
      id: input.connectionId,
      initial_sync_completed_at: null,
      initial_sync_requested_at: new Date(input.requestedAt),
      status: "active",
      sync_paused_at: null,
    },
  });
  if (changed.count === 1) {
    return completedAt;
  }
  const stored = await tx.xeroConnection.findFirst({
    select: { initial_sync_completed_at: true },
    where: {
      ...xeroScope(input),
      id: input.connectionId,
      initial_sync_completed_at: { not: null },
      initial_sync_requested_at: new Date(input.requestedAt),
      status: "active",
    },
  });
  return stored?.initial_sync_completed_at ?? null;
}
