import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  loadHolidayResolutionData: vi.fn(),
}));

import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { loadHolidayResolutionData } from "@repo/database";
import { describe, expect, it } from "vitest";
import { resolvePublicHolidays } from "./resolve-public-holidays";

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

    const result = await resolvePublicHolidays(range, () => []);

    expect(loadHolidayResolutionData).toHaveBeenCalledWith(range);
    expect(result).toMatchObject({
      ok: true,
      value: [{ key: "custom:c-1", locationId: null, name: "Founders Day" }],
    });
  });

  it("returns not_found when the organisation is outside the tenant", async () => {
    vi.mocked(loadHolidayResolutionData).mockResolvedValue(null);
    expect(await resolvePublicHolidays(range)).toMatchObject({
      error: { code: "not_found" },
      ok: false,
    });
  });

  it("returns an internal error when loading fails", async () => {
    vi.mocked(loadHolidayResolutionData).mockRejectedValue(new Error("down"));
    expect(await resolvePublicHolidays(range)).toMatchObject({
      error: { code: "internal" },
      ok: false,
    });
  });
});
