// biome-ignore-all lint/style/useFilenamingConvention: Integration test co-located beside other database integration suites.
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Prisma } from "./generated/client";
import { allocateLiveTestFixture } from "./src/live-test-fixture";
import { withTenantDb as withTestTenantDb } from "./src/tenant-db";
import { tenantTestAccount } from "./src/test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));
const fixture = allocateLiveTestFixture(
  "packages/database/authoritative-usage.integration.test.ts"
);
const { systemDatabase: database, getAuthoritativeUsageCount } = await import(
  "./index.js"
);
const accountId = fixture.tenants[0]?.accountId as string;
const activeOrganisationId = fixture.tenants[0]?.organisationId as string;
const archivedOrganisationId = fixture.tenants[1]?.organisationId as string;
describe("authoritative billing usage", () => {
  beforeEach(async () => {
    await cleanTestData();
    await database.organisation.createMany({
      data: [
        {
          account_id: accountId,
          country_code: "AU",
          id: activeOrganisationId,
          is_active: true,
          name: "Active billing test organisation",
        },
        {
          account_id: accountId,
          archived_at: new Date("2026-01-01T00:00:00.000Z"),
          country_code: "AU",
          id: archivedOrganisationId,
          is_active: false,
          name: "Archived billing test organisation",
        },
      ],
    });
  });
  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });
  test("counts every supported type from active rows only", async () => {
    await database.person.createMany({
      data: [
        person(fixture.id("person", 0), true, null),
        person(fixture.id("person", 1), false, null),
        person(
          fixture.id("person", 2),
          true,
          new Date("2026-01-01T00:00:00.000Z")
        ),
      ],
    });
    await database.feed.createMany({
      data: [
        feed(fixture.id("feed", 0), "active", null),
        feed(fixture.id("feed", 1), "paused", null),
        feed(
          fixture.id("feed", 2),
          "archived",
          new Date("2026-01-01T00:00:00.000Z")
        ),
      ],
    });
    await database.xeroConnection.createMany({
      data: [
        connection(fixture.id("connection", 0), "active", null),
        connection(
          fixture.id("connection", 1),
          "disconnected",
          new Date("2026-01-01T00:00:00.000Z")
        ),
      ],
    });
    await expect(
      withTestTenantDb(tenantTestAccount(accountId), (db) =>
        getAuthoritativeUsageCount(accountId, "seats", db)
      )
    ).resolves.toBe(1);
    await expect(
      withTestTenantDb(tenantTestAccount(accountId), (db) =>
        getAuthoritativeUsageCount(accountId, "feeds", db)
      )
    ).resolves.toBe(1);
    await expect(
      withTestTenantDb(tenantTestAccount(accountId), (db) =>
        getAuthoritativeUsageCount(accountId, "payroll_entities", db)
      )
    ).resolves.toBe(1);
    await expect(
      withTestTenantDb(tenantTestAccount(accountId), (db) =>
        getAuthoritativeUsageCount(accountId, "organisations", db)
      )
    ).resolves.toBe(1);
    await expect(
      withTestTenantDb(tenantTestAccount(accountId), (db) =>
        getAuthoritativeUsageCount(accountId, "connections", db)
      )
    ).resolves.toBe(1);
  });
});
function person(
  id: string,
  isActive: boolean,
  archivedAt: Date | null
): Prisma.PersonCreateManyInput {
  return {
    account_id: accountId,
    archived_at: archivedAt,
    email: `${id}@example.com`,
    employment_type: "employee",
    first_name: "Billing",
    id,
    is_active: isActive,
    last_name: "Test",
    organisation_id: activeOrganisationId,
    source_system: "MANUAL",
  };
}
function feed(
  id: string,
  status: "active" | "archived" | "paused",
  archivedAt: Date | null
): Prisma.FeedCreateManyInput {
  return {
    account_id: accountId,
    archived_at: archivedAt,
    id,
    name: `Billing test ${id}`,
    organisation_id: activeOrganisationId,
    privacy_mode: "named",
    slug: `billing-test-${id}`,
    status,
  };
}
function connection(
  id: string,
  status: "active" | "disconnected",
  disconnectedAt: Date | null
): Prisma.XeroConnectionCreateManyInput {
  return {
    account_id: accountId,
    disconnected_at: disconnectedAt,
    id,
    organisation_id:
      status === "active" ? activeOrganisationId : archivedOrganisationId,
    payroll_region: "AU",
    status,
    xero_tenant_id: id,
  };
}
async function cleanTestData() {
  await database.xeroConnection.deleteMany({
    where: { account_id: accountId },
  });
  await database.feed.deleteMany({ where: { account_id: accountId } });
  await database.person.deleteMany({ where: { account_id: accountId } });
  await database.organisation.deleteMany({
    where: { account_id: accountId },
  });
}
