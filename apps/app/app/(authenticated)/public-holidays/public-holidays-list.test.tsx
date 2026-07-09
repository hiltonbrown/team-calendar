import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setFilterParams: vi.fn(),
}));

vi.mock("@/lib/url-state/use-filter-params", () => ({
  useFilterParams: () => [null, mocks.setFilterParams],
}));
vi.mock("./_actions", () => ({
  deleteCustomHolidayAction: vi.fn(),
  restoreHolidayAction: vi.fn(),
  suppressHolidayAction: vi.fn(),
}));

const { PublicHolidaysList } = await import("./public-holidays-list");

const organisationId = "00000000-0000-4000-8000-000000000001";

describe("PublicHolidaysList", () => {
  afterEach(() => cleanup());

  it("uses the shared empty state when no holidays match", () => {
    render(
      <PublicHolidaysList
        filters={{ includeSuppressed: false, year: 2026 }}
        holidays={[]}
        locations={[]}
      />
    );

    expect(screen.getByText("No public holidays")).toBeDefined();
    expect(
      screen.getByText(
        "Team Calendar imports your organisation's country holidays automatically. Add a custom holiday for company-specific dates."
      )
    ).toBeDefined();
  });

  it("labels icon-only row actions", () => {
    render(
      <PublicHolidaysList
        filters={{ includeSuppressed: true, year: 2026 }}
        holidays={[
          {
            archived_at: null,
            holiday_date: new Date("2026-01-26T00:00:00.000Z"),
            holiday_type: "public",
            id: "00000000-0000-4000-8000-000000000201",
            jurisdiction: { country_code: "AU", region_code: "QLD" },
            name: "Australia Day",
            organisation_id: organisationId,
            source: "nager",
          },
          {
            archived_at: new Date("2026-01-01T00:00:00.000Z"),
            holiday_date: new Date("2026-04-01T00:00:00.000Z"),
            holiday_type: "custom",
            id: "00000000-0000-4000-8000-000000000202",
            jurisdiction: null,
            name: "Company day",
            organisation_id: organisationId,
            source: "manual",
          },
        ]}
        locations={[]}
      />
    );

    expect(
      screen.getByRole("button", { name: "Suppress Australia Day" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Restore Company day" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Delete Company day" })
    ).toBeDefined();
  });
});
