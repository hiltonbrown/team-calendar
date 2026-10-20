import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  withTenantDb as withTestTenantDb,
  withTenantResult as withTestTenantResult,
} from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  ensureDefaultCalendarFeed: vi.fn(),
  organisationCreate: vi.fn(),
  organisationFindFirst: vi.fn(),
  organisationUpdate: vi.fn(),
  personCreateMany: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  personUpdate: vi.fn(),
  withinLimit: vi.fn(),
  xeroPersonMatchFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({ withinLimit: mocks.withinLimit }));
vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase()),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),
  lockPlanLimitMutations: vi.fn(async () => undefined),
  resolveAccountCompanies: async () => [
    {
      country_code: "AU",
      id: organisationId,
      name: "Acme Org",
      timezone: "Australia/Brisbane",
    },
  ],

  scopedQuery: (inputClerkOrgId: string, inputOrganisationId: string) => ({
    clerk_org_id: inputClerkOrgId,
    organisation_id: inputOrganisationId,
  }),
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...{
      organisation: {
        create: mocks.organisationCreate,
        findFirst: mocks.organisationFindFirst,
        update: mocks.organisationUpdate,
      },
      person: {
        createMany: mocks.personCreateMany,
        findFirst: mocks.personFindFirst,
        findMany: mocks.personFindMany,
        update: mocks.personUpdate,
      },
      xeroPersonMatch: {
        findFirst: mocks.xeroPersonMatchFindFirst,
      },
    },
  };
}
vi.mock("@repo/feeds", () => ({
  ensureDefaultCalendarFeed: mocks.ensureDefaultCalendarFeed,
}));

const { ensureCurrentUserPerson, ensureOrganisationForClerk } = await import(
  "./current-user-service"
);

const clerkOrgId = "org_current_user_test";
const organisationId = "c1000000-0000-4000-8000-000000000001";
const otherOrganisationId = "c1000000-0000-4000-8000-000000000002";
const personId = "c2000000-0000-4000-8000-000000000001";
const tenant = { clerkOrgId, organisationId };

const organisation = {
  clerk_org_id: clerkOrgId,
  country_code: "AU",
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  id: organisationId,
  name: "Current user test",
};

const person = {
  archived_at: null,
  clerk_org_id: clerkOrgId,
  clerk_user_id: null,
  display_name: "Case Person",
  email: "case.person@example.com",
  first_name: "Case",
  id: personId,
  job_title: "Engineer",
  last_name: "Person",
  location: { name: "Brisbane" },
  organisation_id: organisationId,
  team: { name: "Platform" },
};

describe("current-user-service organisation provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: true, current: 0, limit: 1 },
    });
    mocks.organisationCreate.mockResolvedValue(organisation);
    mocks.organisationUpdate.mockResolvedValue(organisation);
    mocks.ensureDefaultCalendarFeed.mockResolvedValue({
      ok: true,
      value: { created: true, feedId: "feed_1" },
    });
  });

  it("creates an organisation once and provisions its defaults", async () => {
    mocks.organisationFindFirst.mockResolvedValue(null);

    const result = await withTestTenantDb(
      tenantTestAccount({
        clerkOrgId,
        countryCode: "AU",
        name: "Current user test",
      }),
      (db) =>
        ensureOrganisationForClerk(
          {
            clerkOrgId,
            countryCode: "AU",
            name: "Current user test",
          },
          db
        )
    );

    expect(result).toEqual({ clerkOrgId, organisationId });
    expect(mocks.withinLimit).toHaveBeenCalledWith(
      clerkOrgId,
      "00000000-0000-4000-8000-000000000000",
      "payroll_entities",
      expect.any(Object)
    );
    expect(mocks.organisationCreate).toHaveBeenCalledWith({
      data: {
        clerk_org_id: clerkOrgId,
        country_code: "AU",
        fiscal_year_start: 7,
        locale: "en-AU",
        name: "Current user test",
        reporting_unit: "hours",
        timezone: "UTC",
        working_hours_per_day: 7.6,
      },
    });
    expect(mocks.ensureDefaultCalendarFeed).toHaveBeenCalledWith(
      { clerkOrgId, organisationId },
      expect.any(Object)
    );
  });

  it("updates the oldest active organisation idempotently", async () => {
    mocks.organisationFindFirst.mockResolvedValue(organisation);

    const result = await withTestTenantDb(
      tenantTestAccount({
        clerkOrgId,
        countryCode: "NZ",
        fiscalYearStart: 4,
        locale: "en-NZ",
        name: "Updated organisation",
        reportingUnit: "days",
        timezone: "Pacific/Auckland",
        workingHoursPerDay: 8,
      }),
      (db) =>
        ensureOrganisationForClerk(
          {
            clerkOrgId,
            countryCode: "NZ",
            fiscalYearStart: 4,
            locale: "en-NZ",
            name: "Updated organisation",
            reportingUnit: "days",
            timezone: "Pacific/Auckland",
            workingHoursPerDay: 8,
          },
          db
        )
    );

    expect(result).toEqual({ clerkOrgId, organisationId });
    expect(mocks.organisationFindFirst).toHaveBeenCalledWith({
      orderBy: { created_at: "asc" },
      where: { archived_at: null, clerk_org_id: clerkOrgId },
    });
    expect(mocks.withinLimit).not.toHaveBeenCalled();
    expect(mocks.organisationCreate).not.toHaveBeenCalled();
    expect(mocks.organisationUpdate).toHaveBeenCalledWith({
      data: {
        country_code: "NZ",
        fiscal_year_start: 4,
        locale: "en-NZ",
        name: "Updated organisation",
        reporting_unit: "days",
        timezone: "Pacific/Auckland",
        working_hours_per_day: 8,
      },
      where: { id: organisationId },
    });
  });

  it("fails closed when the payroll-entity limit cannot be checked", async () => {
    mocks.organisationFindFirst.mockResolvedValue(null);
    mocks.withinLimit.mockResolvedValue({
      error: { code: "internal", message: "Database unavailable" },
      ok: false,
    });

    await expect(
      withTestTenantDb(
        tenantTestAccount({
          clerkOrgId,
          countryCode: "AU",
          name: "Blocked organisation",
        }),
        (db) =>
          ensureOrganisationForClerk(
            {
              clerkOrgId,
              countryCode: "AU",
              name: "Blocked organisation",
            },
            db
          )
      )
    ).rejects.toThrow("Unable to verify billing limits. Please try again.");
    expect(mocks.organisationCreate).not.toHaveBeenCalled();
    expect(mocks.ensureDefaultCalendarFeed).not.toHaveBeenCalled();
  });

  it("rejects creation at the authoritative payroll-entity limit", async () => {
    mocks.organisationFindFirst.mockResolvedValue(null);
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: false, current: 1, limit: 1 },
    });

    await expect(
      withTestTenantDb(
        tenantTestAccount({
          clerkOrgId,
          countryCode: "AU",
          name: "Blocked organisation",
        }),
        (db) =>
          ensureOrganisationForClerk(
            {
              clerkOrgId,
              countryCode: "AU",
              name: "Blocked organisation",
            },
            db
          )
      )
    ).rejects.toThrow(
      "Your current plan has reached its payroll entity limit."
    );
    expect(mocks.organisationCreate).not.toHaveBeenCalled();
  });

  it("retries default provisioning after a partially provisioned organisation", async () => {
    mocks.organisationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(organisation);
    mocks.ensureDefaultCalendarFeed
      .mockResolvedValueOnce({
        error: { code: "unknown_error", message: "Feed unavailable" },
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { created: true, feedId: "feed_1" },
      });

    await expect(
      withTestTenantDb(
        tenantTestAccount({
          clerkOrgId,
          countryCode: "AU",
          name: "Current user test",
        }),
        (db) =>
          ensureOrganisationForClerk(
            {
              clerkOrgId,
              countryCode: "AU",
              name: "Current user test",
            },
            db
          )
      )
    ).rejects.toThrow("Feed unavailable");

    await expect(
      withTestTenantDb(
        tenantTestAccount({
          clerkOrgId,
          countryCode: "AU",
          name: "Current user test",
        }),
        (db) =>
          ensureOrganisationForClerk(
            {
              clerkOrgId,
              countryCode: "AU",
              name: "Current user test",
            },
            db
          )
      )
    ).resolves.toEqual({ clerkOrgId, organisationId });
    expect(mocks.organisationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.organisationUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.ensureDefaultCalendarFeed).toHaveBeenCalledTimes(2);
  });
});

describe("current-user-service person provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindFirst.mockReset().mockResolvedValue(null);
    mocks.personFindMany.mockReset().mockResolvedValue([]);
    mocks.xeroPersonMatchFindFirst.mockResolvedValue(null);
    mocks.personCreateMany
      .mockReset()
      .mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          mocks.personFindFirst.mockResolvedValue({
            ...person,
            ...data,
            id: "c2000000-0000-4000-8000-000000000009",
          });
          return await { count: 1 };
        }
      );
    mocks.personUpdate.mockResolvedValue({
      ...person,
      clerk_user_id: "user_case",
      display_name: "Case Updated",
    });
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: true, current: 8, limit: 9 },
    });
  });

  it("returns a pre-linked person without checking email or seat limits", async () => {
    mocks.personFindFirst.mockResolvedValue({
      ...person,
      clerk_user_id: "user_existing",
    });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_existing",
          email: "different@example.com",
        },
        db
      )
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: personId,
        initials: "CP",
        locationName: "Brisbane",
        teamName: "Platform",
      },
    });
    expect(mocks.personFindFirst).toHaveBeenCalledWith({
      include: { location: true, team: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        clerk_user_id: "user_existing",
        organisation_id: { in: [organisationId] },
      },
    });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(mocks.withinLimit).not.toHaveBeenCalled();
  });

  it("links one unclaimed person by case-insensitive email within the tenant", async () => {
    mocks.personFindMany.mockResolvedValue([person]);

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          avatarUrl: " https://img.example.com/avatar.png ",
          clerkUserId: "user_case",
          displayName: " Case Updated ",
          email: " CASE.PERSON@EXAMPLE.COM ",
        },
        db
      )
    );

    expect(result).toMatchObject({
      ok: true,
      value: { id: personId, name: "Case Updated" },
    });
    expect(mocks.personFindMany).toHaveBeenCalledWith({
      include: { location: true, team: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        clerk_user_id: null,
        email: { equals: "case.person@example.com", mode: "insensitive" },
        organisation_id: { in: [organisationId] },
      },
    });
    expect(mocks.personUpdate).toHaveBeenCalledWith({
      data: {
        avatar_url: "https://img.example.com/avatar.png",
        clerk_user_id: "user_case",
        display_name: "Case Updated",
      },
      include: { location: true, team: true },
      where: { id: personId },
    });
    expect(mocks.withinLimit).not.toHaveBeenCalled();
  });

  it("returns a conflict for duplicate unclaimed email candidates", async () => {
    mocks.personFindMany.mockResolvedValue([
      person,
      { ...person, id: "c2000000-0000-4000-8000-000000000002" },
    ]);

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_duplicate",
          email: "case.person@example.com",
        },
        db
      )
    );

    expect(result).toEqual({
      error: {
        code: "conflict",
        message:
          "Multiple people match this Clerk user's email. Review the people directory before opening plans.",
      },
      ok: false,
    });
    expect(mocks.personUpdate).not.toHaveBeenCalled();
    expect(mocks.personCreateMany).not.toHaveBeenCalled();
    expect(mocks.withinLimit).not.toHaveBeenCalled();
  });

  it("creates a tenant-scoped fallback person at the final available seat", async () => {
    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          avatarUrl: "https://img.example.com/new.png",
          clerkUserId: "user_new",
          displayName: "New Person",
          email: "NEW.PERSON@EXAMPLE.COM",
          jobTitle: "Designer",
        },
        db
      )
    );

    expect(result.ok).toBe(true);
    expect(mocks.withinLimit).toHaveBeenCalledWith(
      clerkOrgId,
      organisationId,
      "seats",
      expect.any(Object)
    );
    expect(mocks.personCreateMany).toHaveBeenCalledWith({
      data: {
        avatar_url: "https://img.example.com/new.png",
        clerk_org_id: clerkOrgId,
        clerk_user_id: "user_new",
        display_name: "New Person",
        email: "new.person@example.com",
        employment_type: "employee",
        first_name: "New",
        job_title: "Designer",
        last_name: "Person",
        organisation_id: organisationId,
        source_system: "MANUAL",
      },
      skipDuplicates: true,
    });
  });

  it("uses an internal email when Clerk does not provide one", async () => {
    await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_new",
          firstName: "New",
          lastName: "Person",
        },
        db
      )
    );

    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(mocks.personCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "user_new@internal" }),
      })
    );
  });

  it("rejects fallback creation at the authoritative seat limit", async () => {
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: false, current: 9, limit: 9 },
    });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_blocked",
          email: "blocked@example.com",
        },
        db
      )
    );

    expect(result).toEqual({
      error: {
        code: "bad_request",
        message: "Your current plan has reached its active people limit.",
      },
      ok: false,
    });
    expect(mocks.personCreateMany).not.toHaveBeenCalled();
  });

  it("propagates authoritative seat-check errors without creating a person", async () => {
    mocks.withinLimit.mockResolvedValue({
      error: { code: "internal", message: "Failed to check billing limits." },
      ok: false,
    });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_error",
          email: "error@example.com",
        },
        db
      )
    );

    expect(result).toEqual({
      error: { code: "internal", message: "Failed to check billing limits." },
      ok: false,
    });
    expect(mocks.personCreateMany).not.toHaveBeenCalled();
  });

  it("reuses the winner when concurrent fallback insertion skips a duplicate", async () => {
    const concurrentlyCreated = {
      ...person,
      clerk_user_id: "user_race",
      id: "c2000000-0000-4000-8000-000000000008",
    };
    mocks.personFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentlyCreated);
    mocks.personCreateMany.mockResolvedValue({ count: 0 });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_race",
          email: "race@example.com",
        },
        db
      )
    );

    expect(result).toMatchObject({
      ok: true,
      value: { id: concurrentlyCreated.id },
    });
    expect(mocks.personFindFirst).toHaveBeenLastCalledWith({
      include: { location: true, team: true },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        clerk_user_id: "user_race",
        organisation_id: organisationId,
      },
    });
  });

  it("returns a conflict when a skipped insert has no scoped winner", async () => {
    mocks.personCreateMany.mockResolvedValue({ count: 0 });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_missing_winner",
          email: "missing-winner@example.com",
        },
        db
      )
    );

    expect(result).toEqual({
      error: {
        code: "conflict",
        message: "The person could not be linked. Review the people directory.",
      },
      ok: false,
    });
    expect(mocks.personFindFirst).toHaveBeenCalledTimes(2);
  });

  it("returns an internal error when persistence fails without a recoverable winner", async () => {
    mocks.personCreateMany.mockRejectedValue(new Error("Database unavailable"));

    const result = withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_failure",
          email: "failure@example.com",
        },
        db
      )
    );

    await expect(result).rejects.toThrow("Database unavailable");
    expect(mocks.personUpdate).not.toHaveBeenCalled();
    expect(mocks.organisationUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: otherOrganisationId } })
    );
  });

  it("resolves an absorbed candidate person to the canonical active Xero person without creating a new profile", async () => {
    const xeroTargetPerson = {
      ...person,
      archived_at: null,
      clerk_user_id: null,
      id: "c2000000-0000-4000-8000-000000000099",
      source_system: "XERO",
    };
    mocks.xeroPersonMatchFindFirst.mockResolvedValue({
      resolved_clerk_user_id: "user_absorbed",
      resolved_person: null,
      status: "matched",
      xero_person: xeroTargetPerson,
    });
    mocks.personUpdate.mockResolvedValue({
      ...xeroTargetPerson,
      clerk_user_id: "user_absorbed",
    });

    const result = await withTestTenantResult(tenantTestAccount(tenant), (db) =>
      ensureCurrentUserPerson(
        tenant,
        {
          clerkUserId: "user_absorbed",
          email: "absorbed@example.com",
        },
        db
      )
    );

    expect(result).toMatchObject({
      ok: true,
      value: { id: xeroTargetPerson.id },
    });
    expect(mocks.personCreateMany).not.toHaveBeenCalled();
    expect(mocks.personUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clerk_user_id: "user_absorbed" }),
        where: { id: xeroTargetPerson.id },
      })
    );
  });
});
