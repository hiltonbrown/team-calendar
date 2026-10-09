import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLocation: vi.fn(),
  findOrganisation: vi.fn(),
  resolvePublicHolidays: vi.fn(),
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    location: { findFirst: mocks.findLocation },
    organisation: { findFirst: mocks.findOrganisation },
  },
  scopedQuery: mocks.scopedQuery,
}));
vi.mock("../holidays/resolve-public-holidays", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../holidays/resolve-public-holidays")
  >()),
  resolvePublicHolidays: mocks.resolvePublicHolidays,
}));

const { computeWorkingDays } = await import("./working-days");

const location = {
  country_code: "AU",
  region_code: "QLD",
  timezone: "UTC",
};

const timezones = [
  "UTC",
  "Australia/Sydney",
  "Australia/Brisbane",
  "Pacific/Auckland",
  "Europe/London",
] as const;

const holiday = (
  date: string,
  overrides: Partial<{
    classification: "non_working" | "working";
    hidden: boolean;
    locationId: string | null;
  }> = {}
) => ({
  area: null,
  classification: "non_working" as const,
  date,
  hidden: false,
  key: `au-qld-${date}-holiday`,
  kind: "public" as const,
  locationId: "loc_1",
  name: "Holiday",
  origin: "official" as const,
  startsAt: null,
  ...overrides,
});

describe("computeWorkingDays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLocation.mockResolvedValue(location);
    mocks.findOrganisation.mockResolvedValue(location);
    mocks.resolvePublicHolidays.mockResolvedValue({ ok: true, value: [] });
  });

  it.each(timezones)(
    "counts an all-day Monday to Wednesday range as three days in %s",
    async (timezone) => {
      mocks.findLocation.mockResolvedValue({ ...location, timezone });

      const result = await computeWorkingDays({
        allDay: true,
        clerkOrgId: "org_1",
        endsAt: new Date("2026-01-07T23:59:59.999Z"),
        locationId: "loc_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        startsAt: new Date("2026-01-05T00:00:00.000Z"),
      });

      expect(result).toEqual({ ok: true, value: 3 });
    }
  );

  it.each(timezones)(
    "counts an all-day Monday to Friday range as five days in %s",
    async (timezone) => {
      mocks.findLocation.mockResolvedValue({ ...location, timezone });

      const result = await computeWorkingDays({
        allDay: true,
        clerkOrgId: "org_1",
        endsAt: new Date("2026-01-09T23:59:59.999Z"),
        locationId: "loc_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        startsAt: new Date("2026-01-05T00:00:00.000Z"),
      });

      expect(result).toEqual({ ok: true, value: 5 });
    }
  );

  it.each(timezones)(
    "counts a timed 09:00 to 17:00 range as one day in %s",
    async (timezone) => {
      mocks.findLocation.mockResolvedValue({ ...location, timezone });

      const result = await computeWorkingDays({
        allDay: false,
        clerkOrgId: "org_1",
        endsAt: new Date("2026-01-05T17:00:00.000Z"),
        locationId: "loc_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        startsAt: new Date("2026-01-05T09:00:00.000Z"),
      });

      expect(result).toEqual({ ok: true, value: 1 });
    }
  );

  it.each(timezones)(
    "counts a timed 09:00 to 13:00 range as half a day in %s",
    async (timezone) => {
      mocks.findLocation.mockResolvedValue({ ...location, timezone });

      const result = await computeWorkingDays({
        allDay: false,
        clerkOrgId: "org_1",
        endsAt: new Date("2026-01-05T13:00:00.000Z"),
        locationId: "loc_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        startsAt: new Date("2026-01-05T09:00:00.000Z"),
      });

      expect(result).toEqual({ ok: true, value: 0.5 });
    }
  );

  it.each(timezones)(
    "excludes the stored public holiday date in %s",
    async (timezone) => {
      mocks.findLocation.mockResolvedValue({ ...location, timezone });
      mocks.resolvePublicHolidays.mockResolvedValue({
        ok: true,
        value: [holiday("2026-01-06")],
      });

      const result = await computeWorkingDays({
        allDay: true,
        clerkOrgId: "org_1",
        endsAt: new Date("2026-01-07T23:59:59.999Z"),
        locationId: "loc_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
        startsAt: new Date("2026-01-05T00:00:00.000Z"),
      });

      expect(result).toEqual({ ok: true, value: 2 });
    }
  );

  it("counts Monday to Friday all-day as five working days", async () => {
    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("excludes weekends", async () => {
    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-11T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-08T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true, value: 2 });
  });

  it("excludes active public holidays", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      ok: true,
      value: [holiday("2026-05-05")],
    });

    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true, value: 4 });
  });

  it("does not exclude holidays resolved as working days", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      ok: true,
      value: [holiday("2026-05-05", { classification: "working" })],
    });

    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("ignores holidays resolved for another location", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      ok: true,
      value: [holiday("2026-05-05", { locationId: "loc_2" })],
    });

    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("uses organisation-level holidays for people without a location", async () => {
    mocks.resolvePublicHolidays.mockResolvedValue({
      ok: true,
      value: [
        holiday("2026-05-05", { locationId: null }),
        holiday("2026-05-06", { locationId: "loc_1" }),
      ],
    });

    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-08T00:00:00.000Z"),
      locationId: null,
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true, value: 4 });
  });

  it("resolves holidays per calendar year within the organisation", async () => {
    await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2027-01-05T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-12-30T00:00:00.000Z"),
    });

    expect(
      mocks.resolvePublicHolidays.mock.calls.map(([input]) => input)
    ).toEqual([
      {
        clerkOrgId: "org_1",
        from: "2026-01-01",
        organisationId: "00000000-0000-4000-8000-000000000001",
        to: "2026-12-31",
      },
      {
        clerkOrgId: "org_1",
        from: "2027-01-01",
        organisationId: "00000000-0000-4000-8000-000000000001",
        to: "2027-12-31",
      },
    ]);
  });

  it("rounds part-day ranges half-up to the nearest quarter", async () => {
    const result = await computeWorkingDays({
      allDay: false,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-04T13:07:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-04T09:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true, value: 0.5 });
  });

  it("returns invalid_range when end precedes start", async () => {
    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-04T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-05T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_range");
    }
  });

  it("returns location_not_found when the location is missing", async () => {
    mocks.findLocation.mockResolvedValue(null);

    const result = await computeWorkingDays({
      allDay: true,
      clerkOrgId: "org_1",
      endsAt: new Date("2026-05-05T00:00:00.000Z"),
      locationId: "loc_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-05-04T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("location_not_found");
    }
  });
});
