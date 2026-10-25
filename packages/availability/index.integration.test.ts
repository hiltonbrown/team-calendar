const tenantQueryCounter = vi.hoisted(() => ({ active: false, count: 0 }));
vi.mock("@repo/database/tenant-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@repo/database/tenant-client")>();
  return {
    ...original,
    referenceDatabase: new Proxy(original.referenceDatabase, {
      get(target, property, receiver) {
        if (property !== "$transaction") {
          return Reflect.get(target, property, receiver);
        }
        return <T>(
          run: (
            db: import("@repo/database").Prisma.TransactionClient
          ) => Promise<T>,
          options: import("@repo/database").TenantTransactionOptions
        ) =>
          target
            .$extends({
              query: {
                $allOperations: ({ args, query }) => {
                  if (tenantQueryCounter.active) {
                    tenantQueryCounter.count += 1;
                  }
                  return query(args);
                },
              },
            })
            .$transaction(run, options);
      },
    }),
  };
});

import type { AccountId, OrganisationId } from "@repo/core";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  withTenantDb as withTestTenantDb,
  withTenantResult as withTestTenantResult,
} from "@repo/database/tenant-db";
import { tenantTestAccount } from "@repo/database/test-fixtures/tenant-scope";
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

vi.mock("server-only", () => ({}));
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });
const fixture = allocateLiveTestFixture(
  "packages/availability/index.integration.test.ts"
);
const [tenantSlotA, tenantSlotB, provisioningTenant] = fixture.tenants;
const {
  archiveManualAvailability,
  computeCurrentStatusForPeople,
  createManualAvailability,
  ensureCurrentUserPerson,
  ensureOrganisationForAccount,
  listAvailabilityRecords,
  listPeople,
  listTeamRecordsPage,
  listTeamRecords,
  getRecord,
  loadWizardSnapshot,
  updateManualAvailability,
} = await import("./index");
const { systemDatabase: database } = await import("@repo/database");
interface TenantFixture {
  accountId: string;
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
if (!(tenantA.accountId && tenantB.accountId && provisioningTenant)) {
  throw new Error("Availability live fixture tenants were not allocated");
}
const provisioningAccountId = provisioningTenant.accountId;
const testAccountIds = [
  tenantA.accountId,
  tenantB.accountId,
  provisioningAccountId,
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
      account_id: tenant.accountId,
      country_code: "AU",
      id: tenant.organisationId,
      name: `Manual availability ${tenant.accountId}`,
    },
  });
  await database.person.create({
    data: {
      account_id: tenant.accountId,
      email: `${tenant.accountId}@example.com`,
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
  await database.xeroPersonMatch.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.syncRun.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.xeroConnection.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.outboundOperation.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.availabilityPublication.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.availabilityRecord.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.person.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.auditEvent.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.feedToken.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.feedScope.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.feed.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.publicHolidayPreference.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.publicHoliday.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.location.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.organisation.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
};
const contextFor = (tenant: TenantFixture): TenantContext => ({
  // Test fixture IDs are fixed strings that match the branded runtime shape.
  accountId: tenant.accountId as AccountId,
  organisationId: tenant.organisationId as OrganisationId,
});
const createProvisioningOrganisation = () =>
  database.organisation.create({
    data: {
      account_id: provisioningTenant.accountId,
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
  tenantQueryCounter.active = false;
  vi.restoreAllMocks();
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
describe("manual availability services", () => {
  test("creates records visible to scoped calendar and people queries", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        createManualAvailability(
          contextFor(tenantA),
          inputFor(tenantA),
          { role: "admin", userId: "user_test" },
          db
        )
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
    await expect(
      withTestTenantDb(tenantTestAccount(contextFor(tenantA)), (db) =>
        listAvailabilityRecords(contextFor(tenantA), undefined, db)
      )
    ).resolves.toEqual(
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
      withTestTenantResult(tenantTestAccount(contextFor(tenantA)), (db) =>
        createManualAvailability(
          contextFor(tenantA),
          {
            ...inputFor(tenantA),
            endsAt: new Date("2026-05-09T00:00:00.000Z"),
          },
          { role: "admin", userId: "user_test" },
          db
        )
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "bad_request" }),
      ok: false,
    });
    await expect(
      withTestTenantResult(tenantTestAccount(contextFor(tenantA)), (db) =>
        createManualAvailability(
          contextFor(tenantA),
          { ...inputFor(tenantA), personId: tenantB.personId },
          { role: "admin", userId: "user_test" },
          db
        )
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "not_found" }),
      ok: false,
    });
  });
  test("preserves creation UID and advances material publication while saving edited Brisbane slot instants", async () => {
    const actor = { role: "admin", userId: "user_admin" };
    const startsAt = new Date("2026-10-02T23:00:00.000Z");
    const endsAt = new Date("2026-10-03T00:00:00.000Z");
    const created = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        createManualAvailability(
          contextFor(tenantA),
          {
            ...inputFor(tenantA),
            allDay: false,
            endsAt,
            startsAt,
          },
          actor,
          db
        )
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    const where = {
      account_id: tenantA.accountId,
      id: created.value.id,
      organisation_id: tenantA.organisationId,
    };
    const original = await database.availabilityRecord.findFirstOrThrow({
      include: { publication: true },
      where,
    });
    expect(original.starts_at.toISOString()).toBe(startsAt.toISOString());
    expect(original.ends_at.toISOString()).toBe(endsAt.toISOString());
    const updated = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        updateManualAvailability(
          contextFor(tenantA),
          created.value.id,
          {
            allDay: false,
            endsAt: new Date("2026-10-04T00:00:00.000Z"),
            recordType: "training",
            startsAt: new Date("2026-10-03T23:00:00.000Z"),
          },
          actor,
          db
        )
    );
    expect(updated.ok).toBe(true);
    const stored = await database.availabilityRecord.findFirstOrThrow({
      include: { publication: true },
      where,
    });
    expect(stored.starts_at.toISOString()).toBe("2026-10-03T23:00:00.000Z");
    expect(stored.ends_at.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(stored.derived_uid_key).toBe(original.derived_uid_key);
    expect(stored.publication?.published_uid).toBe(
      original.publication?.published_uid
    );
    expect(original.publication).not.toBeNull();
    expect(stored.publication?.published_sequence).toBe(
      (original.publication?.published_sequence ?? 0) + 1
    );
    expect(
      await database.availabilityRecord.count({
        where: {
          ...where,
          account_id: tenantB.accountId,
          organisation_id: tenantB.organisationId,
        },
      })
    ).toBe(0);
  });
  test("updates and archives only manual records in the active tenant", async () => {
    const created = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        createManualAvailability(
          contextFor(tenantA),
          inputFor(tenantA),
          { role: "admin", userId: "user_test" },
          db
        )
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    await expect(
      withTestTenantResult(tenantTestAccount(contextFor(tenantB)), (db) =>
        updateManualAvailability(
          contextFor(tenantB),
          created.value.id,
          patchInput,
          { role: "admin", userId: "user_test" },
          db
        )
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "not_found" }),
      ok: false,
    });
    const updated = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        updateManualAvailability(
          contextFor(tenantA),
          created.value.id,
          {
            ...patchInput,
            contactability: "unavailable",
            includeInFeed: false,
            title: "Training day",
          },
          { role: "admin", userId: "user_test" },
          db
        )
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
      withTestTenantResult(tenantTestAccount(contextFor(tenantB)), (db) =>
        archiveManualAvailability(
          contextFor(tenantB),
          created.value.id,
          {
            role: "admin",
            userId: "user_test",
          },
          db
        )
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "not_found" }),
      ok: false,
    });
    await expect(
      withTestTenantResult(tenantTestAccount(contextFor(tenantA)), (db) =>
        archiveManualAvailability(
          contextFor(tenantA),
          created.value.id,
          {
            role: "admin",
            userId: "user_test",
          },
          db
        )
      )
    ).resolves.toMatchObject({ ok: true });
    await expect(
      withTestTenantDb(tenantTestAccount(contextFor(tenantA)), (db) =>
        listAvailabilityRecords(contextFor(tenantA), undefined, db)
      )
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.value.id }),
      ])
    );
  });
});
describe("current user person identity", () => {
  test("provisions one account-wide default feed when ensuring an organisation", async () => {
    await cleanTestData();
    await createProvisioningOrganisation();
    await withTestTenantDb(
      tenantTestAccount({
        accountId: provisioningAccountId,
        countryCode: "AU",
        name: "Default feed provisioning",
      }),
      (db) =>
        ensureOrganisationForAccount(
          {
            accountId: provisioningAccountId,
            countryCode: "AU",
            name: "Default feed provisioning",
          },
          db
        )
    );
    await expect(
      database.organisation.count({
        where: { account_id: provisioningAccountId },
      })
    ).resolves.toBe(1);
    const feeds = await database.feed.findMany({
      where: {
        account_id: provisioningAccountId,
        archived_at: null,
        organisation_id: null,
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
          account_id: provisioningAccountId,
          feed_id: feeds[0]?.id,
          organisation_id: null,
        },
      })
    ).resolves.toEqual([
      expect.objectContaining({ scope_type: "org", scope_value: null }),
    ]);
    await expect(
      database.feedToken.count({
        where: {
          account_id: provisioningAccountId,
          feed_id: feeds[0]?.id,
          organisation_id: null,
          status: "active",
        },
      })
    ).resolves.toBe(1);
    await withTestTenantDb(
      tenantTestAccount({
        accountId: provisioningAccountId,
        countryCode: "AU",
        name: "Default feed provisioning renamed",
      }),
      (db) =>
        ensureOrganisationForAccount(
          {
            accountId: provisioningAccountId,
            countryCode: "AU",
            name: "Default feed provisioning renamed",
          },
          db
        )
    );
    await expect(
      database.feed.count({
        where: {
          account_id: provisioningAccountId,
          organisation_id: null,
        },
      })
    ).resolves.toBe(1);
  });
  test("stores no official public holidays when ensuring an organisation", async () => {
    await cleanTestData();
    await createProvisioningOrganisation();
    const context = await withTestTenantDb(
      tenantTestAccount({
        accountId: provisioningAccountId,
        countryCode: "AU",
        name: "Default holiday provisioning test",
      }),
      (db) =>
        ensureOrganisationForAccount(
          {
            accountId: provisioningAccountId,
            countryCode: "AU",
            name: "Default holiday provisioning test",
          },
          db
        )
    );
    const orgCount = await database.organisation.count({
      where: { account_id: provisioningAccountId },
    });
    expect(orgCount).toBe(1);
    // Official holidays come from the bundled reference files at read time.
    await expect(
      database.publicHoliday.count({
        where: {
          account_id: provisioningAccountId,
          organisation_id: context.organisationId,
        },
      })
    ).resolves.toBe(0);
  });
  test("returns an existing linked person", async () => {
    await database.person.update({
      data: { user_id: "user_existing" },
      where: { id: tenantA.personId },
    });
    const result = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            displayName: "Existing User",
            email: `${tenantA.accountId}@example.com`,
            userId: "user_existing",
          },
          db
        )
    );
    expect(result).toMatchObject({
      ok: true,
      value: expect.objectContaining({ id: tenantA.personId }),
    });
  });
  test("links one same-email unlinked person in the active tenant", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            displayName: "Manual Person",
            email: `${tenantA.accountId}@example.com`,
            userId: "user_same_email",
          },
          db
        )
    );
    expect(result).toMatchObject({
      ok: true,
      value: expect.objectContaining({ id: tenantA.personId }),
    });
    await expect(
      database.person.findFirst({
        select: { id: true },
        where: {
          id: tenantA.personId,
          organisation_id: tenantA.organisationId,
          user_id: "user_same_email",
        },
      })
    ).resolves.toEqual({ id: tenantA.personId });
  });
  test("does not link same-email people outside the active tenant", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            displayName: "Cross Tenant",
            email: `${tenantB.accountId}@example.com`,
            userId: "user_cross_tenant",
          },
          db
        )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.id).not.toBe(tenantB.personId);
    await expect(
      database.person.findUnique({
        select: { user_id: true },
        where: { id: tenantB.personId },
      })
    ).resolves.toEqual({ user_id: null });
  });
  test("creates a manual person when no same-email profile exists", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount(contextFor(tenantA)),
      (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            avatarUrl: "https://img.clerk.com/avatar.png",
            displayName: "New User",
            email: "New.User@example.com",
            userId: "user_new",
          },
          db
        )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    await expect(
      database.person.findUnique({
        select: {
          account_id: true,
          avatar_url: true,
          email: true,
          organisation_id: true,
          source_system: true,
          user_id: true,
        },
        where: { id: result.value.id },
      })
    ).resolves.toEqual({
      account_id: tenantA.accountId,
      avatar_url: "https://img.clerk.com/avatar.png",
      email: "new.user@example.com",
      organisation_id: tenantA.organisationId,
      source_system: "MANUAL",
      user_id: "user_new",
    });
  });
  test("returns a conflict when multiple same-email people exist", async () => {
    await database.person.createMany({
      data: [
        {
          account_id: tenantA.accountId,
          email: "duplicate@example.com",
          employment_type: "employee",
          first_name: "Duplicate",
          id: fixture.id("person", 101),
          last_name: "One",
          organisation_id: tenantA.organisationId,
          source_system: "MANUAL",
        },
        {
          account_id: tenantA.accountId,
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
      withTestTenantResult(tenantTestAccount(contextFor(tenantA)), (db) =>
        ensureCurrentUserPerson(
          contextFor(tenantA),
          {
            displayName: "Duplicate User",
            email: "duplicate@example.com",
            userId: "user_conflict",
          },
          db
        )
      )
    ).resolves.toMatchObject({
      error: expect.objectContaining({ code: "conflict" }),
      ok: false,
    });
  });
});
describe("release list-query evidence", () => {
  test("returns no public-holiday people when no holiday applies", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        accountId: tenantA.accountId,
        filters: { status: ["public_holiday"] },
        organisationId: tenantA.organisationId,
        pagination: { pageSize: 50 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: tenantA.accountId,
            filters: { status: ["public_holiday"] },
            organisationId: tenantA.organisationId,
            pagination: { pageSize: 50 },
            role: "admin",
          },
          db
        )
    );
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
          account_id: tenantA.accountId,
          country_code: "AU",
          id: losAngelesLocationId,
          name: "Previous local date",
          organisation_id: tenantA.organisationId,
          region_code: "NSW",
          timezone: "America/Los_Angeles",
        },
        {
          account_id: tenantA.accountId,
          country_code: "AU",
          id: sydneyLocationId,
          name: "Sydney after DST midnight",
          organisation_id: tenantA.organisationId,
          region_code: "NSW",
          timezone: "Australia/Sydney",
        },
        {
          account_id: tenantA.accountId,
          country_code: "AU",
          id: workingOverrideLocationId,
          name: "Working holiday override",
          organisation_id: tenantA.organisationId,
          region_code: "NSW",
          timezone: "Australia/Sydney",
        },
        {
          account_id: tenantA.accountId,
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
        account_id: tenantA.accountId,
        archived_at:
          person.id === archivedPersonId
            ? new Date("2026-09-01T00:00:00.000Z")
            : null,
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
          account_id: tenantA.accountId,
          approval_status: approvalStatus,
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
          account_id: tenantA.accountId,
          approval_status: "approved" as const,
          contactability: "limited" as const,
          derived_uid_key: fixture.key("people-status-record", 25),
          ends_at: new Date("2026-10-05T00:00:00.000Z"),
          id: fixture.id("people-status-record", 25),
          organisation_id: tenantA.organisationId,
          person_id: archivedPersonId,
          privacy_mode: "named" as const,
          record_type: "wfh" as const,
          source_remote_id: fixture.key("people-status-remote", 25),
          source_type: "team_calendar_leave" as const,
          starts_at: new Date("2026-10-03T00:00:00.000Z"),
        },
        ...(
          [
            [statusPeople[5]?.id, "travelling"],
            [statusPeople[9]?.id, "wfh"],
            [holidayPersonId, "wfh"],
          ] as const
        ).map(([personId, recordType], index) => ({
          account_id: tenantA.accountId,
          approval_status: "approved" as const,
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
        account_id: tenantA.accountId,
        country_code: "AU",
        default_classification: "non_working",
        holiday_date: new Date("2026-10-04T00:00:00.000Z"),
        holiday_type: "custom",
        id: holidayId,
        name: "Local date proof day",
        organisation_id: tenantA.organisationId,
        source: "manual",
        source_remote_id: fixture.key("people-holiday", 0),
      },
    });
    // The archived-override location has no preference, so the holiday keeps
    // its default non-working classification there.
    await database.publicHolidayPreference.create({
      data: {
        account_id: tenantA.accountId,
        holiday_key: `custom:${holidayId}`,
        id: fixture.id("people-holiday-preference", 0),
        location_id: workingOverrideLocationId,
        organisation_id: tenantA.organisationId,
        setting: "working",
      },
    });
    const oracle = await withTestTenantDb(
      tenantTestAccount({
        accountId: tenantA.accountId,
        at,
        organisationId: tenantA.organisationId,
        people: people.map((person) => ({
          locationId: person.locationId,
          personId: person.id,
        })),
      }),
      (db) =>
        computeCurrentStatusForPeople(
          {
            accountId: tenantA.accountId,
            at,
            organisationId: tenantA.organisationId,
            people: people.map((person) => ({
              locationId: person.locationId,
              personId: person.id,
            })),
          },
          db
        )
    );
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
      const result = await withTestTenantResult(
        tenantTestAccount({
          accountId: tenantA.accountId,
          filters: { status: [status] },
          organisationId: tenantA.organisationId,
          pagination: { pageSize: 200 },
          role: "admin",
        }),
        (db) =>
          listPeople(
            {
              accountId: tenantA.accountId,
              filters: { status: [status] },
              organisationId: tenantA.organisationId,
              pagination: { pageSize: 200 },
              role: "admin",
            },
            db
          )
      );
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
    const archivedResult = await withTestTenantResult(
      tenantTestAccount({
        accountId: tenantA.accountId,
        filters: { includeArchived: true, status: ["wfh"] },
        organisationId: tenantA.organisationId,
        pagination: { pageSize: 200 },
        role: "admin",
      }),
      (db) =>
        listPeople(
          {
            accountId: tenantA.accountId,
            filters: { includeArchived: true, status: ["wfh"] },
            organisationId: tenantA.organisationId,
            pagination: { pageSize: 200 },
            role: "admin",
          },
          db
        )
    );
    expect(archivedResult).toMatchObject({
      ok: true,
      value: {
        people: expect.arrayContaining([
          expect.objectContaining({ id: archivedPersonId }),
        ]),
      },
    });
  });
  test.each([
    ["approve", "outcome_unknown"],
    ["decline", "provider_accepted"],
    ["withdraw", "prepared"],
  ] as const)(
    "exposes imported %s %s on Plans without editing provider records or crossing scope",
    async (action, status) => {
      const pendingId = fixture.id("imported-recovery-record", 0);
      const completedId = fixture.id("imported-recovery-record", 1);
      const foreignId = fixture.id("imported-recovery-record", 2);
      await database.availabilityRecord.createMany({
        data: [pendingId, completedId, foreignId].map((id, index) => {
          const tenant = index === 2 ? tenantB : tenantA;
          return {
            account_id: tenant.accountId,
            approval_status: "submitted" as const,
            contactability: "limited" as const,
            derived_uid_key: fixture.key("imported-recovery-uid", index),
            ends_at: new Date("2026-11-06T00:00:00.000Z"),
            id,
            organisation_id: tenant.organisationId,
            person_id: tenant.personId,
            privacy_mode: "named" as const,
            record_type: "annual_leave" as const,
            source_remote_id: fixture.key("imported-recovery-remote", index),
            source_type: "xero_leave" as const,
            starts_at: new Date("2026-11-02T00:00:00.000Z"),
          };
        }),
      });
      await database.outboundOperation.createMany({
        data: [pendingId, completedId, foreignId].map((id, index) => {
          const tenant = index === 2 ? tenantB : tenantA;
          return {
            account_id: tenant.accountId,
            action,
            actor_user_id: "recovery_actor",
            availability_record_id: id,
            organisation_id: tenant.organisationId,
            request_fingerprint: fixture.key(
              "imported-recovery-fingerprint",
              index
            ),
            status: index === 1 ? ("completed" as const) : status,
          };
        }),
      });
      const scope = {
        accountId: tenantA.accountId,
        actingRole: "admin",
        allHistory: true,
        organisationId: tenantA.organisationId,
      };
      for (const filters of [undefined, { sourceType: ["xero_leave"] }]) {
        const result = await withTestTenantResult(
          tenantTestAccount({ ...scope, filters }),
          (db) => listTeamRecordsPage({ ...scope, filters }, db)
        );
        expect(result).toMatchObject({
          ok: true,
          value: {
            items: [
              {
                editableActions: ["view"],
                id: pendingId,
                submissionResolutionPending: true,
              },
            ],
            totalCount: 1,
          },
        });
        await expect(
          withTestTenantResult(tenantTestAccount({ ...scope, filters }), (db) =>
            listTeamRecords({ ...scope, filters }, db)
          )
        ).resolves.toMatchObject({
          ok: true,
          value: [
            {
              editableActions: ["view"],
              id: pendingId,
              submissionResolutionPending: true,
            },
          ],
        });
      }
      await expect(
        withTestTenantResult(
          tenantTestAccount({
            ...scope,
            actingUserId: "recovery_actor",
            recordId: pendingId,
          }),
          (db) =>
            getRecord(
              {
                ...scope,
                actingUserId: "recovery_actor",
                recordId: pendingId,
              },
              db
            )
        )
      ).resolves.toMatchObject({
        ok: true,
        value: {
          editableActions: ["view"],
          id: pendingId,
          submissionResolutionPending: true,
        },
      });
      for (const mismatchedScope of [
        { ...scope, accountId: tenantB.accountId },
        { ...scope, organisationId: tenantB.organisationId },
      ]) {
        await expect(
          withTestTenantResult(tenantTestAccount(mismatchedScope), (db) =>
            listTeamRecordsPage(mismatchedScope, db)
          )
        ).resolves.toMatchObject({
          ok: true,
          value: { items: [], totalCount: 0 },
        });
      }
      await expect(
        withTestTenantResult(
          tenantTestAccount({
            ...scope,
            actingRole: "viewer",
            actingUserId: "unlinked_viewer",
            recordId: pendingId,
          }),
          (db) =>
            getRecord(
              {
                ...scope,
                actingRole: "viewer",
                actingUserId: "unlinked_viewer",
                recordId: pendingId,
              },
              db
            )
        )
      ).resolves.toMatchObject({
        error: { code: "not_authorised" },
        ok: false,
      });
    }
  );
  test("keeps plan query count constant at 1, 50, and 200 rows", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    tenantQueryCounter.active = true;
    tenantQueryCounter.count = 0;
    const measurements: Array<{
      durationMs: number;
      payloadBytes: number;
      queryCount: number;
      rowCount: number;
    }> = [];
    for (const rowCount of [1, 50, 200]) {
      await database.availabilityRecord.deleteMany({
        where: {
          account_id: tenantA.accountId,
          organisation_id: tenantA.organisationId,
        },
      });
      const equalStartsAt = new Date("2026-06-10T00:00:00.000Z");
      const equalCreatedAt = new Date("2026-05-01T00:00:00.000Z");
      await database.availabilityRecord.createMany({
        data: Array.from({ length: rowCount }, (_, index) => ({
          account_id: tenantA.accountId,
          approval_status: "approved" as const,
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
      const beforeCalls = tenantQueryCounter.count;
      const startedAt = process.hrtime.bigint();
      const result = await withTestTenantResult(
        tenantTestAccount({
          accountId: tenantA.accountId,
          actingRole: "admin",
          organisationId: tenantA.organisationId,
          pageSize: 200,
        }),
        (db) =>
          listTeamRecordsPage(
            {
              accountId: tenantA.accountId,
              actingRole: "admin",
              organisationId: tenantA.organisationId,
              pageSize: 200,
            },
            db
          )
      );
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      const afterCalls = tenantQueryCounter.count;
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
    expect(measurements.every(({ queryCount }) => queryCount > 0)).toBe(true);
    expect(new Set(measurements.map(({ queryCount }) => queryCount)).size).toBe(
      1
    );
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
          account_id: tenantA.accountId,
          approval_status: "approved" as const,
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
          account_id: tenantA.accountId,
          approval_status: "approved",
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
    const first = await withTestTenantResult(
      tenantTestAccount({
        accountId: tenantA.accountId,
        actingRole: "admin",
        organisationId: tenantA.organisationId,
        pageSize: 50,
      }),
      (db) =>
        listTeamRecordsPage(
          {
            accountId: tenantA.accountId,
            actingRole: "admin",
            organisationId: tenantA.organisationId,
            pageSize: 50,
          },
          db
        )
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.items.map((item) => item.id)).toEqual(ids.slice(0, 50));
    expect(first.value.totalCount).toBe(200);
    expect(first.value.nextCursor).not.toBeNull();
    await database.availabilityRecord.delete({ where: { id: ids[49] ?? "" } });
    const second = await withTestTenantResult(
      tenantTestAccount({
        accountId: tenantA.accountId,
        actingRole: "admin",
        cursor: first.value.nextCursor,
        organisationId: tenantA.organisationId,
        pageSize: 50,
      }),
      (db) =>
        listTeamRecordsPage(
          {
            accountId: tenantA.accountId,
            actingRole: "admin",
            cursor: first.value.nextCursor,
            organisationId: tenantA.organisationId,
            pageSize: 50,
          },
          db
        )
    );
    expect(second).toMatchObject({
      ok: true,
      value: { totalCount: 199 },
    });
    if (second.ok) {
      expect(second.value.items.map((item) => item.id)).toEqual(
        ids.slice(50, 100)
      );
    }
    const allHistory = await withTestTenantResult(
      tenantTestAccount({
        accountId: tenantA.accountId,
        actingRole: "admin",
        allHistory: true,
        organisationId: tenantA.organisationId,
        pageSize: 200,
      }),
      (db) =>
        listTeamRecordsPage(
          {
            accountId: tenantA.accountId,
            actingRole: "admin",
            allHistory: true,
            organisationId: tenantA.organisationId,
            pageSize: 200,
          },
          db
        )
    );
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

describe("onboarding wizard snapshot", () => {
  test("reads import progress since the latest request within the tenant", async () => {
    const requestedAt = new Date("2026-10-09T01:00:00.000Z");
    await database.organisation.update({
      data: { onboarding_step: "people", timezone: "Australia/Sydney" },
      where: { id: tenantA.organisationId },
    });
    await database.person.update({
      data: { user_id: "user_wizard_admin" },
      where: { id: tenantA.personId },
    });
    const connection = await database.xeroConnection.create({
      data: {
        account_id: tenantA.accountId,
        initial_sync_requested_at: requestedAt,
        // Left over from an earlier connection, so it must not count.
        last_full_leave_records_sync_at: new Date("2026-10-01T00:00:00.000Z"),
        last_full_people_sync_at: new Date("2026-10-09T01:05:00.000Z"),
        organisation_id: tenantA.organisationId,
        payroll_region: "AU",
        xero_tenant_id: fixture.key("xero_tenant"),
      },
    });
    await database.syncRun.create({
      data: {
        account_id: tenantA.accountId,
        organisation_id: tenantA.organisationId,
        run_type: "leave_records",
        started_at: new Date("2026-10-09T01:06:00.000Z"),
        status: "failed",
        xero_connection_id: connection.id,
      },
    });
    await database.xeroPersonMatch.create({
      data: {
        account_id: tenantA.accountId,
        detected_reason: "same_email",
        organisation_id: tenantA.organisationId,
        xero_person_id: tenantA.personId,
      },
    });

    const actor = {
      accountId: tenantA.accountId,
      actingRole: "admin",
      organisationId: tenantA.organisationId,
      userId: "user_wizard_admin",
    };
    await expect(
      withTestTenantResult(tenantTestAccount(actor), (db) =>
        loadWizardSnapshot(actor, db)
      )
    ).resolves.toEqual({
      ok: true,
      value: {
        actingUserLinked: true,
        completed: false,
        import: { balances: "running", leave: "failed", people: "complete" },
        mode: "xero",
        pendingMatches: 1,
        step: "people",
        timezoneConfirmed: true,
      },
    });
    await expect(
      withTestTenantResult(
        tenantTestAccount({
          ...actor,
          accountId: tenantB.accountId,
          organisationId: tenantB.organisationId,
        }),
        (db) =>
          loadWizardSnapshot(
            {
              ...actor,
              accountId: tenantB.accountId,
              organisationId: tenantB.organisationId,
            },
            db
          )
      )
    ).resolves.toMatchObject({
      ok: true,
      value: {
        actingUserLinked: false,
        mode: "undecided",
        pendingMatches: 0,
        step: "details",
      },
    });
  });
});
