import { assertTenantDb, type TenantDb } from "../tenant-db";

export const resolveAccountCompanies = async (
  clerkOrgId: string,
  db: TenantDb
) => {
  assertTenantDb(db, clerkOrgId);
  const client = db;
  return await client.organisation.findMany({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { country_code: true, id: true, name: true, timezone: true },
    where: {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      is_active: true,
      OR: [
        { xero_connection: null },
        { xero_connection: { released_at: null } },
      ],
    },
  });
};
