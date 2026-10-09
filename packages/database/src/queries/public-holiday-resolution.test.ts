import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/client";
import { loadHolidayResolutionData } from "./public-holiday-resolution";

vi.mock("server-only", () => ({}));

const clerkOrgId = "org_a" as ClerkOrgId;
const organisationId = "11111111-1111-4111-8111-111111111111" as OrganisationId;

function fakeClient(organisation: unknown) {
  const client = {
    location: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { country_code: "AU", id: "loc-1", region_code: "QLD" },
        ]),
    },
    organisation: { findFirst: vi.fn().mockResolvedValue(organisation) },
    publicHoliday: {
      findMany: vi.fn().mockResolvedValue([
        {
          country_code: "CUSTOM",
          default_classification: "non_working",
          holiday_date: new Date("2026-03-02T00:00:00.000Z"),
          id: "h-1",
          name: "Founders Day",
          region_code: null,
          updated_at: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]),
    },
    publicHolidayPreference: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { holiday_key: "custom:h-1", location_id: null, setting: "hidden" },
        ]),
    },
  };
  // Only the delegates the loader uses are provided.
  return { client, typed: client as unknown as Prisma.TransactionClient };
}

describe("loadHolidayResolutionData", () => {
  it("scopes every query by both tenancy keys and maps rows", async () => {
    const { client, typed } = fakeClient({
      country_code: "AU",
      region_code: "QLD",
    });

    const data = await loadHolidayResolutionData(
      { clerkOrgId, from: "2026-01-01", organisationId, to: "2026-12-31" },
      typed
    );

    expect(client.organisation.findFirst.mock.calls[0]?.[0]?.where).toEqual({
      archived_at: null,
      clerk_org_id: clerkOrgId,
      id: organisationId,
    });
    for (const findMany of [
      client.location.findMany,
      client.publicHoliday.findMany,
      client.publicHolidayPreference.findMany,
    ]) {
      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
      });
    }
    expect(
      client.publicHoliday.findMany.mock.calls[0]?.[0]?.where
    ).toMatchObject({ source: "manual" });
    expect(data).toEqual({
      customHolidays: [
        {
          countryCode: "CUSTOM",
          date: "2026-03-02",
          defaultClassification: "non_working",
          id: "h-1",
          name: "Founders Day",
          regionCode: null,
          updatedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
      from: "2026-01-01",
      locations: [{ countryCode: "AU", id: "loc-1", regionCode: "QLD" }],
      organisation: { countryCode: "AU", regionCode: "QLD" },
      preferences: [
        { holidayKey: "custom:h-1", locationId: null, setting: "hidden" },
      ],
      to: "2026-12-31",
    });
  });

  it("returns null without further queries when the organisation is outside the tenant", async () => {
    const { client, typed } = fakeClient(null);
    const data = await loadHolidayResolutionData(
      { clerkOrgId, from: "2026-01-01", organisationId, to: "2026-12-31" },
      typed
    );
    expect(data).toBeNull();
    expect(client.location.findMany).not.toHaveBeenCalled();
  });
});
