import "server-only";
import type { Prisma } from "../../generated/client";
import { database } from "../client";
export async function saveXeroAuthorisation(
  data: Prisma.XeroAuthorisationUncheckedCreateInput,
  tx: Prisma.TransactionClient = database
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
