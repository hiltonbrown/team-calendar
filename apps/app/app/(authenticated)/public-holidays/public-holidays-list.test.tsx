import type { ResolvedPublicHoliday } from "@repo/availability";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteCustomHolidayAction: vi.fn(),
  hideHolidayAction: vi.fn(),
  restoreHolidayAction: vi.fn(),
  setFilterParams: vi.fn(),
  setHolidayClassificationAction: vi.fn(),
}));

vi.mock("@/lib/url-state/use-filter-params", () => ({
  useFilterParams: () => [null, mocks.setFilterParams],
}));
vi.mock("./_actions", () => ({
  deleteCustomHolidayAction: mocks.deleteCustomHolidayAction,
  hideHolidayAction: mocks.hideHolidayAction,
  restoreHolidayAction: mocks.restoreHolidayAction,
  setHolidayClassificationAction: mocks.setHolidayClassificationAction,
}));

const { PublicHolidaysList } = await import("./public-holidays-list");

const organisationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000010";
const customId = "00000000-0000-4000-8000-000000000202";

function holiday(
  overrides: Partial<ResolvedPublicHoliday> = {}
): ResolvedPublicHoliday {
  return {
    area: null,
    classification: "non_working",
    date: "2026-01-26",
    hidden: false,
    key: "au-national-2026-01-26-australia-day",
    kind: "public",
    locationId,
    name: "Australia Day",
    origin: "official",
    startsAt: null,
    ...overrides,
  };
}

const companyDay = holiday({
  date: "2026-04-01",
  key: `custom:${customId}`,
  kind: "custom",
  name: "Company day",
  origin: "custom",
});

function renderList(
  props: Partial<Parameters<typeof PublicHolidaysList>[0]> = {}
) {
  return render(
    <PublicHolidaysList
      canManage={true}
      filters={{ includeHidden: false, year: 2026 }}
      groups={[
        {
          holidays: [holiday(), companyDay],
          locationId,
          name: "Brisbane",
        },
      ]}
      hasOfficialHolidays={true}
      locations={[{ id: locationId, name: "Brisbane" }]}
      organisationId={organisationId}
      {...props}
    />
  );
}

describe("PublicHolidaysList", () => {
  beforeEach(() => {
    for (const action of [
      mocks.deleteCustomHolidayAction,
      mocks.hideHolidayAction,
      mocks.restoreHolidayAction,
      mocks.setHolidayClassificationAction,
    ]) {
      action.mockResolvedValue({ ok: true, value: { message: "Done." } });
    }
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("explains when official holidays for the year are not available yet", () => {
    renderList({
      groups: [{ holidays: [], locationId: null, name: "Everyone" }],
      hasOfficialHolidays: false,
    });

    expect(screen.getByText("No public holidays for 2026")).toBeDefined();
    expect(
      screen.getByText(
        "Official holidays for 2026 are not available yet. They are added each year in September. You can add a custom holiday in the meantime."
      )
    ).toBeDefined();
  });

  it("shows each holiday's source and whether it is a day off", () => {
    renderList();

    const section = screen.getByRole("region", {
      name: "Public holidays for Brisbane",
    });
    expect(section.textContent).toContain("Official");
    expect(section.textContent).toContain("Custom");
    expect(section.textContent).toContain("Day off");
  });

  it("labels icon-only row actions", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Hide Australia Day" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", {
        name: "Mark Australia Day as a working day",
      })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Delete Company day" })
    ).toBeDefined();
  });

  it("removes row actions and administration for viewers", () => {
    renderList({ canManage: false });

    expect(screen.queryByRole("button", { name: "Hide Australia Day" })).toBe(
      null
    );
    expect(screen.queryByText("Holiday administration")).toBe(null);
  });

  it("marks a holiday as a working day for the location", async () => {
    renderList();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mark Australia Day as a working day",
      })
    );

    await waitFor(() => {
      expect(mocks.setHolidayClassificationAction).toHaveBeenCalledWith({
        classification: "working",
        holidayKey: "au-national-2026-01-26-australia-day",
        locationId,
        organisationId,
      });
    });
  });

  it("offers a reset once a location overrides the default", async () => {
    renderList({
      groups: [
        {
          holidays: [holiday({ classification: "working" })],
          locationId,
          name: "Brisbane",
        },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Reset Australia Day to its default" })
    );

    await waitFor(() => {
      expect(mocks.restoreHolidayAction).toHaveBeenCalledWith({
        holidayKey: "au-national-2026-01-26-australia-day",
        locationId,
        organisationId,
      });
    });
  });

  it("requires confirmation to hide and supports cancellation", async () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Hide Australia Day" }));
    expect(screen.getByText("Hide Australia Day?")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("Hide Australia Day?")).toBe(null);
    });
    expect(mocks.hideHolidayAction).not.toHaveBeenCalled();
  });

  it("deletes a custom holiday after confirmation", async () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Delete Company day" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete holiday" }));

    await waitFor(() => {
      expect(mocks.deleteCustomHolidayAction).toHaveBeenCalledWith({
        holidayId: customId,
        name: "Company day",
        organisationId,
      });
    });
  });

  it("restores a hidden holiday organisation-wide", async () => {
    renderList({
      filters: { includeHidden: true, year: 2026 },
      groups: [
        {
          holidays: [holiday({ hidden: true })],
          locationId,
          name: "Brisbane",
        },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Restore Australia Day" })
    );

    await waitFor(() => {
      expect(mocks.restoreHolidayAction).toHaveBeenCalledWith({
        holidayKey: "au-national-2026-01-26-australia-day",
        locationId: null,
        organisationId,
      });
    });
  });
});
