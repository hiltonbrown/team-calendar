import "server-only";

import { tenantDatabase } from "@repo/database";
import {
  toXeroPersonMatchView,
  type XeroPersonMatchView,
  xeroPersonMatchSelect,
} from "@/app/(authenticated)/settings/integrations/xero/matches/_match-view";

export const INLINE_MATCH_LIMIT = 10;
const ROSTER_LIMIT = 200;

export interface RosterPerson {
  email: string;
  hasDirectReports: boolean;
  id: string;
  name: string;
}

export interface OnboardingPeopleData {
  actingPerson: { id: string; name: string } | null;
  inviteRoster: RosterPerson[];
  matches: XeroPersonMatchView[];
  peopleCount: number;
  selfCandidates: RosterPerson[];
}

// Everything the People and Invite steps show, scoped to one organisation.
export async function loadOnboardingPeople(input: {
  clerkOrgId: string;
  organisationId: string;
  userId: string;
}): Promise<OnboardingPeopleData> {
  const scope = {
    archived_at: null,
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
  const [peopleCount, actingPerson, matches, unlinked, managers] =
    await Promise.all([
      tenantDatabase(input.clerkOrgId).person.count({ where: scope }),
      tenantDatabase(input.clerkOrgId).person.findFirst({
        select: { first_name: true, id: true, last_name: true },
        where: { ...scope, clerk_user_id: input.userId },
      }),
      tenantDatabase(input.clerkOrgId).xeroPersonMatch.findMany({
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: xeroPersonMatchSelect,
        // One extra row tells the step to link to the full matches page.
        take: INLINE_MATCH_LIMIT + 1,
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          status: "pending",
        },
      }),
      tenantDatabase(input.clerkOrgId).person.findMany({
        orderBy: [{ first_name: "asc" }, { last_name: "asc" }],
        select: { email: true, first_name: true, id: true, last_name: true },
        take: ROSTER_LIMIT,
        where: { ...scope, clerk_user_id: null, is_active: true },
      }),
      tenantDatabase(input.clerkOrgId).person.findMany({
        distinct: ["manager_person_id"],
        select: { manager_person_id: true },
        where: { ...scope, is_active: true, manager_person_id: { not: null } },
      }),
    ]);
  const managerIds = new Set(
    managers.flatMap((row) =>
      row.manager_person_id ? [row.manager_person_id] : []
    )
  );
  const roster = unlinked.map((person) => ({
    email: person.email,
    hasDirectReports: managerIds.has(person.id),
    id: person.id,
    name: [person.first_name, person.last_name].filter(Boolean).join(" "),
  }));
  return {
    actingPerson: actingPerson
      ? {
          id: actingPerson.id,
          name: [actingPerson.first_name, actingPerson.last_name]
            .filter(Boolean)
            .join(" "),
        }
      : null,
    inviteRoster: roster.filter((person) => person.email.includes("@")),
    matches: matches.map(toXeroPersonMatchView),
    peopleCount,
    selfCandidates: roster,
  };
}
