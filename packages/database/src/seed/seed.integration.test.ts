import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "../live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/src/seed/seed.integration.test.ts"
);
const { database } = await import("../../index.js");
const clerkOrgId = fixture.tenants[0]?.clerkOrgId as string;
const organisationIds = fixture.tenants.map((tenant) => tenant.organisationId);
const planIds = [0, 1, 2].map((index) => fixture.globalKey("plan_id", index));
const planKeys = [0, 1, 2].map((index) => fixture.globalKey("plan_key", index));

const cleanSeedData = async () => {
  const scope = { clerk_org_id: clerkOrgId };
  await database.person.deleteMany({ where: scope });
  await database.team.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
  await database.planLimit.deleteMany({ where: { plan_id: { in: planIds } } });
  await database.plan.deleteMany({ where: { id: { in: planIds } } });
};

const seedOwnedFixture = async () => {
  for (const [index, organisationId] of organisationIds.entries()) {
    await database.organisation.upsert({
      create: {
        clerk_org_id: clerkOrgId,
        country_code: "AU",
        id: organisationId,
        name: `Release fixture organisation ${index}`,
      },
      update: { name: `Release fixture organisation ${index}` },
      where: { id: organisationId },
    });
    const teamId = fixture.id("team", index);
    await database.team.upsert({
      create: {
        clerk_org_id: clerkOrgId,
        id: teamId,
        name: `Release fixture team ${index}`,
        organisation_id: organisationId,
      },
      update: { name: `Release fixture team ${index}` },
      where: { id: teamId },
    });
    const personId = fixture.id("person", index);
    await database.person.upsert({
      create: {
        clerk_org_id: clerkOrgId,
        email: `${fixture.key("person", index)}@example.invalid`,
        employment_type: "employee",
        first_name: "Release",
        id: personId,
        last_name: `Fixture ${index}`,
        organisation_id: organisationId,
        source_system: "MANUAL",
        team_id: teamId,
      },
      update: { first_name: "Release" },
      where: { id: personId },
    });
  }
  for (const [index, planId] of planIds.entries()) {
    const planKey = planKeys[index] as string;
    await database.plan.upsert({
      create: {
        id: planId,
        key: planKey,
        name: `Release fixture plan ${index}`,
        plan_key: planKey,
      },
      update: { name: `Release fixture plan ${index}` },
      where: { id: planId },
    });
  }
};

beforeEach(cleanSeedData);
afterAll(async () => {
  await cleanSeedData();
  await database.$disconnect();
});

describe("owned seed database semantics", () => {
  test("is idempotent without touching the production catalogue", async () => {
    await seedOwnedFixture();
    await seedOwnedFixture();

    const scope = { clerk_org_id: clerkOrgId };
    const [organisations, teams, people, plans] = await Promise.all([
      database.organisation.count({ where: scope }),
      database.team.count({ where: scope }),
      database.person.count({ where: scope }),
      database.plan.count({ where: { id: { in: planIds } } }),
    ]);
    expect({ organisations, people, plans, teams }).toEqual({
      organisations: 2,
      people: 2,
      plans: 3,
      teams: 2,
    });
    await expect(
      database.person.count({
        where: {
          id: { in: [fixture.id("person", 0), fixture.id("person", 1)] },
          NOT: { clerk_org_id: clerkOrgId },
        },
      })
    ).resolves.toBe(0);
  });
});
