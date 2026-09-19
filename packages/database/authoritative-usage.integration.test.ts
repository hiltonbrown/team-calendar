// biome-ignore-all lint/style/useFilenamingConvention: Integration test co-located beside other database integration suites.
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Prisma } from "./generated/client";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/authoritative-usage.integration.test.ts"
);
const { database, getAuthoritativeUsageCount } = await import("./index.js");
const clerkOrgId = fixture.tenants[0]?.clerkOrgId as string;
const activeOrganisationId = fixture.tenants[0]?.organisationId as string;
const archivedOrganisationId = fixture.tenants[1]?.organisationId as string;

describe("authoritative billing usage", () => {
  beforeEach(async () => {
    await cleanTestData();
    await database.organisation.createMany({
      data: [
        {
          clerk_org_id: clerkOrgId,
          country_code: "AU",
          id: activeOrganisationId,
          is_active: true,
          name: "Active billing test organisation",
        },
        {
          archived_at: new Date("2026-01-01T00:00:00.000Z"),
          clerk_org_id: clerkOrgId,
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

    await expect(getAuthoritativeUsageCount(clerkOrgId, "seats")).resolves.toBe(
      1
    );
    await expect(getAuthoritativeUsageCount(clerkOrgId, "feeds")).resolves.toBe(
      1
    );
    await expect(
      getAuthoritativeUsageCount(clerkOrgId, "payroll_entities")
    ).resolves.toBe(1);
    await expect(
      getAuthoritativeUsageCount(clerkOrgId, "organisations")
    ).resolves.toBe(1);
    await expect(
      getAuthoritativeUsageCount(clerkOrgId, "connections")
    ).resolves.toBe(1);
  });
});

function person(
  id: string,
  isActive: boolean,
  archivedAt: Date | null
): Prisma.PersonCreateManyInput {
  return {
    archived_at: archivedAt,
    clerk_org_id: clerkOrgId,
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
    archived_at: archivedAt,
    clerk_org_id: clerkOrgId,
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
    clerk_org_id: clerkOrgId,
    disconnected_at: disconnectedAt,
    expires_at: new Date("2027-01-01T00:00:00.000Z"),
    id,
    organisation_id:
      status === "active" ? activeOrganisationId : archivedOrganisationId,
    status,
  };
}

async function cleanTestData() {
  await database.xeroConnection.deleteMany({
    where: { clerk_org_id: clerkOrgId },
  });
  await database.feed.deleteMany({ where: { clerk_org_id: clerkOrgId } });
  await database.person.deleteMany({ where: { clerk_org_id: clerkOrgId } });
  await database.organisation.deleteMany({
    where: { clerk_org_id: clerkOrgId },
  });
}
