import { systemDatabase } from "@repo/database";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { withTenantResult } from "@repo/database/tenant-db";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { setPersonManager } from "./manager-assignment-service";

vi.mock("server-only", () => ({}));
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const allocation = allocateLiveTestFixture(
  "packages/availability/src/people/manager-assignment-service.integration.test.ts"
);
const [tenant] = allocation.tenants;
if (!tenant) {
  throw new Error("Manager assignment fixture account is missing");
}
const accountA = tenant.accountId;
const companyA = tenant.organisationId;

beforeAll(async () => {
  await systemDatabase.organisation.create({
    data: {
      account_id: accountA,
      country_code: "AU",
      id: companyA,
      name: accountA,
    },
  });
});
afterAll(async () => {
  await systemDatabase.accountSettings.deleteMany({
    where: { account_id: accountA },
  });
  await systemDatabase.organisation.deleteMany({
    where: { account_id: accountA },
  });
});

test("concurrent opposing manager assignments cannot create a cycle", async () => {
  const fixture = await systemDatabase.$transaction(async (db) => {
    const base = {
      account_id: accountA,
      email: "cycle@example.test",
      employment_type: "employee" as const,
      first_name: "Cycle",
      last_name: "Fixture",
      organisation_id: companyA,
      source_system: "MANUAL" as const,
    };
    return [
      await db.person.create({ data: base }),
      await db.person.create({ data: base }),
    ] as const;
  });
  const [first, second] = fixture;
  try {
    const base = {
      accountId: accountA,
      actingRole: "owner" as const,
      actingUserId: "integration-owner",
    };
    const results = await Promise.all([
      withTenantResult(accountA, (db) =>
        setPersonManager(
          { ...base, managerPersonId: second.id, personId: first.id },
          db
        )
      ),
      withTenantResult(accountA, (db) =>
        setPersonManager(
          { ...base, managerPersonId: first.id, personId: second.id },
          db
        )
      ),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    const people = await systemDatabase.person.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(
      people.filter((person) => person.manager_person_id !== null)
    ).toHaveLength(1);
  } finally {
    await systemDatabase.auditEvent.deleteMany({
      where: {
        account_id: accountA,
        resource_id: { in: [first.id, second.id] },
        resource_type: "person",
      },
    });
    await systemDatabase.person.deleteMany({
      where: { id: { in: [first.id, second.id] } },
    });
  }
});
