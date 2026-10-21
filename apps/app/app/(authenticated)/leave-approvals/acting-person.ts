import { assertTenantDb, type TenantDb } from "@repo/database";
import { log } from "@repo/observability/log";

export async function resolveApprovalActingPerson(
  clerkOrgId: string,
  clerkUserId: string,
  companyIds: string[],
  db: TenantDb
): Promise<{ id: string } | null> {
  assertTenantDb(db, clerkOrgId);
  const people = await db.person.findMany({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 2,
    where: {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      clerk_user_id: clerkUserId,
      organisation_id: { in: companyIds },
    },
  });
  const person = people[0] ?? null;
  if (people.length > 1) {
    log.warn("Multiple person records match the approval actor", {
      clerkOrgId,
      selectedPersonId: person?.id,
    });
  }
  return person;
}
