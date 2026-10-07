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
