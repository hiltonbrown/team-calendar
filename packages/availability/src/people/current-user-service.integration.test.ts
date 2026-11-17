import type { AccountId, OrganisationId } from "@repo/core";
import { employment_type, source_system } from "@repo/database/generated/enums";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { withTenantResult as withTestTenantResult } from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { TenantContext } from "./current-user-service";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/availability/src/people/current-user-service.integration.test.ts"
);
const { systemDatabase: database } = await import("@repo/database");
const { ensureCurrentUserPerson } = await import("./current-user-service");

const tenantA = {
  ...fixture.tenants[0],
};
const tenantB = {
  ...fixture.tenants[1],
};
if (!(tenantA.accountId && tenantB.accountId)) {
  throw new Error("Current-user live fixture tenants were not allocated");
}
const testAccountIds = [tenantA.accountId, tenantB.accountId];

describe("current-user-service integration", () => {
  beforeEach(async () => {
    await cleanTestData();
    await database.organisation.createMany({
      data: [
        {
          account_id: tenantA.accountId,
          country_code: "AU",
          id: tenantA.organisationId,
          name: "Current user integration A",
        },
        {
          account_id: tenantB.accountId,
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
        where: { account_id: { in: testAccountIds } },
      })
    ).resolves.toBe(0);
    await database.$disconnect();
  });

  test("links a unique case-insensitive email match without crossing tenants", async () => {
    const [candidateA, candidateB] = await Promise.all([
      createPerson(tenantA, "CASE.MATCH@EXAMPLE.COM", "Candidate", "A"),
      createPerson(tenantB, "case.match@example.com", "Candidate", "B"),
    ]);

    const result = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            displayName: "Case Match",
            email: " case.match@example.com ",
            userId: "user_case_match",
          },
          db
        )
    );

    expect(result).toMatchObject({ ok: true, value: { id: candidateA.id } });
    await expect(
      database.person.findUnique({
        select: { user_id: true },
        where: { id: candidateB.id },
      })
    ).resolves.toEqual({ user_id: null });
  });

  test("accepts the final authoritative seat and rejects the next person", async () => {
    await database.person.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        account_id: tenantA.accountId,
        email: `existing-${index}@example.com`,
        employment_type: employment_type.employee,
        first_name: "Existing",
        last_name: `${index}`,
        organisation_id: tenantA.organisationId,
        source_system: source_system.MANUAL,
      })),
    });

    const accepted = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            email: "ninth@example.com",
            userId: "user_ninth",
          },
          db
        )
    );
    const rejected = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            email: "tenth@example.com",
            userId: "user_tenth",
          },
          db
        )
    );

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
          account_id: tenantA.accountId,
          archived_at: null,
          is_active: true,
        },
      })
    ).resolves.toBe(9);
  });

  test("returns one winner for concurrent provisioning of the same user", async () => {
    const input = {
      displayName: "Concurrent User",
      userId: "user_concurrent",
    };

    const results = await Promise.all([
      withTestTenantResult(tenantTestAccount(contextFor(tenantA)), (db) =>
        ensureCurrentUserPerson(contextFor(tenantA), input, db)
      ),
      withTestTenantResult(tenantTestAccount(contextFor(tenantA)), (db) =>
        ensureCurrentUserPerson(contextFor(tenantA), input, db)
      ),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    if (!(results[0]?.ok && results[1]?.ok)) {
      return;
    }
    expect(results[0].value.id).toBe(results[1].value.id);
    await expect(
      database.person.count({
        where: {
          account_id: tenantA.accountId,
          organisation_id: tenantA.organisationId,
          user_id: input.userId,
        },
      })
    ).resolves.toBe(1);
  }, 20_000);
});

function contextFor(input: typeof tenantA): TenantContext {
  return {
    // Fixed integration IDs match the branded runtime representation.
    accountId: input.accountId as AccountId,
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
      account_id: tenant.accountId,
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
  await database.accountSubscription.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.person.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.organisation.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
}
