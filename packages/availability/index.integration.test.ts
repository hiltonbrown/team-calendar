import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TenantContext } from "./index";

vi.mock("server-only", () => ({}), { virtual: true });
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });
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
  computeCurrentStatusForPeople,
  createManualAvailability,
  ensureCurrentUserPerson,
  ensureOrganisationForClerk,
  listAvailabilityRecords,
  listPeople,
  listTeamRecordsPage,
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
  await database.publicHolidayAssignment.deleteMany({
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
  await database.location.deleteMany({
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

describe("release list-query evidence", () => {
  test("returns no public-holiday people when no holiday applies", async () => {
    const result = await listPeople({
      clerkOrgId: tenantA.clerkOrgId,
      filters: { status: ["public_holiday"] },
      organisationId: tenantA.organisationId,
      pagination: { pageSize: 50 },
      role: "admin",
    });

    expect(result).toEqual({
      ok: true,
      value: { nextCursor: null, people: [], totalCount: 0 },
    });
  });

  test("matches every people status filter to the current-status oracle", async () => {
    const at = new Date("2026-10-03T14:30:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);

    const losAngelesLocationId = fixture.id("people-location", 0);
    const sydneyLocationId = fixture.id("people-location", 1);
    const workingOverrideLocationId = fixture.id("people-location", 2);
    const archivedOverrideLocationId = fixture.id("people-location", 3);
    await database.organisation.update({
      data: { timezone: "Australia/Brisbane" },
      where: { id: tenantA.organisationId },
    });
    await database.location.createMany({
      data: [
        {
          clerk_org_id: tenantA.clerkOrgId,
          country_code: "AU",
          id: losAngelesLocationId,
          name: "Previous local date",
          organisation_id: tenantA.organisationId,
          region_code: "NSW",
          timezone: "America/Los_Angeles",
        },
        {
          clerk_org_id: tenantA.clerkOrgId,
          country_code: "AU",
          id: sydneyLocationId,
          name: "Sydney after DST midnight",
          organisation_id: tenantA.organisationId,
          region_code: "NSW",
          timezone: "Australia/Sydney",
        },
        {
          clerk_org_id: tenantA.clerkOrgId,
          country_code: "AU",
          id: workingOverrideLocationId,
          name: "Working holiday override",
          organisation_id: tenantA.organisationId,
          region_code: "NSW",
          timezone: "Australia/Sydney",
        },
        {
          clerk_org_id: tenantA.clerkOrgId,
          country_code: "AU",
          id: archivedOverrideLocationId,
          name: "Archived holiday override",
          organisation_id: tenantA.organisationId,
          region_code: "NSW",
          timezone: "Australia/Sydney",
        },
      ],
    });
    await database.person.update({
      data: { archived_at: new Date("2026-09-01T00:00:00.000Z") },
      where: { id: tenantA.personId },
    });

    const statusCases = [
      ["alternative_contact", "alternative_contact", "approved"],
      ["another_office", "another_office", "approved"],
      ["client_site", "client_site", "approved"],
      ["limited_availability", "limited_availability", "approved"],
      ["offsite_meeting", "offsite_meeting", "approved"],
      ["on_leave", "annual_leave", "approved"],
      ["other", "other", "approved"],
      ["pending_leave", "annual_leave", "submitted"],
      ["training", "training", "approved"],
      ["travelling", "travelling", "approved"],
      ["wfh", "wfh", "approved"],
    ] as const;
    const statusPeople = statusCases.map(([status], index) => ({
      id: fixture.id("people-status-person", index),
      locationId: losAngelesLocationId,
      status,
    }));
    const holidayPersonId = fixture.id("people-status-person", 20);
    const workingOverridePersonId = fixture.id("people-status-person", 21);
    const archivedOverridePersonId = fixture.id("people-status-person", 22);
    const nullLocationPersonId = fixture.id("people-status-person", 23);
    const availablePersonId = fixture.id("people-status-person", 24);
    const archivedPersonId = fixture.id("people-status-person", 25);
    const people = [
      ...statusPeople,
      { id: holidayPersonId, locationId: sydneyLocationId },
      { id: workingOverridePersonId, locationId: workingOverrideLocationId },
      { id: archivedOverridePersonId, locationId: archivedOverrideLocationId },
      { id: nullLocationPersonId, locationId: null },
      { id: availablePersonId, locationId: losAngelesLocationId },
      { id: archivedPersonId, locationId: losAngelesLocationId },
    ];
    await database.person.createMany({
      data: people.map((person, index) => ({
        archived_at:
          person.id === archivedPersonId
            ? new Date("2026-09-01T00:00:00.000Z")
            : null,
        clerk_org_id: tenantA.clerkOrgId,
        email: `status-${index}@example.com`,
        employment_type: "employee" as const,
        first_name: "Status",
        id: person.id,
        is_active: true,
        last_name: index.toString().padStart(2, "0"),
        location_id: person.locationId,
        organisation_id: tenantA.organisationId,
        source_system: "MANUAL" as const,
      })),
    });
    await database.availabilityRecord.createMany({
      data: [
        ...statusCases.map(([, recordType, approvalStatus], index) => ({
          approval_status: approvalStatus,
          clerk_org_id: tenantA.clerkOrgId,
          contactability: "unavailable" as const,
          derived_uid_key: fixture.key("people-status-record", index),
          ends_at: new Date("2026-10-05T00:00:00.000Z"),
          id: fixture.id("people-status-record", index),
          organisation_id: tenantA.organisationId,
          person_id: statusPeople[index]?.id ?? tenantA.personId,
          privacy_mode: "named" as const,
          record_type: recordType,
          source_remote_id: fixture.key("people-status-remote", index),
          source_type: "team_calendar_leave" as const,
          starts_at: new Date("2026-10-03T00:00:00.000Z"),
        })),
        {
          approval_status: "approved",
          clerk_org_id: tenantA.clerkOrgId,
          contactability: "limited",
          derived_uid_key: fixture.key("people-status-record", 25),
          ends_at: new Date("2026-10-05T00:00:00.000Z"),
          id: fixture.id("people-status-record", 25),
          organisation_id: tenantA.organisationId,
          person_id: archivedPersonId,
          privacy_mode: "named",
          record_type: "wfh",
          source_remote_id: fixture.key("people-status-remote", 25),
          source_type: "team_calendar_leave",
          starts_at: new Date("2026-10-03T00:00:00.000Z"),
        },
        ...[
          [statusPeople[5]?.id, "travelling"],
          [statusPeople[9]?.id, "wfh"],
          [holidayPersonId, "wfh"],
        ].map(([personId, recordType], index) => ({
          approval_status: "approved" as const,
          clerk_org_id: tenantA.clerkOrgId,
          contactability: "limited" as const,
          derived_uid_key: fixture.key("people-precedence-record", index),
          ends_at: new Date("2026-10-05T00:00:00.000Z"),
          id: fixture.id("people-precedence-record", index),
          organisation_id: tenantA.organisationId,
          person_id: personId ?? tenantA.personId,
          privacy_mode: "named" as const,
          record_type: recordType ?? "wfh",
          source_remote_id: fixture.key("people-precedence-remote", index),
          source_type: "team_calendar_leave" as const,
          starts_at: new Date("2026-10-03T00:00:00.000Z"),
        })),
      ],
    });
    const holidayId = fixture.id("people-holiday", 0);
    await database.publicHoliday.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
        country_code: "AU",
        default_classification: "non_working",
        holiday_date: new Date("2026-10-04T00:00:00.000Z"),
        holiday_type: "public",
        id: holidayId,
        name: "Local date proof day",
        organisation_id: tenantA.organisationId,
        source: "manual",
        source_remote_id: fixture.key("people-holiday", 0),
      },
    });
    await database.publicHolidayAssignment.createMany({
      data: [
        {
          clerk_org_id: tenantA.clerkOrgId,
          day_classification: "working",
          id: fixture.id("people-holiday-assignment", 0),
          organisation_id: tenantA.organisationId,
          public_holiday_id: holidayId,
          scope_type: "location",
          scope_value: workingOverrideLocationId,
        },
        {
          archived_at: new Date("2026-09-01T00:00:00.000Z"),
          clerk_org_id: tenantA.clerkOrgId,
          day_classification: "working",
          id: fixture.id("people-holiday-assignment", 1),
          organisation_id: tenantA.organisationId,
          public_holiday_id: holidayId,
          scope_type: "location",
          scope_value: archivedOverrideLocationId,
        },
      ],
    });

    const oracle = await computeCurrentStatusForPeople({
      at,
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      people: people.map((person) => ({
        locationId: person.locationId,
        personId: person.id,
      })),
    });
    const statusKeys = [
      "alternative_contact",
      "another_office",
      "available",
      "client_site",
      "limited_availability",
      "offsite_meeting",
      "on_leave",
      "other",
      "pending_leave",
      "public_holiday",
      "training",
      "travelling",
      "wfh",
    ] as const;
    for (const status of statusKeys) {
      const expectedIds = people
        .filter(
          (person) =>
            person.id !== archivedPersonId &&
            oracle.get(person.id)?.statusKey === status
        )
        .map((person) => person.id)
        .sort();
      const result = await listPeople({
        clerkOrgId: tenantA.clerkOrgId,
        filters: { status: [status] },
        organisationId: tenantA.organisationId,
        pagination: { pageSize: 200 },
        role: "admin",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.value.people.map((person) => person.id).sort()).toEqual(
        expectedIds
      );
      expect(result.value.totalCount).toBe(expectedIds.length);
    }

    expect(oracle.get(holidayPersonId)?.statusKey).toBe("public_holiday");
    expect(oracle.get(workingOverridePersonId)?.statusKey).toBe("available");
    expect(oracle.get(archivedOverridePersonId)?.statusKey).toBe(
      "public_holiday"
    );
    expect(oracle.get(nullLocationPersonId)?.statusKey).toBe("public_holiday");
    expect(oracle.get(availablePersonId)?.statusKey).toBe("available");
    const archivedResult = await listPeople({
      clerkOrgId: tenantA.clerkOrgId,
      filters: { includeArchived: true, status: ["wfh"] },
      organisationId: tenantA.organisationId,
      pagination: { pageSize: 200 },
      role: "admin",
    });
    expect(archivedResult).toMatchObject({
      ok: true,
      value: {
        people: expect.arrayContaining([
          expect.objectContaining({ id: archivedPersonId }),
        ]),
      },
    });
  });

  test("keeps plan query count constant at 1, 50, and 200 rows", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const findMany = vi.spyOn(database.availabilityRecord, "findMany");
    const count = vi.spyOn(database.availabilityRecord, "count");
    const balanceFindMany = vi.spyOn(database.leaveBalance, "findMany");
    const connectionFindFirst = vi.spyOn(database.xeroConnection, "findFirst");
    const measurements: Array<{
      durationMs: number;
      payloadBytes: number;
      queryCount: number;
      rowCount: number;
    }> = [];

    for (const rowCount of [1, 50, 200]) {
      await database.availabilityRecord.deleteMany({
        where: {
          clerk_org_id: tenantA.clerkOrgId,
          organisation_id: tenantA.organisationId,
        },
      });
      const equalStartsAt = new Date("2026-06-10T00:00:00.000Z");
      const equalCreatedAt = new Date("2026-05-01T00:00:00.000Z");
      await database.availabilityRecord.createMany({
        data: Array.from({ length: rowCount }, (_, index) => ({
          approval_status: "approved" as const,
          clerk_org_id: tenantA.clerkOrgId,
          contactability: "limited" as const,
          created_at: equalCreatedAt,
          derived_uid_key: fixture.key(`plan-${rowCount}-uid`, index),
          ends_at: new Date("2026-06-12T00:00:00.000Z"),
          id: fixture.id(`plan-${rowCount}-record`, index),
          organisation_id: tenantA.organisationId,
          person_id: tenantA.personId,
          privacy_mode: "named" as const,
          record_type: "wfh" as const,
          source_remote_id: fixture.key(`plan-${rowCount}-remote`, index),
          source_type: "team_calendar_leave" as const,
          starts_at: equalStartsAt,
        })),
      });
      const beforeCalls =
        findMany.mock.calls.length +
        count.mock.calls.length +
        balanceFindMany.mock.calls.length +
        connectionFindFirst.mock.calls.length;
      const startedAt = process.hrtime.bigint();
      const result = await listTeamRecordsPage({
        actingOrgRole: "org:admin",
        clerkOrgId: tenantA.clerkOrgId,
        organisationId: tenantA.organisationId,
        pageSize: 200,
      });
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      const afterCalls =
        findMany.mock.calls.length +
        count.mock.calls.length +
        balanceFindMany.mock.calls.length +
        connectionFindFirst.mock.calls.length;
      const expectedIds = Array.from({ length: rowCount }, (_, index) =>
        fixture.id(`plan-${rowCount}-record`, index)
      ).sort();
      expect(result.value.items.map((item) => item.id)).toEqual(expectedIds);
      expect(result.value.totalCount).toBe(rowCount);
      measurements.push({
        durationMs,
        payloadBytes: Buffer.byteLength(JSON.stringify(result.value)),
        queryCount: afterCalls - beforeCalls,
        rowCount,
      });
    }

    expect(measurements.map(({ queryCount }) => queryCount)).toEqual([4, 4, 4]);
    expect(measurements.map(({ rowCount }) => rowCount)).toEqual([1, 50, 200]);
    expect(
      measurements.every(
        ({ durationMs, payloadBytes }) => durationMs >= 0 && payloadBytes > 0
      )
    ).toBe(true);
  });

  test("paginates equal timestamps after cursor deletion and supports all history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const equalStartsAt = new Date("2026-06-10T00:00:00.000Z");
    const equalCreatedAt = new Date("2026-05-01T00:00:00.000Z");
    const ids = Array.from({ length: 200 }, (_, index) =>
      fixture.id("plan-cursor-record", index)
    ).sort();
    await database.availabilityRecord.createMany({
      data: [
        ...ids.map((id, index) => ({
          approval_status: "approved" as const,
          clerk_org_id: tenantA.clerkOrgId,
          contactability: "limited" as const,
          created_at: equalCreatedAt,
          derived_uid_key: fixture.key("plan-cursor-uid", index),
          ends_at: new Date("2026-06-12T00:00:00.000Z"),
          id,
          organisation_id: tenantA.organisationId,
          person_id: tenantA.personId,
          privacy_mode: "named" as const,
          record_type: "wfh" as const,
          source_remote_id: fixture.key("plan-cursor-remote", index),
          source_type: "team_calendar_leave" as const,
          starts_at: equalStartsAt,
        })),
        {
          approval_status: "approved",
          clerk_org_id: tenantA.clerkOrgId,
          contactability: "limited",
          created_at: new Date("2020-01-01T00:00:00.000Z"),
          derived_uid_key: fixture.key("plan-history-uid", 0),
          ends_at: new Date("2020-01-03T00:00:00.000Z"),
          id: fixture.id("plan-history-record", 0),
          organisation_id: tenantA.organisationId,
          person_id: tenantA.personId,
          privacy_mode: "named",
          record_type: "wfh",
          source_remote_id: fixture.key("plan-history-remote", 0),
          source_type: "team_calendar_leave",
          starts_at: new Date("2019-12-30T00:00:00.000Z"),
        },
      ],
    });
    const first = await listTeamRecordsPage({
      actingOrgRole: "org:admin",
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      pageSize: 50,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.items.map((item) => item.id)).toEqual(ids.slice(0, 50));
    expect(first.value.totalCount).toBe(200);
    expect(first.value.nextCursor).not.toBeNull();
    await database.availabilityRecord.delete({ where: { id: ids[49] ?? "" } });
    const second = await listTeamRecordsPage({
      actingOrgRole: "org:admin",
      clerkOrgId: tenantA.clerkOrgId,
      cursor: first.value.nextCursor,
      organisationId: tenantA.organisationId,
      pageSize: 50,
    });
    expect(second).toMatchObject({
      ok: true,
      value: { totalCount: 199 },
    });
    if (second.ok) {
      expect(second.value.items.map((item) => item.id)).toEqual(
        ids.slice(50, 100)
      );
    }
    const allHistory = await listTeamRecordsPage({
      actingOrgRole: "org:admin",
      allHistory: true,
      clerkOrgId: tenantA.clerkOrgId,
      organisationId: tenantA.organisationId,
      pageSize: 200,
    });
    expect(allHistory.ok).toBe(true);
    if (allHistory.ok) {
      expect(allHistory.value.totalCount).toBe(200);
      expect(allHistory.value.items[0]?.id).toBe(
        fixture.id("plan-history-record", 0)
      );
      expect(allHistory.value.window).toEqual({ from: null, to: null });
    }
  });
});
