import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "../live-test-fixture";
import type { OrganisationSeed } from "./data";
import type { PlanSeedDefinition } from "./plan-sync";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/src/seed/seed.integration.test.ts"
);
const { database } = await import("../../index.js");
const { seedDevelopmentData } = await import("./seed.js");
const clerkOrgId = fixture.tenants[0]?.clerkOrgId as string;
const organisationIds = fixture.tenants.map((tenant) => tenant.organisationId);
const planIds = [0, 1, 2].map((index) => fixture.globalKey("plan_id", index));
const planKeys = [0, 1, 2].map((index) => fixture.globalKey("plan_key", index));

const organisations: OrganisationSeed[] = organisationIds.map(
  (organisationId, index) => {
    const teamId = fixture.id("team", index);
    const locationId = fixture.id("location", index);
    return {
      country_code: "AU",
      id: organisationId,
      locations: [
        {
          country_code: "AU",
          id: locationId,
          name: `Release location ${index}`,
          region_code: "QLD",
          timezone: "Australia/Brisbane",
        },
      ],
      name: `Release organisation ${index}`,
      people: [
        {
          email: `${fixture.key("person", index)}@example.invalid`,
          employment_type: "employee",
          first_name: "Release",
          id: fixture.id("person", index),
          job_title: "Fixture",
          last_name: `${index}`,
          location_id: locationId,
          manager_person_id: null,
          person_type: "employee",
          source_person_key: fixture.key("person", index),
          source_system: "MANUAL",
          team_id: teamId,
          xero_employee_id: null,
        },
      ],
      region_code: "QLD",
      teams: [{ id: teamId, name: `Release team ${index}` }],
      timezone: "Australia/Brisbane",
    };
  }
);
const plans: PlanSeedDefinition[] = planIds.map((id, index) => ({
  id,
  is_custom: index === 2,
  limits: { feeds: index + 1, payroll_entities: index + 1, seats: index + 1 },
  name: `Release plan ${index}`,
  plan_key: planKeys[index] as string,
  priceId: null,
}));

const cleanSeedData = async () => {
  const scope = { clerk_org_id: clerkOrgId };
  await database.person.deleteMany({ where: scope });
  await database.location.deleteMany({ where: scope });
  await database.team.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
  await database.planLimit.deleteMany({ where: { plan_id: { in: planIds } } });
  await database.plan.deleteMany({ where: { id: { in: planIds } } });
};

beforeEach(cleanSeedData);
afterAll(async () => {
  await cleanSeedData();
  await database.$disconnect();
});

describe("production seed path with owned inputs", () => {
  test("seeds organisations, locations, people and plan limits idempotently", async () => {
    const options = { clerkOrgId, organisations, plans };
    const first = await seedDevelopmentData(database, options);
    const second = await seedDevelopmentData(database, options);

    expect(second).toEqual(first);
    expect(first).toEqual({
      clerkOrgId,
      locations: 2,
      organisations: 2,
      people: 2,
      planLimits: 9,
      plans: 3,
      teams: 2,
    });
    const scope = { clerk_org_id: clerkOrgId };
    const [
      organisationCount,
      locationCount,
      teamCount,
      peopleCount,
      planCount,
      limitCount,
    ] = await Promise.all([
      database.organisation.count({ where: scope }),
      database.location.count({ where: scope }),
      database.team.count({ where: scope }),
      database.person.count({ where: scope }),
      database.plan.count({ where: { id: { in: planIds } } }),
      database.planLimit.count({ where: { plan_id: { in: planIds } } }),
    ]);
    expect({
      limitCount,
      locationCount,
      organisationCount,
      peopleCount,
      planCount,
      teamCount,
    }).toEqual({
      limitCount: 9,
      locationCount: 2,
      organisationCount: 2,
      peopleCount: 2,
      planCount: 3,
      teamCount: 2,
    });
  });
});
