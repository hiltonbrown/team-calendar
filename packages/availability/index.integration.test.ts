import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { TenantContext } from "./index";

vi.mock("server-only", () => ({}), { virtual: true });
vi.mock("./src/holidays/nager-client", () => ({
  getPublicHolidays: vi.fn().mockImplementation((_countryCode, year) =>
    Promise.resolve({
      ok: true,
      value: [
        {
          counties: null,
          countryCode: "AU",
          date: `${year}-01-01`,
          fixed: true,
          global: true,
          localName: "New Year's Day",
          name: "New Year's Day",
          types: ["Public"],
        },
      ],
    })
  ),
}));

const fixture = allocateLiveTestFixture(
  "packages/availability/index.integration.test.ts"
);
const [tenantSlotA, tenantSlotB, provisioningTenant] = fixture.tenants;
const {
  archiveManualAvailability,
  createManualAvailability,
  ensureCurrentUserPerson,
  ensureOrganisationForClerk,
  listAvailabilityRecords,
  updateManualAvailability,
} = await import("./index");
const { database } = await import("@repo/database");

interface TenantFixture {
  clerkOrgId: string;
  organisationId: string;
  personId: string;
}

const tenantA: TenantFixture = {
  ...tenantSlotA,
  personId: fixture.id("person", 0),
};

const tenantB: TenantFixture = {
  ...tenantSlotB,
  personId: fixture.id("person", 1),
};
if (!(tenantA.clerkOrgId && tenantB.clerkOrgId && provisioningTenant)) {
  throw new Error("Availability live fixture tenants were not allocated");
}
const provisioningClerkOrgId = provisioningTenant.clerkOrgId;

const testClerkOrgIds = [
  tenantA.clerkOrgId,
  tenantB.clerkOrgId,
  provisioningClerkOrgId,
];

const inputFor = (tenant: TenantFixture) => ({
  allDay: true,
  contactability: "limited",
  endsAt: new Date("2026-05-12T00:00:00.000Z"),
  includeInFeed: true,
  notesInternal: "Manual entry fixture",
  personId: tenant.personId,
  privacyMode: "named",
  recordType: "wfh",
  startsAt: new Date("2026-05-10T00:00:00.000Z"),
  title: "Working from home",
  workingLocation: "Brisbane",
});

const patchInput = {
  allDay: true,
  contactability: "limited",
  endsAt: new Date("2026-05-12T00:00:00.000Z"),
  includeInFeed: true,
  notesInternal: "Manual entry fixture",
  privacyMode: "named",
  recordType: "wfh",
  startsAt: new Date("2026-05-10T00:00:00.000Z"),
  title: "Working from home",
  workingLocation: "Brisbane",
} as const;

const createTenant = async (tenant: TenantFixture) => {
  await database.organisation.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Manual availability ${tenant.clerkOrgId}`,
    },
  });

  await database.person.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      email: `${tenant.clerkOrgId}@example.com`,
      employment_type: "employee",
      first_name: "Manual",
      id: tenant.personId,
      is_active: true,
      last_name: "Person",
      organisation_id: tenant.organisationId,
      source_person_key: null,
      source_system: "MANUAL",
    },
  });
};

const cleanTestData = async () => {
  await database.availabilityPublication.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.availabilityRecord.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.person.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.auditEvent.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.feedToken.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.feedScope.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.feed.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.publicHoliday.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.publicHolidayJurisdiction.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.organisation.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
};

const contextFor = (tenant: TenantFixture): TenantContext => ({
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  clerkOrgId: tenant.clerkOrgId as ClerkOrgId,
  organisationId: tenant.organisationId as OrganisationId,
});

const createProvisioningOrganisation = () =>
  database.organisation.create({
    data: {
      clerk_org_id: provisioningTenant.clerkOrgId,
      country_code: "AU",
      id: provisioningTenant.organisationId,
      name: "Provisioning fixture",
    },
  });

beforeEach(async () => {
  await cleanTestData();
  await createTenant(tenantA);
  await createTenant(tenantB);
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

describe("manual availability services", () => {
  test("creates records visible to scoped calendar and people queries", async () => {
    const result = await createManualAvailability(
      contextFor(tenantA),
      inputFor(tenantA),
      { orgRole: "org:admin", userId: "user_test" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      contactability: "limited",
      includeInFeed: true,
      personId: tenantA.personId,
      personName: "Manual Person",
      privacyMode: "named",
      recordType: "wfh",
      title: "Working from home",
      workingLocation: "Brisbane",
    });

    await expect(listAvailabilityRecords(contextFor(tenantA))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: result.value.id,
          personId: tenantA.personId,
        }),
      ])
    );
  });

  test("rejects invalid dates and person IDs outside the tenant", async () => {
    await expect(
      createManualAvailability(
        contextFor(tenantA),
        {
          ...inputFor(tenantA),
          endsAt: new Date("2026-05-09T00:00:00.000Z"),
        },
        { orgRole: "org:admin", userId: "user_test" }
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "bad_request" }),
      ok: false,
    });

    await expect(
      createManualAvailability(
        contextFor(tenantA),
        { ...inputFor(tenantA), personId: tenantB.personId },
        { orgRole: "org:admin", userId: "user_test" }
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "not_found" }),
      ok: false,
    });
  });

  test("updates and archives only manual records in the active tenant", async () => {
    const created = await createManualAvailability(
      contextFor(tenantA),
      inputFor(tenantA),
      { orgRole: "org:admin", userId: "user_test" }
    );

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await expect(
      updateManualAvailability(
        contextFor(tenantB),
        created.value.id,
        patchInput,
        { orgRole: "org:admin", userId: "user_test" }
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "not_found" }),
      ok: false,
    });

    const updated = await updateManualAvailability(
      contextFor(tenantA),
      created.value.id,
      {
        ...patchInput,
        contactability: "unavailable",
        includeInFeed: false,
        title: "Training day",
      },
      { orgRole: "org:admin", userId: "user_test" }
    );

    expect(updated).toMatchObject({
      ok: true,
      value: expect.objectContaining({
        contactability: "unavailable",
        includeInFeed: false,
        title: "Training day",
      }),
    });

    await expect(
      archiveManualAvailability(contextFor(tenantB), created.value.id, {
        orgRole: "org:admin",
        userId: "user_test",
      })
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "not_found" }),
      ok: false,
    });

    await expect(
      archiveManualAvailability(contextFor(tenantA), created.value.id, {
        orgRole: "org:admin",
        userId: "user_test",
      })
    ).resolves.toMatchObject({ ok: true });

    await expect(
      listAvailabilityRecords(contextFor(tenantA))
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.value.id }),
      ])
    );
  });
});

describe("current user person identity", () => {
  test("provisions one default feed when ensuring an organisation", async () => {
    await cleanTestData();
    await createProvisioningOrganisation();
    const context = await ensureOrganisationForClerk({
      clerkOrgId: provisioningClerkOrgId,
      countryCode: "AU",
      name: "Default feed provisioning",
    });

    await expect(
      database.organisation.count({
        where: { clerk_org_id: provisioningClerkOrgId },
      })
    ).resolves.toBe(1);

    const feeds = await database.feed.findMany({
      where: {
        archived_at: null,
        clerk_org_id: provisioningClerkOrgId,
        organisation_id: context.organisationId,
      },
    });
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      name: "All staff",
      privacy_mode: "named",
      status: "active",
    });

    await expect(
      database.feedScope.findMany({
        where: {
          clerk_org_id: provisioningClerkOrgId,
          feed_id: feeds[0]?.id,
          organisation_id: context.organisationId,
        },
      })
    ).resolves.toEqual([
      expect.objectContaining({ scope_type: "org", scope_value: null }),
    ]);

    await expect(
      database.feedToken.count({
        where: {
          clerk_org_id: provisioningClerkOrgId,
          feed_id: feeds[0]?.id,
          organisation_id: context.organisationId,
          status: "active",
        },
      })
    ).resolves.toBe(1);

    await ensureOrganisationForClerk({
      clerkOrgId: provisioningClerkOrgId,
      countryCode: "AU",
      name: "Default feed provisioning renamed",
    });

    await expect(
      database.feed.count({
        where: {
          clerk_org_id: provisioningClerkOrgId,
          organisation_id: context.organisationId,
        },
      })
    ).resolves.toBe(1);
  });

  test("provisions default public holidays when ensuring an organisation", async () => {
    await cleanTestData();
    await createProvisioningOrganisation();
    const context = await ensureOrganisationForClerk({
      clerkOrgId: provisioningClerkOrgId,
      countryCode: "AU",
      name: "Default holiday provisioning test",
    });

    const orgCount = await database.organisation.count({
      where: { clerk_org_id: provisioningClerkOrgId },
    });
    expect(orgCount).toBe(1);

    const jurisdictions = await database.publicHolidayJurisdiction.findMany({
      where: {
        clerk_org_id: provisioningClerkOrgId,
        country_code: "AU",
        organisation_id: context.organisationId,
        region_code: null,
      },
    });
    expect(jurisdictions.length).toBeGreaterThanOrEqual(1);

    const currentYear = new Date().getUTCFullYear();
    const holidays = await database.publicHoliday.findMany({
      where: {
        clerk_org_id: provisioningClerkOrgId,
        organisation_id: context.organisationId,
        source: "nager",
      },
    });

    const holidayYears = holidays.map((h) => h.holiday_date.getUTCFullYear());
    expect(holidayYears).toContain(currentYear);
    expect(holidayYears).toContain(currentYear + 1);

    const initialHolidayCount = holidays.length;

    await ensureOrganisationForClerk({
      clerkOrgId: provisioningClerkOrgId,
      countryCode: "AU",
      name: "Default holiday provisioning test",
    });

    const finalJurisdictions = await database.publicHolidayJurisdiction.count({
      where: {
        clerk_org_id: provisioningClerkOrgId,
        organisation_id: context.organisationId,
      },
    });
    expect(finalJurisdictions).toBe(jurisdictions.length);

    const finalHolidayCount = await database.publicHoliday.count({
      where: {
        clerk_org_id: provisioningClerkOrgId,
        organisation_id: context.organisationId,
        source: "nager",
      },
    });
    expect(finalHolidayCount).toBe(initialHolidayCount);
  });

  test("returns an existing linked person", async () => {
    await database.person.update({
      data: { clerk_user_id: "user_existing" },
      where: { id: tenantA.personId },
    });

    const result = await ensureCurrentUserPerson(contextFor(tenantA), {
      clerkUserId: "user_existing",
      displayName: "Existing User",
      email: `${tenantA.clerkOrgId}@example.com`,
    });

    expect(result).toMatchObject({
      ok: true,
      value: expect.objectContaining({ id: tenantA.personId }),
    });
  });

  test("links one same-email unlinked person in the active tenant", async () => {
    const result = await ensureCurrentUserPerson(contextFor(tenantA), {
      clerkUserId: "user_same_email",
      displayName: "Manual Person",
      email: `${tenantA.clerkOrgId}@example.com`,
    });

    expect(result).toMatchObject({
      ok: true,
      value: expect.objectContaining({ id: tenantA.personId }),
    });

    await expect(
      database.person.findFirst({
        select: { id: true },
        where: {
          clerk_user_id: "user_same_email",
          id: tenantA.personId,
          organisation_id: tenantA.organisationId,
        },
      })
    ).resolves.toEqual({ id: tenantA.personId });
  });

  test("does not link same-email people outside the active tenant", async () => {
    const result = await ensureCurrentUserPerson(contextFor(tenantA), {
      clerkUserId: "user_cross_tenant",
      displayName: "Cross Tenant",
      email: `${tenantB.clerkOrgId}@example.com`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.id).not.toBe(tenantB.personId);

    await expect(
      database.person.findUnique({
        select: { clerk_user_id: true },
        where: { id: tenantB.personId },
      })
    ).resolves.toEqual({ clerk_user_id: null });
  });

  test("creates a manual person when no same-email profile exists", async () => {
    const result = await ensureCurrentUserPerson(contextFor(tenantA), {
      avatarUrl: "https://img.clerk.com/avatar.png",
      clerkUserId: "user_new",
      displayName: "New User",
      email: "New.User@example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    await expect(
      database.person.findUnique({
        select: {
          avatar_url: true,
          clerk_org_id: true,
          clerk_user_id: true,
          email: true,
          organisation_id: true,
          source_system: true,
        },
        where: { id: result.value.id },
      })
    ).resolves.toEqual({
      avatar_url: "https://img.clerk.com/avatar.png",
      clerk_org_id: tenantA.clerkOrgId,
      clerk_user_id: "user_new",
      email: "new.user@example.com",
      organisation_id: tenantA.organisationId,
      source_system: "MANUAL",
    });
  });

  test("returns a conflict when multiple same-email people exist", async () => {
    await database.person.createMany({
      data: [
        {
          clerk_org_id: tenantA.clerkOrgId,
          email: "duplicate@example.com",
          employment_type: "employee",
          first_name: "Duplicate",
          id: fixture.id("person", 101),
          last_name: "One",
          organisation_id: tenantA.organisationId,
          source_system: "MANUAL",
        },
        {
          clerk_org_id: tenantA.clerkOrgId,
          email: "duplicate@example.com",
          employment_type: "employee",
          first_name: "Duplicate",
          id: fixture.id("person", 102),
          last_name: "Two",
          organisation_id: tenantA.organisationId,
          source_system: "MANUAL",
        },
      ],
    });

    await expect(
      ensureCurrentUserPerson(contextFor(tenantA), {
        clerkUserId: "user_conflict",
        displayName: "Duplicate User",
        email: "duplicate@example.com",
      })
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "conflict" }),
      ok: false,
    });
  });
});
