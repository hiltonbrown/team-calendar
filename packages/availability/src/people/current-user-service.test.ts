import { Prisma } from "@repo/database/generated/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaultCalendarFeed: vi.fn(),
  ensureDefaultPublicHolidaysForOrganisation: vi.fn(),
  organisationCreate: vi.fn(),
  organisationFindFirst: vi.fn(),
  organisationUpdate: vi.fn(),
  personCreate: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  personUpdate: vi.fn(),
  withinLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({ withinLimit: mocks.withinLimit }));
vi.mock("@repo/database", () => ({
  database: {
    organisation: {
      create: mocks.organisationCreate,
      findFirst: mocks.organisationFindFirst,
      update: mocks.organisationUpdate,
    },
    person: {
      create: mocks.personCreate,
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
      update: mocks.personUpdate,
    },
  },
  scopedQuery: (inputClerkOrgId: string, inputOrganisationId: string) => ({
    clerk_org_id: inputClerkOrgId,
    organisation_id: inputOrganisationId,
  }),
}));
vi.mock("@repo/feeds", () => ({
  ensureDefaultCalendarFeed: mocks.ensureDefaultCalendarFeed,
}));
vi.mock("../holidays/holiday-service", () => ({
  ensureDefaultPublicHolidaysForOrganisation:
    mocks.ensureDefaultPublicHolidaysForOrganisation,
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
  clerk_user_id: null,
  display_name: "Case Person",
  email: "case.person@example.com",
  first_name: "Case",
  id: personId,
  job_title: "Engineer",
  last_name: "Person",
  location: { name: "Brisbane" },
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
    mocks.ensureDefaultPublicHolidaysForOrganisation.mockResolvedValue({
      ok: true,
      value: {
        importedCount: 0,
        importedYears: [],
        skippedCount: 0,
        skippedYears: [],
      },
    });
  });

  it("creates an organisation once and provisions its defaults", async () => {
    mocks.organisationFindFirst.mockResolvedValue(null);

    const result = await ensureOrganisationForClerk({
      clerkOrgId,
      countryCode: "AU",
      name: "Current user test",
    });

    expect(result).toEqual({ clerkOrgId, organisationId });
    expect(mocks.withinLimit).toHaveBeenCalledWith(
      clerkOrgId,
      "00000000-0000-4000-8000-000000000000",
      "payroll_entities"
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
    expect(mocks.ensureDefaultCalendarFeed).toHaveBeenCalledWith({
      clerkOrgId,
      organisationId,
    });
    expect(
      mocks.ensureDefaultPublicHolidaysForOrganisation
    ).toHaveBeenCalledWith({ clerkOrgId, organisationId });
  });

  it("updates the oldest active organisation idempotently", async () => {
    mocks.organisationFindFirst.mockResolvedValue(organisation);

    const result = await ensureOrganisationForClerk({
      clerkOrgId,
      countryCode: "NZ",
      fiscalYearStart: 4,
      locale: "en-NZ",
      name: "Updated organisation",
      reportingUnit: "days",
      timezone: "Pacific/Auckland",
      workingHoursPerDay: 8,
    });

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
      ensureOrganisationForClerk({
        clerkOrgId,
        countryCode: "AU",
        name: "Blocked organisation",
      })
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
      ensureOrganisationForClerk({
        clerkOrgId,
        countryCode: "AU",
        name: "Blocked organisation",
      })
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
      ensureOrganisationForClerk({
        clerkOrgId,
        countryCode: "AU",
        name: "Current user test",
      })
    ).rejects.toThrow("Feed unavailable");

    await expect(
      ensureOrganisationForClerk({
        clerkOrgId,
        countryCode: "AU",
        name: "Current user test",
      })
    ).resolves.toEqual({ clerkOrgId, organisationId });
    expect(mocks.organisationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.organisationUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.ensureDefaultCalendarFeed).toHaveBeenCalledTimes(2);
    expect(
      mocks.ensureDefaultPublicHolidaysForOrganisation
    ).toHaveBeenCalledTimes(1);
  });

  it("does not fail organisation provisioning when holiday import reports an error", async () => {
    mocks.organisationFindFirst.mockResolvedValue(organisation);
    mocks.ensureDefaultPublicHolidaysForOrganisation.mockResolvedValue({
      error: { code: "internal", message: "Holiday provider unavailable" },
      ok: false,
    });

    await expect(
      ensureOrganisationForClerk({
        clerkOrgId,
        countryCode: "AU",
        name: "Current user test",
      })
    ).resolves.toEqual({ clerkOrgId, organisationId });
  });
});

describe("current-user-service person provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personFindFirst.mockResolvedValue(null);
    mocks.personFindMany.mockResolvedValue([]);
    mocks.personCreate.mockResolvedValue({
      ...person,
      clerk_user_id: "user_new",
      id: "c2000000-0000-4000-8000-000000000009",
    });
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

    const result = await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_existing",
      email: "different@example.com",
    });

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
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        clerk_user_id: "user_existing",
        organisation_id: organisationId,
      },
    });
    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(mocks.withinLimit).not.toHaveBeenCalled();
  });

  it("links one unclaimed person by case-insensitive email within the tenant", async () => {
    mocks.personFindMany.mockResolvedValue([person]);

    const result = await ensureCurrentUserPerson(tenant, {
      avatarUrl: " https://img.example.com/avatar.png ",
      clerkUserId: "user_case",
      displayName: " Case Updated ",
      email: " CASE.PERSON@EXAMPLE.COM ",
    });

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
        organisation_id: organisationId,
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

    const result = await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_duplicate",
      email: "case.person@example.com",
    });

    expect(result).toEqual({
      error: {
        code: "conflict",
        message:
          "Multiple people match this Clerk user's email. Review the people directory before opening plans.",
      },
      ok: false,
    });
    expect(mocks.personUpdate).not.toHaveBeenCalled();
    expect(mocks.personCreate).not.toHaveBeenCalled();
    expect(mocks.withinLimit).not.toHaveBeenCalled();
  });

  it("creates a tenant-scoped fallback person at the final available seat", async () => {
    const result = await ensureCurrentUserPerson(tenant, {
      avatarUrl: "https://img.example.com/new.png",
      clerkUserId: "user_new",
      displayName: "New Person",
      email: "NEW.PERSON@EXAMPLE.COM",
      jobTitle: "Designer",
    });

    expect(result.ok).toBe(true);
    expect(mocks.withinLimit).toHaveBeenCalledWith(
      clerkOrgId,
      organisationId,
      "seats"
    );
    expect(mocks.personCreate).toHaveBeenCalledWith({
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
      include: { location: true, team: true },
    });
  });

  it("uses an internal email when Clerk does not provide one", async () => {
    await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_new",
      firstName: "New",
      lastName: "Person",
    });

    expect(mocks.personFindMany).not.toHaveBeenCalled();
    expect(mocks.personCreate).toHaveBeenCalledWith(
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

    const result = await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_blocked",
      email: "blocked@example.com",
    });

    expect(result).toEqual({
      error: {
        code: "bad_request",
        message: "Your current plan has reached its active people limit.",
      },
      ok: false,
    });
    expect(mocks.personCreate).not.toHaveBeenCalled();
  });

  it("propagates authoritative seat-check errors without creating a person", async () => {
    mocks.withinLimit.mockResolvedValue({
      error: { code: "internal", message: "Failed to check billing limits." },
      ok: false,
    });

    const result = await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_error",
      email: "error@example.com",
    });

    expect(result).toEqual({
      error: { code: "internal", message: "Failed to check billing limits." },
      ok: false,
    });
    expect(mocks.personCreate).not.toHaveBeenCalled();
  });

  it("recovers the winner when concurrent fallback creation hits the unique constraint", async () => {
    const concurrentlyCreated = {
      ...person,
      clerk_user_id: "user_race",
      id: "c2000000-0000-4000-8000-000000000008",
    };
    mocks.personFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentlyCreated);
    mocks.personCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        clientVersion: "test",
        code: "P2002",
      })
    );

    const result = await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_race",
      email: "race@example.com",
    });

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

  it("returns an internal error when a unique conflict has no scoped winner", async () => {
    mocks.personCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        clientVersion: "test",
        code: "P2002",
      })
    );

    const result = await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_missing_winner",
      email: "missing-winner@example.com",
    });

    expect(result).toEqual({
      error: {
        code: "internal",
        message: "Failed to ensure the current user has a person profile.",
      },
      ok: false,
    });
    expect(mocks.personFindFirst).toHaveBeenCalledTimes(2);
  });

  it("returns an internal error when persistence fails without a recoverable winner", async () => {
    mocks.personCreate.mockRejectedValue(new Error("Database unavailable"));

    const result = await ensureCurrentUserPerson(tenant, {
      clerkUserId: "user_failure",
      email: "failure@example.com",
    });

    expect(result).toEqual({
      error: {
        code: "internal",
        message: "Failed to ensure the current user has a person profile.",
      },
      ok: false,
    });
    expect(mocks.personUpdate).not.toHaveBeenCalled();
    expect(mocks.organisationUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: otherOrganisationId } })
    );
  });
});
