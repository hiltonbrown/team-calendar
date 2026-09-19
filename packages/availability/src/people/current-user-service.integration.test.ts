import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { employment_type, source_system } from "@repo/database/generated/enums";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { TenantContext } from "./current-user-service";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/availability/src/people/current-user-service.integration.test.ts"
);
const { database } = await import("@repo/database");
const { ensureCurrentUserPerson } = await import("./current-user-service");

const tenantA = {
  ...fixture.tenants[0],
};
const tenantB = {
  ...fixture.tenants[1],
};
if (!(tenantA.clerkOrgId && tenantB.clerkOrgId)) {
  throw new Error("Current-user live fixture tenants were not allocated");
}
const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId];

describe("current-user-service integration", () => {
  beforeEach(async () => {
    await cleanTestData();
    await database.organisation.createMany({
      data: [
        {
          clerk_org_id: tenantA.clerkOrgId,
          country_code: "AU",
          id: tenantA.organisationId,
          name: "Current user integration A",
        },
        {
          clerk_org_id: tenantB.clerkOrgId,
          country_code: "AU",
          id: tenantB.organisationId,
          name: "Current user integration B",
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanTestData();
    await expect(
      database.organisation.count({
        where: { clerk_org_id: { in: testClerkOrgIds } },
      })
    ).resolves.toBe(0);
    await database.$disconnect();
  });

  test("links a unique case-insensitive email match without crossing tenants", async () => {
    const [candidateA, candidateB] = await Promise.all([
      createPerson(tenantA, "CASE.MATCH@EXAMPLE.COM", "Candidate", "A"),
      createPerson(tenantB, "case.match@example.com", "Candidate", "B"),
    ]);

    const result = await ensureCurrentUserPerson(contextFor(tenantA), {
      clerkUserId: "user_case_match",
      displayName: "Case Match",
      email: " case.match@example.com ",
    });

    expect(result).toMatchObject({ ok: true, value: { id: candidateA.id } });
    await expect(
      database.person.findUnique({
        select: { clerk_user_id: true },
        where: { id: candidateB.id },
      })
    ).resolves.toEqual({ clerk_user_id: null });
  });

  test("accepts the final authoritative seat and rejects the next person", async () => {
    await database.person.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        clerk_org_id: tenantA.clerkOrgId,
        email: `existing-${index}@example.com`,
        employment_type: employment_type.employee,
        first_name: "Existing",
        last_name: `${index}`,
        organisation_id: tenantA.organisationId,
        source_system: source_system.MANUAL,
      })),
    });

    const accepted = await ensureCurrentUserPerson(contextFor(tenantA), {
      clerkUserId: "user_ninth",
      email: "ninth@example.com",
    });
    const rejected = await ensureCurrentUserPerson(contextFor(tenantA), {
      clerkUserId: "user_tenth",
      email: "tenth@example.com",
    });

    expect(accepted.ok).toBe(true);
    expect(rejected).toEqual({
      error: {
        code: "bad_request",
        message: "Your current plan has reached its active people limit.",
      },
      ok: false,
    });
    await expect(
      database.person.count({
        where: {
          archived_at: null,
          clerk_org_id: tenantA.clerkOrgId,
          is_active: true,
        },
      })
    ).resolves.toBe(9);
  });

  test("returns one winner for concurrent provisioning of the same Clerk user", async () => {
    const input = {
      clerkUserId: "user_concurrent",
      displayName: "Concurrent User",
    };

    const results = await Promise.all([
      ensureCurrentUserPerson(contextFor(tenantA), input),
      ensureCurrentUserPerson(contextFor(tenantA), input),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    if (!(results[0]?.ok && results[1]?.ok)) {
      return;
    }
    expect(results[0].value.id).toBe(results[1].value.id);
    await expect(
      database.person.count({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          clerk_user_id: input.clerkUserId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).resolves.toBe(1);
  }, 20_000);
});

function contextFor(input: typeof tenantA): TenantContext {
  return {
    // Fixed integration IDs match the branded runtime representation.
    clerkOrgId: input.clerkOrgId as ClerkOrgId,
    organisationId: input.organisationId as OrganisationId,
  };
}

function createPerson(
  tenant: typeof tenantA,
  email: string,
  firstName: string,
  lastName: string
) {
  return database.person.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      email,
      employment_type: "employee",
      first_name: firstName,
      last_name: lastName,
      organisation_id: tenant.organisationId,
      source_system: "MANUAL",
    },
  });
}

async function cleanTestData() {
  await database.clerkOrgSubscription.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.person.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.organisation.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
}
