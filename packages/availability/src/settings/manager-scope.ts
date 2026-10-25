import "server-only";
import {
  assertTenantDb,
  getAccountSettings,
  resolveAccountCompanies,
  type TenantDb,
} from "@repo/database";

export async function managerScopePersonIds(
  input: {
    actingPersonId: string;
    accountId: string;
    excludeSelf?: boolean;
  },
  db: TenantDb
): Promise<string[]> {
  {
    assertTenantDb(db, input.accountId);
    const tenantDb = db;

    const companyIds = (
      await resolveAccountCompanies(input.accountId, tenantDb)
    ).map((company) => company.id);
    const settings = await getAccountSettings(input.accountId, tenantDb);
    const people = await tenantDb.person.findMany({
      orderBy: { id: "asc" },
      select: { id: true, manager_person_id: true },
      where: {
        account_id: input.accountId,
        archived_at: null,
        organisation_id: { in: companyIds },
      },
    });
    if (!people.some((person) => person.id === input.actingPersonId)) {
      return [];
    }
    const reports =
      settings.manager_visibility_scope === "all_team_leave"
        ? transitiveReportIds(people, input.actingPersonId)
        : people
            .filter(
              (person) => person.manager_person_id === input.actingPersonId
            )
            .map((person) => person.id);
    return input.excludeSelf ? reports : [input.actingPersonId, ...reports];
  }
}

function transitiveReportIds(
  people: ReadonlyArray<{ id: string; manager_person_id: string | null }>,
  managerId: string
): string[] {
  const byManager = new Map<string, string[]>();
  for (const person of people) {
    if (!person.manager_person_id) {
      continue;
    }
    byManager.set(person.manager_person_id, [
      ...(byManager.get(person.manager_person_id) ?? []),
      person.id,
    ]);
  }

  const queue = [...(byManager.get(managerId) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const next = queue.shift();
    if (!(next && !seen.has(next) && next !== managerId)) {
      continue;
    }
    seen.add(next);
    queue.push(...(byManager.get(next) ?? []));
  }

  return [...seen];
}
