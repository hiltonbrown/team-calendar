import "server-only";
import { appError, type Result } from "@repo/core";
import type { Prisma } from "../../generated/client";
import { systemDatabase } from "../system-client";
export interface DueXeroAuthorisation {
  id: string;
  last_refreshed_at: Date;
  provider_app_id: string;
  xero_user_id: string;
}
export async function listDueXeroAuthorisations(
  now: Date,
  tx: Prisma.TransactionClient = systemDatabase
): Promise<Result<DueXeroAuthorisation[]>> {
  const due = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  try {
    const grants = await tx.xeroAuthorisation.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        last_refreshed_at: true,
        provider_app_id: true,
        xero_user_id: true,
      },
      where: {
        connections: {
          some: {
            disconnected_at: null,
            organisation: { archived_at: null, is_active: true },
            status: "active",
          },
        },
        last_refreshed_at: { lte: due },
        status: "active",
      },
    });
    return { ok: true, value: grants };
  } catch {
    return {
      error: appError("internal", "Failed to list due Xero authorisations"),
      ok: false,
    };
  }
}
export async function saveXeroAuthorisation(
  data: Prisma.XeroAuthorisationUncheckedCreateInput,
  tx: Prisma.TransactionClient = systemDatabase
) {
  const {
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...update
  } = data;
  return await tx.xeroAuthorisation.upsert({
    create: data,
    update,
    where: {
      provider_app_id_xero_user_id: {
        provider_app_id: data.provider_app_id,
        xero_user_id: data.xero_user_id,
      },
    },
  });
}
