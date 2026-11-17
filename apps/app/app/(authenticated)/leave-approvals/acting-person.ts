import { assertTenantDb, type TenantDb } from "@repo/database";
import { log } from "@repo/observability/log";

export async function resolveApprovalActingPerson(
  accountId: string,
  userId: string,
  companyIds: string[],
  db: TenantDb
): Promise<{ id: string } | null> {
  assertTenantDb(db, accountId);
  const people = await db.person.findMany({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 2,
    where: {
      account_id: accountId,
      archived_at: null,
      organisation_id: { in: companyIds },
      user_id: userId,
    },
  });
  const person = people[0] ?? null;
  if (people.length > 1) {
    log.warn("Multiple person records match the approval actor", {
      accountId,
      selectedPersonId: person?.id,
    });
  }
  return person;
}
