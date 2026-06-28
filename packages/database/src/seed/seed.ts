import type { PrismaClient } from "../../generated/client";
import {
  DEFAULT_SEED_CLERK_ORG_ID,
  type OrganisationSeed,
  seedOrganisations,
} from "./data";
import { syncPlansFromCatalogue } from "./plan-sync";

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
}

const seedOrganisation = async (
  db: PrismaClient,
  clerkOrgId: string,
  org: OrganisationSeed
): Promise<void> => {
  await db.organisation.upsert({
    where: { id: org.id },
    create: {
      id: org.id,
      clerk_org_id: clerkOrgId,
      name: org.name,
      country_code: org.country_code,
      region_code: org.region_code,
      timezone: org.timezone,
      is_active: true,
    },
    update: {
      clerk_org_id: clerkOrgId,
      name: org.name,
      country_code: org.country_code,
      region_code: org.region_code,
      timezone: org.timezone,
    },
  });

  for (const team of org.teams) {
    await db.team.upsert({
      where: { id: team.id },
      create: {
        id: team.id,
        clerk_org_id: clerkOrgId,
        organisation_id: org.id,
        name: team.name,
      },
      update: {
        clerk_org_id: clerkOrgId,
        organisation_id: org.id,
        name: team.name,
      },
    });
  }

  for (const location of org.locations) {
    await db.location.upsert({
      where: { id: location.id },
      create: {
        id: location.id,
        clerk_org_id: clerkOrgId,
        organisation_id: org.id,
        name: location.name,
        country_code: location.country_code,
        region_code: location.region_code,
        timezone: location.timezone,
      },
      update: {
        clerk_org_id: clerkOrgId,
        organisation_id: org.id,
        name: location.name,
        country_code: location.country_code,
        region_code: location.region_code,
        timezone: location.timezone,
      },
    });
  }

  for (const person of org.people) {
    await db.person.upsert({
      where: {
        organisation_id_source_system_source_person_key: {
          organisation_id: org.id,
          source_system: person.source_system,
          source_person_key: person.source_person_key,
        },
      },
      create: {
        id: person.id,
        clerk_org_id: clerkOrgId,
        organisation_id: org.id,
        team_id: person.team_id,
        location_id: person.location_id,
        manager_person_id: person.manager_person_id,
        source_system: person.source_system,
        source_person_key: person.source_person_key,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
        job_title: person.job_title,
        employment_type: person.employment_type,
        person_type: person.person_type,
        xero_employee_id: person.xero_employee_id,
        is_active: true,
      },
      update: {
        clerk_org_id: clerkOrgId,
        team_id: person.team_id,
        location_id: person.location_id,
        manager_person_id: person.manager_person_id,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
        job_title: person.job_title,
        employment_type: person.employment_type,
        person_type: person.person_type,
        xero_employee_id: person.xero_employee_id,
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

  let teams = 0;
  let locations = 0;
  let people = 0;

  const planSummary = await syncPlansFromCatalogue(db);

  for (const org of seedOrganisations) {
    await seedOrganisation(db, clerkOrgId, org);
    teams += org.teams.length;
    locations += org.locations.length;
    people += org.people.length;
  }

  return {
    clerkOrgId,
    organisations: seedOrganisations.length,
    teams,
    locations,
    people,
    planLimits: planSummary.limits,
    plans: planSummary.plans,
  };
};
