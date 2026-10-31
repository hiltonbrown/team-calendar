import { assertTenantDb, type TenantDb } from "../tenant-db";

export type ManagerVisibilityScope = "all_team_leave" | "direct_reports_only";
const select = {
  account_id: true,
  created_at: true,
  id: true,
  manager_visibility_scope: true,
  updated_at: true,
} as const;

export async function getAccountSettings(accountId: string, db: TenantDb) {
  assertTenantDb(db, accountId);
  const existing = await db.accountSettings.findFirst({
    select,
    where: { account_id: accountId },
  });
  if (existing) {
    return existing;
  }
  await db.accountSettings.createMany({
    data: { account_id: accountId },
    skipDuplicates: true,
  });
  return db.accountSettings.findFirstOrThrow({
    select,
    where: { account_id: accountId },
  });
}

export async function updateAccountSettings(
  accountId: string,
  managerVisibilityScope: ManagerVisibilityScope,
  db: TenantDb
) {
  assertTenantDb(db, accountId);
  await getAccountSettings(accountId, db);
  await db.accountSettings.updateMany({
    data: { manager_visibility_scope: managerVisibilityScope },
    where: { account_id: accountId },
  });
  return db.accountSettings.findFirstOrThrow({
    select,
    where: { account_id: accountId },
  });
}
