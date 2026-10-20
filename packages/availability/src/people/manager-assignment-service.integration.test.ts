import { randomUUID } from "node:crypto";
import { systemDatabase } from "@repo/database";
import { isLocalDatabase } from "@repo/database/is-local-database";
import { withTenantResult } from "@repo/database/tenant-db";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { setPersonManager } from "./manager-assignment-service";

vi.mock("server-only", () => ({}));
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const ownerUrl = process.env.DATABASE_URL;
if (!(ownerUrl && isLocalDatabase(ownerUrl))) {
  throw new Error(
    "Manager assignment fixtures require disposable local PostgreSQL"
  );
}

const accountA = `manager-cycle-${randomUUID()}`;
let companyA: string;

beforeAll(async () => {
  const company = await systemDatabase.organisation.create({
    data: { clerk_org_id: accountA, country_code: "AU", name: accountA },
  });
  companyA = company.id;
});
afterAll(async () => {
  await systemDatabase.accountSettings.deleteMany({
    where: { clerk_org_id: accountA },
  });
  await systemDatabase.organisation.deleteMany({
    where: { clerk_org_id: accountA },
  });
});

test("concurrent opposing manager assignments cannot create a cycle", async () => {
  const fixture = await systemDatabase.$transaction(async (db) => {
    const base = {
      clerk_org_id: accountA,
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
      actingRole: "owner" as const,
      actingUserId: "integration-owner",
      clerkOrgId: accountA,
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
        clerk_org_id: accountA,
        resource_id: { in: [first.id, second.id] },
        resource_type: "person",
      },
    });
    await systemDatabase.person.deleteMany({
      where: { id: { in: [first.id, second.id] } },
    });
  }
});
