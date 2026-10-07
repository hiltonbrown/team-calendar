import "server-only";
import type { Prisma } from "../../generated/client";
import { database } from "../client";
import { type XeroScope, xeroScope } from "./xero-connections";
export async function advanceXeroSyncCursor(
  input: {
    scope: XeroScope;
    connectionId: string;
    entityType: "people" | "leave_records";
    expectedModifiedSince: Date | null;
    nextModifiedSince: Date;
  },
  tx: Prisma.TransactionClient = database
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
