import { assertTenantDb, type TenantDb } from "../tenant-db";

export type ManagerVisibilityScope = "all_team_leave" | "direct_reports_only";
const select = {
  clerk_org_id: true,
  created_at: true,
  id: true,
  manager_visibility_scope: true,
  updated_at: true,
} as const;

export async function getAccountSettings(clerkOrgId: string, db: TenantDb) {
  assertTenantDb(db, clerkOrgId);
  const existing = await db.accountSettings.findFirst({
    select,
    where: { clerk_org_id: clerkOrgId },
  });
  if (existing) {
    return existing;
  }
  await db.accountSettings.createMany({
    data: { clerk_org_id: clerkOrgId },
    skipDuplicates: true,
  });
  return db.accountSettings.findFirstOrThrow({
    select,
    where: { clerk_org_id: clerkOrgId },
  });
}

export async function updateAccountSettings(
  clerkOrgId: string,
  managerVisibilityScope: ManagerVisibilityScope,
  db: TenantDb
) {
  assertTenantDb(db, clerkOrgId);
  await getAccountSettings(clerkOrgId, db);
  await db.accountSettings.updateMany({
    data: { manager_visibility_scope: managerVisibilityScope },
    where: { clerk_org_id: clerkOrgId },
  });
  return db.accountSettings.findFirstOrThrow({
    select,
    where: { clerk_org_id: clerkOrgId },
  });
}
