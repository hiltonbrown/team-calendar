import { vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual("../../../database/src/tenant-db")),
  loadHolidayResolutionData: vi.fn(),
}));

import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { loadHolidayResolutionData } from "@repo/database";
import { describe, expect, it } from "vitest";
import {
  loadHolidaySettings,
  resolvePublicHolidays,
} from "./resolve-public-holidays";

const clerkOrgId = "org_a" as ClerkOrgId;
const organisationId = "11111111-1111-4111-8111-111111111111" as OrganisationId;
const range = {
  clerkOrgId,
  from: "2026-01-01",
  organisationId,
  to: "2026-12-31",
};

describe("resolvePublicHolidays", () => {
  it("resolves the loaded tenant data", async () => {
    vi.mocked(loadHolidayResolutionData).mockResolvedValue({
      customHolidays: [
        {
          countryCode: "CUSTOM",
          date: "2026-03-02",
          defaultClassification: "non_working",
          id: "c-1",
          name: "Founders Day",
          regionCode: null,
        },
      ],
      from: "2026-01-01",
      locations: [],
      organisation: { countryCode: "AU", regionCode: "QLD" },
      preferences: [],
      to: "2026-12-31",
    });

    const result = await withTestTenantResult(tenantTestAccount(range), (db) =>
      resolvePublicHolidays(range, () => [], db)
    );

    expect(loadHolidayResolutionData).toHaveBeenCalledWith(
      range,
      expect.any(Object)
    );
    expect(result).toMatchObject({
      ok: true,
      value: [{ key: "custom:c-1", locationId: null, name: "Founders Day" }],
    });
  });

  it("returns not_found when the organisation is outside the tenant", async () => {
    vi.mocked(loadHolidayResolutionData).mockResolvedValue(null);
    expect(
      await withTestTenantResult(tenantTestAccount(range), (db) =>
        resolvePublicHolidays(range, undefined, db)
      )
    ).toMatchObject({
      error: { code: "not_found" },
      ok: false,
    });
  });

  it("returns an internal error when loading fails", async () => {
    vi.mocked(loadHolidayResolutionData).mockRejectedValue(new Error("down"));
    await expect(
      withTestTenantResult(tenantTestAccount(range), (db) =>
        resolvePublicHolidays(range, undefined, db)
      )
    ).rejects.toThrow("down");
  });
});

describe("loadHolidaySettings", () => {
  it("resolves holidays and local days from one load", async () => {
    vi.mocked(loadHolidayResolutionData).mockResolvedValue({
      customHolidays: [],
      from: "2026-01-01",
      locations: [{ countryCode: "AU", id: "loc-1", regionCode: "QLD" }],
      organisation: { countryCode: "AU", regionCode: "QLD" },
      preferences: [],
      to: "2026-12-31",
    });

    const result = await withTestTenantResult(tenantTestAccount(range), (db) =>
      loadHolidaySettings(
        range,
        () => [
          {
            area: "Brisbane",
            country: "AU",
            date: "2026-08-12",
            id: "au-qld-2026-08-12-royal-queensland-show",
            kind: "local",
            name: "Royal Queensland Show",
            region: "QLD",
            startsAt: null,
          },
        ],
        db
      )
    );

    expect(loadHolidayResolutionData).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      value: {
        holidays: [],
        localOptions: [
          {
            holidays: [{ enabled: false, name: "Royal Queensland Show" }],
            locationId: "loc-1",
          },
        ],
      },
    });
  });

  it("returns not_found when the organisation is outside the tenant", async () => {
    vi.mocked(loadHolidayResolutionData).mockResolvedValue(null);
    expect(
      await withTestTenantResult(tenantTestAccount(range), (db) =>
        loadHolidaySettings(range, undefined, db)
      )
    ).toMatchObject({
      error: { code: "not_found" },
      ok: false,
    });
  });
});

vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (run: (db: unknown) => Promise<unknown>) =>
      run({ $queryRaw: vi.fn(async () => []) }),
  },
}));
