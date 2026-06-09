import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { seedOrganisations } from "./data";
import { seedDevelopmentData } from "./seed";

config({ path: new URL("../../.env", import.meta.url).pathname });
vi.mock("server-only", () => ({}));

const { database } = await import("../../index.js");

const TEST_CLERK_ORG_ID = "org_test_seed";

const organisationIds = seedOrganisations.map((org) => org.id);
const teamIds = seedOrganisations.flatMap((org) =>
  org.teams.map((team) => team.id)
);
const locationIds = seedOrganisations.flatMap((org) =>
  org.locations.map((location) => location.id)
);
const personIds = seedOrganisations.flatMap((org) =>
  org.people.map((person) => person.id)
);

const expectedPeople = personIds.length;
const expectedTeams = teamIds.length;
const expectedLocations = locationIds.length;
const expectedOrganisations = organisationIds.length;

const cleanSeedData = async () => {
  await database.person.deleteMany({ where: { id: { in: personIds } } });
  await database.location.deleteMany({ where: { id: { in: locationIds } } });
  await database.team.deleteMany({ where: { id: { in: teamIds } } });
  await database.organisation.deleteMany({
    where: { id: { in: organisationIds } },
  });
};

beforeEach(cleanSeedData);
afterAll(cleanSeedData);

describe("seedDevelopmentData", () => {
  test("is idempotent and scopes every row to clerk_org_id", async () => {
    const first = await seedDevelopmentData(database, {
      clerkOrgId: TEST_CLERK_ORG_ID,
    });

    expect(first).toStrictEqual({
      clerkOrgId: TEST_CLERK_ORG_ID,
      organisations: expectedOrganisations,
      teams: expectedTeams,
      locations: expectedLocations,
      people: expectedPeople,
    });

    const second = await seedDevelopmentData(database, {
      clerkOrgId: TEST_CLERK_ORG_ID,
    });

    expect(second).toStrictEqual(first);

    const scope = { clerk_org_id: TEST_CLERK_ORG_ID };
    const [organisations, teams, locations, people] = await Promise.all([
      database.organisation.count({ where: scope }),
      database.team.count({ where: scope }),
      database.location.count({ where: scope }),
      database.person.count({ where: scope }),
    ]);

    // Re-running creates no duplicates: counts match the dataset exactly.
    expect(organisations).toBe(expectedOrganisations);
    expect(teams).toBe(expectedTeams);
    expect(locations).toBe(expectedLocations);
    expect(people).toBe(expectedPeople);

    // Every seeded row carries the tenancy key, none leaked an empty value.
    const unscopedPeople = await database.person.count({
      where: {
        id: { in: personIds },
        NOT: { clerk_org_id: TEST_CLERK_ORG_ID },
      },
    });
    expect(unscopedPeople).toBe(0);
  });
});
