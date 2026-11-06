import "server-only";

import { withTenantDb } from "@repo/database";
import { systemDatabase } from "@repo/database/system";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";

async function hasCurrentMembership(
  accountId: string,
  userId: string
): Promise<boolean> {
  assertNoTenantTransaction("reconcileAccountPeople");
  return Boolean(
    await systemDatabase.authMember.findUnique({
      select: { id: true },
      where: { account_id_user_id: { account_id: accountId, user_id: userId } },
    })
  );
}

/** Membership links existing people only; payroll/company onboarding owns seats. */
export async function reconcileAccountPeople(
  user: { id: string; email: string | null; emailVerified: boolean },
  accountIds: readonly string[]
): Promise<void> {
  assertNoTenantTransaction("reconcileAccountPeople");
  if (!(user.emailVerified && user.email)) {
    return;
  }
  const { email } = user;
  for (const accountId of new Set(accountIds)) {
    if (!(await hasCurrentMembership(accountId, user.id))) {
      continue;
    }
    await withTenantDb(accountId, async (db) => {
      const companies = await db.organisation.findMany({
        select: { id: true },
        where: { account_id: accountId, archived_at: null },
      });
      for (const company of companies) {
        const linked = await db.person.findFirst({
          select: { id: true },
          where: {
            account_id: accountId,
            organisation_id: company.id,
            user_id: user.id,
          },
        });
        if (linked) {
          continue;
        }
        const candidates = await db.person.findMany({
          select: { id: true },
          take: 2,
          where: {
            account_id: accountId,
            archived_at: null,
            email: { equals: email, mode: "insensitive" },
            is_active: true,
            organisation_id: company.id,
            user_id: null,
          },
        });
        // An ambiguous email needs an explicit administrator match.
        if (candidates.length !== 1) {
          continue;
        }
        await db.person.updateMany({
          data: { user_id: user.id },
          where: {
            account_id: accountId,
            id: candidates[0].id,
            organisation_id: company.id,
            user_id: null,
          },
        });
      }
    });
    // A removal can commit and finish its clearing phase while this delayed
    // link is running. Recheck after commit and compensate for that ordering.
    if (!(await hasCurrentMembership(accountId, user.id))) {
      await clearAccountPeople(accountId, user.id);
    }
  }
}

/** Safe to retry after the identity membership has already been removed. */
export async function clearAccountPeople(
  accountId: string,
  userId: string
): Promise<void> {
  assertNoTenantTransaction("clearAccountPeople");
  await withTenantDb(accountId, (db) =>
    db.person.updateMany({
      data: { user_id: null },
      where: { account_id: accountId, user_id: userId },
    })
  );
}
