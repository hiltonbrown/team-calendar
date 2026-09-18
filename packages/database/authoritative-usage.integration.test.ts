// biome-ignore-all lint/style/useFilenamingConvention: Integration test co-located beside other database integration suites.
import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Prisma } from "./generated/client";

config({ path: new URL("./.env", import.meta.url).pathname });
vi.mock("server-only", () => ({}));

let database: typeof import("./index")["database"];
let getAuthoritativeUsageCount: typeof import("./index")["getAuthoritativeUsageCount"];

const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

if (process.env.DATABASE_URL) {
  ({ database, getAuthoritativeUsageCount } = await import("./index.js"));
}

const clerkOrgId = "org_test_authoritative_billing_usage";
const activeOrganisationId = "a1000000-0000-4000-8000-000000000001";
const archivedOrganisationId = "a1000000-0000-4000-8000-000000000002";

describeWithDatabase("authoritative billing usage", () => {
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
        person("a2000000-0000-4000-8000-000000000001", true, null),
        person("a2000000-0000-4000-8000-000000000002", false, null),
        person(
          "a2000000-0000-4000-8000-000000000003",
          true,
          new Date("2026-01-01T00:00:00.000Z")
        ),
      ],
    });
    await database.feed.createMany({
      data: [
        feed("a3000000-0000-4000-8000-000000000001", "active", null),
        feed("a3000000-0000-4000-8000-000000000002", "paused", null),
        feed(
          "a3000000-0000-4000-8000-000000000003",
          "archived",
          new Date("2026-01-01T00:00:00.000Z")
        ),
      ],
    });
    await database.xeroConnection.createMany({
      data: [
        connection("a4000000-0000-4000-8000-000000000001", "active", null),
        connection(
          "a4000000-0000-4000-8000-000000000002",
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
