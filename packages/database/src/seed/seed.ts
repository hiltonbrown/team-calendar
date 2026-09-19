import type { PrismaClient } from "../../generated/client";
import {
  DEFAULT_SEED_CLERK_ORG_ID,
  type OrganisationSeed,
  seedOrganisations,
} from "./data";
import { type PlanSeedDefinition, syncPlansFromCatalogue } from "./plan-sync";

export interface SeedSummary {
  clerkOrgId: string;
  locations: number;
  organisations: number;
  people: number;
  planLimits: number;
  plans: number;
  teams: number;
}

export interface SeedOptions {
  /**
   * Clerk Organisation id every seeded row is scoped to. For the app to render a
   * seeded tenant, this must match a real Clerk Organisation id (see README dev
   * setup). Falls back to DEFAULT_SEED_CLERK_ORG_ID when absent.
   */
  clerkOrgId?: string | undefined;
  organisations?: readonly OrganisationSeed[] | undefined;
  plans?: readonly PlanSeedDefinition[] | undefined;
}

const seedOrganisation = async (
  db: PrismaClient,
  clerkOrgId: string,
  org: OrganisationSeed
): Promise<void> => {
  await db.organisation.upsert({
    create: {
      clerk_org_id: clerkOrgId,
      country_code: org.country_code,
      id: org.id,
      is_active: true,
      name: org.name,
      region_code: org.region_code,
      timezone: org.timezone,
    },
    update: {
      clerk_org_id: clerkOrgId,
      country_code: org.country_code,
      name: org.name,
      region_code: org.region_code,
      timezone: org.timezone,
    },
    where: { id: org.id },
  });

  for (const team of org.teams) {
    await db.team.upsert({
      create: {
        clerk_org_id: clerkOrgId,
        id: team.id,
        name: team.name,
        organisation_id: org.id,
      },
      update: {
        clerk_org_id: clerkOrgId,
        name: team.name,
        organisation_id: org.id,
      },
      where: { id: team.id },
    });
  }

  for (const location of org.locations) {
    await db.location.upsert({
      create: {
        clerk_org_id: clerkOrgId,
        country_code: location.country_code,
        id: location.id,
        name: location.name,
        organisation_id: org.id,
        region_code: location.region_code,
        timezone: location.timezone,
      },
      update: {
        clerk_org_id: clerkOrgId,
        country_code: location.country_code,
        name: location.name,
        organisation_id: org.id,
        region_code: location.region_code,
        timezone: location.timezone,
      },
      where: { id: location.id },
    });
  }

  for (const person of org.people) {
    await db.person.upsert({
      create: {
        clerk_org_id: clerkOrgId,
        email: person.email,
        employment_type: person.employment_type,
        first_name: person.first_name,
        id: person.id,
        is_active: true,
        job_title: person.job_title,
        last_name: person.last_name,
        location_id: person.location_id,
        manager_person_id: person.manager_person_id,
        organisation_id: org.id,
        person_type: person.person_type,
        source_person_key: person.source_person_key,
        source_system: person.source_system,
        team_id: person.team_id,
        xero_employee_id: person.xero_employee_id,
      },
      update: {
        clerk_org_id: clerkOrgId,
        email: person.email,
        employment_type: person.employment_type,
        first_name: person.first_name,
        job_title: person.job_title,
        last_name: person.last_name,
        location_id: person.location_id,
        manager_person_id: person.manager_person_id,
        person_type: person.person_type,
        team_id: person.team_id,
        xero_employee_id: person.xero_employee_id,
      },
      where: {
        organisation_id_source_system_source_person_key: {
          organisation_id: org.id,
          source_person_key: person.source_person_key,
          source_system: person.source_system,
        },
      },
    });
  }
};

/**
 * Idempotently upserts the development seed dataset: one Clerk Organisation worth
 * of organisations, teams, locations and people. Re-running creates no duplicates.
 * Seeds canonical data only; never writes Xero tokens or any other secret.
 */
export const seedDevelopmentData = async (
  db: PrismaClient,
  options: SeedOptions = {}
): Promise<SeedSummary> => {
  const clerkOrgId = options.clerkOrgId ?? DEFAULT_SEED_CLERK_ORG_ID;
  const organisations = options.organisations ?? seedOrganisations;

  let teams = 0;
  let locations = 0;
  let people = 0;

  const planSummary = await syncPlansFromCatalogue(db, options.plans);

  for (const org of organisations) {
    await seedOrganisation(db, clerkOrgId, org);
    teams += org.teams.length;
    locations += org.locations.length;
    people += org.people.length;
  }

  return {
    clerkOrgId,
    locations,
    organisations: organisations.length,
    people,
    planLimits: planSummary.limits,
    plans: planSummary.plans,
    teams,
  };
};
