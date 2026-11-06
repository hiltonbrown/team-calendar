import { assertTenantDb, type TenantDb } from "../tenant-db";

export const resolveAccountCompanies = async (
  accountId: string,
  db: TenantDb
) => {
  assertTenantDb(db, accountId);
  const client = db;
  return await client.organisation.findMany({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { country_code: true, id: true, name: true, timezone: true },
    where: {
      account_id: accountId,
      archived_at: null,
      is_active: true,
      OR: [
        { xero_connection: null },
        { xero_connection: { released_at: null } },
      ],
    },
  });
};
