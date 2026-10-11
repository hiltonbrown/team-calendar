import "server-only";

import { tenantDatabase } from "@repo/database";
import { getSettings } from "./organisation-settings-service";

export async function managerScopePersonIds(input: {
  actingPersonId: string;
  clerkOrgId: string;
  excludeSelf?: boolean;
  organisationId: string;
}): Promise<string[]> {
  const [settingsResult, people] = await Promise.all([
    getSettings({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    }),
    tenantDatabase(input.clerkOrgId).person.findMany({
      orderBy: { id: "asc" },
      select: { id: true, manager_person_id: true },
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    }),
  ]);

  if (!settingsResult.ok) {
    return input.excludeSelf ? [] : [input.actingPersonId];
  }

  const personIds =
    settingsResult.value.managerVisibilityScope === "all_team_leave"
      ? [
          input.actingPersonId,
          ...transitiveReportIds(people, input.actingPersonId),
        ]
      : [
          input.actingPersonId,
          ...people
            .filter(
              (person) => person.manager_person_id === input.actingPersonId
            )
            .map((person) => person.id),
        ];

  return input.excludeSelf
    ? personIds.filter((personId) => personId !== input.actingPersonId)
    : personIds;
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
