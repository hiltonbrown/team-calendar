// biome-ignore-all lint/style/useFilenamingConvention: Database test files follow existing snake_case naming.
import type { ClerkOrgId, FeedId, OrganisationId } from "@repo/core";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { allocateLiveTestFixture } from "./src/live-test-fixture";

vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/database/public-holidays.integration.test.ts"
);

const { database } = await import("./index.js");
const { importPublicHolidaysForFeed } = await import(
  "./src/queries/public-holidays"
);

const tenantA = {
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as string,
  feedId: fixture.id("feed"),
  organisationId: fixture.tenants[0]?.organisationId as string,
} as const;

const tenantB = {
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as string,
  organisationId: fixture.tenants[1]?.organisationId as string,
} as const;

const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId];

const cleanTestData = async () => {
  const scope = { clerk_org_id: { in: testClerkOrgIds } };
  await database.failedRecord.deleteMany({ where: scope });
  await database.availabilityPublication.deleteMany({ where: scope });
  await database.auditEvent.deleteMany({ where: scope });
  await database.availabilityRecord.deleteMany({ where: scope });
  await database.leaveBalance.deleteMany({ where: scope });
  await database.alternativeContact.deleteMany({ where: scope });
  await database.notification.deleteMany({ where: scope });
  await database.notificationPreference.deleteMany({ where: scope });
  await database.xeroSyncCursor.deleteMany({ where: scope });
  await database.syncRun.deleteMany({ where: scope });
  await database.xeroTenant.deleteMany({ where: scope });
  await database.xeroConnection.deleteMany({ where: scope });
  await database.publicHolidayAssignment.deleteMany({ where: scope });
  await database.publicHoliday.deleteMany({ where: scope });
  await database.publicHolidayJurisdiction.deleteMany({ where: scope });
  await database.feedToken.deleteMany({ where: scope });
  await database.feedScope.deleteMany({ where: scope });
  await database.feed.deleteMany({ where: scope });
  await database.person.deleteMany({ where: scope });
  await database.location.deleteMany({ where: scope });
  await database.team.deleteMany({ where: scope });
  await database.organisation.deleteMany({ where: scope });
};

const createTenant = async () => {
  await database.organisation.createMany({
    data: [
      {
        clerk_org_id: tenantA.clerkOrgId,
        country_code: "AU",
        id: tenantA.organisationId,
        name: "Public holiday tenant A",
      },
      {
        clerk_org_id: tenantB.clerkOrgId,
        country_code: "AU",
        id: tenantB.organisationId,
        name: "Public holiday tenant B",
      },
    ],
  });

  await database.feed.create({
    data: {
      clerk_org_id: tenantA.clerkOrgId,
      id: tenantA.feedId,
      name: "Team holidays",
      organisation_id: tenantA.organisationId,
      slug: "team-holidays",
    },
  });
};

beforeEach(async () => {
  await cleanTestData();
  await createTenant();
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("public holiday imports", () => {
  test("persists selected holidays and handles repeat imports idempotently", async () => {
    const firstImport = await importPublicHolidaysForFeed(
      tenantA.clerkOrgId as ClerkOrgId,
      tenantA.organisationId as OrganisationId,
      {
        classification: "non_working",
        countryCode: "AU",
        feedId: tenantA.feedId as FeedId,
        holidays: [
          {
            counties: null,
            date: "2026-01-26",
            localName: "Australia Day",
            name: "Australia Day",
            types: ["Public"],
          },
        ],
        regionCode: null,
        userId: "user_public_holidays",
      }
    );

    expect(firstImport).toMatchObject({
      ok: true,
      value: { assignedCount: 1, importedCount: 1, skippedCount: 0 },
    });

    const secondImport = await importPublicHolidaysForFeed(
      tenantA.clerkOrgId as ClerkOrgId,
      tenantA.organisationId as OrganisationId,
      {
        classification: "working",
        countryCode: "AU",
        feedId: tenantA.feedId as FeedId,
        holidays: [
          {
            counties: null,
            date: "2026-01-26",
            localName: "Australia Day",
            name: "Australia Day",
            types: ["Public"],
          },
        ],
        regionCode: null,
        userId: "user_public_holidays",
      }
    );

    expect(secondImport).toMatchObject({
      ok: true,
      value: { assignedCount: 1, importedCount: 0, skippedCount: 1 },
    });

    await expect(
      database.publicHoliday.count({
        where: { clerk_org_id: tenantA.clerkOrgId },
      })
    ).resolves.toBe(1);
    await expect(
      database.publicHolidayAssignment.findFirstOrThrow({
        select: { day_classification: true },
        where: { clerk_org_id: tenantA.clerkOrgId },
      })
    ).resolves.toMatchObject({ day_classification: "working" });
  });

  test("rejects feed imports outside the scoped organisation", async () => {
    const result = await importPublicHolidaysForFeed(
      tenantB.clerkOrgId as ClerkOrgId,
      tenantB.organisationId as OrganisationId,
      {
        classification: "non_working",
        countryCode: "AU",
        feedId: tenantA.feedId as FeedId,
        holidays: [
          {
            counties: null,
            date: "2026-04-03",
            localName: "Good Friday",
            name: "Good Friday",
            types: ["Public"],
          },
        ],
        regionCode: null,
        userId: "user_public_holidays",
      }
    );

    expect(result).toMatchObject({
      error: expect.objectContaining({ code: "not_found" }),
      ok: false,
    });
  });
});
