import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteCustomHolidayAction: vi.fn(),
  importFromSourceAction: vi.fn(),
  restoreHolidayAction: vi.fn(),
  setFilterParams: vi.fn(),
  suppressHolidayAction: vi.fn(),
}));

vi.mock("@/lib/url-state/use-filter-params", () => ({
  useFilterParams: () => [null, mocks.setFilterParams],
}));
vi.mock("./_actions", () => ({
  deleteCustomHolidayAction: mocks.deleteCustomHolidayAction,
  importFromSourceAction: mocks.importFromSourceAction,
  restoreHolidayAction: mocks.restoreHolidayAction,
  suppressHolidayAction: mocks.suppressHolidayAction,
}));

const { PublicHolidaysList } = await import("./public-holidays-list");

const organisationId = "00000000-0000-4000-8000-000000000001";
const SUPPRESS_PATTERN = /Suppress/;
const PUBLICATION_IMPACT_PATTERN =
  /removed from calendars and future feed publication/;

describe("PublicHolidaysList", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses the shared empty state when no holidays match", () => {
    render(
      <PublicHolidaysList
        canManage={true}
        filters={{ includeSuppressed: false, year: 2026 }}
        holidays={[]}
        locations={[]}
        organisationId={organisationId}
        refreshTargets={[
          {
            countryCode: "AU",
            label: "AU national holidays",
            regionCode: null,
          },
        ]}
      />
    );

    expect(screen.getByText("No public holidays")).toBeDefined();
    expect(
      screen.getByText(
        "Refresh your organisation's country holidays from the source, or add a custom date for a company-specific holiday."
      )
    ).toBeDefined();
  });

  it("labels icon-only row actions", () => {
    render(
      <PublicHolidaysList
        canManage={true}
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
        organisationId={organisationId}
        refreshTargets={[
          {
            countryCode: "AU",
            label: "AU national holidays",
            regionCode: null,
          },
        ]}
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

  it("removes the actions column and dead controls for viewers", () => {
    render(
      <PublicHolidaysList
        canManage={false}
        filters={{ includeSuppressed: false, year: 2026 }}
        holidays={[
          {
            archived_at: null,
            holiday_date: new Date("2026-01-26T00:00:00.000Z"),
            holiday_type: "public",
            id: "00000000-0000-4000-8000-000000000201",
            name: "Australia Day",
            organisation_id: organisationId,
            source: "nager",
          },
        ]}
        locations={[]}
        organisationId={organisationId}
        refreshTargets={[]}
      />
    );

    expect(screen.queryByRole("columnheader", { name: "Actions" })).toBeNull();
    expect(screen.queryByText("Read only")).toBeNull();
    expect(screen.queryByRole("button", { name: SUPPRESS_PATTERN })).toBeNull();
  });

  it("requires confirmation for suppress and supports explicit cancellation", async () => {
    render(
      <PublicHolidaysList
        canManage
        filters={{ includeSuppressed: false, year: 2026 }}
        holidays={[
          {
            archived_at: null,
            holiday_date: new Date("2026-01-26T00:00:00.000Z"),
            holiday_type: "public",
            id: "00000000-0000-4000-8000-000000000201",
            name: "Australia Day",
            organisation_id: organisationId,
            source: "nager",
          },
        ]}
        locations={[]}
        organisationId={organisationId}
        refreshTargets={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Suppress Australia Day" })
    );
    expect(
      screen.getByRole("alertdialog", { name: "Suppress Australia Day?" })
    ).toBeDefined();
    expect(screen.getByText(PUBLICATION_IMPACT_PATTERN)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(mocks.suppressHolidayAction).not.toHaveBeenCalled();
  });

  it("confirms permanent deletion once and names the holiday", async () => {
    mocks.deleteCustomHolidayAction.mockResolvedValue({
      ok: true,
      value: { id: "holiday" },
    });
    render(
      <PublicHolidaysList
        canManage
        filters={{ includeSuppressed: false, year: 2026 }}
        holidays={[
          {
            archived_at: null,
            holiday_date: new Date("2026-04-01T00:00:00.000Z"),
            holiday_type: "custom",
            id: "00000000-0000-4000-8000-000000000202",
            name: "Company day",
            organisation_id: organisationId,
            source: "manual",
          },
        ]}
        locations={[]}
        organisationId={organisationId}
        refreshTargets={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Company day" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => {
      expect(mocks.deleteCustomHolidayAction).toHaveBeenCalledTimes(1);
    });
  });

  it("labels suppressed rows and refreshes every supported source target", async () => {
    mocks.importFromSourceAction
      .mockResolvedValueOnce({
        ok: true,
        value: { importedCount: 2, skippedCount: 4 },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { importedCount: 1, skippedCount: 3 },
      });
    render(
      <PublicHolidaysList
        canManage
        filters={{ includeSuppressed: true, year: 2026 }}
        holidays={[
          {
            archived_at: new Date("2026-01-01T00:00:00.000Z"),
            holiday_date: new Date("2026-04-01T00:00:00.000Z"),
            holiday_type: "custom",
            id: "00000000-0000-4000-8000-000000000202",
            name: "Company day",
            organisation_id: organisationId,
            source: "manual",
          },
        ]}
        locations={[]}
        organisationId={organisationId}
        refreshTargets={[
          {
            countryCode: "AU",
            label: "AU national holidays",
            regionCode: null,
          },
          { countryCode: "AU", label: "Brisbane (AU-QLD)", regionCode: "QLD" },
        ]}
      />
    );

    expect(screen.getByText("Suppressed")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh from source" })
    );
    await waitFor(() => {
      expect(mocks.importFromSourceAction).toHaveBeenCalledTimes(2);
    });
    expect(mocks.importFromSourceAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ regionCode: "QLD", year: 2026 })
    );
  });
});
