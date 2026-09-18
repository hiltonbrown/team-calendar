import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarToolbar } from "./calendar-toolbar";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setFilterParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("org=org_1"),
}));
vi.mock("@/lib/url-state/use-filter-params", () => ({
  useFilterParams: () => [{}, mocks.setFilterParams],
}));

describe("CalendarToolbar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("provides one desktop and one safe-area mobile Add affordance", () => {
    render(
      <CalendarToolbar
        actingPersonId="00000000-0000-4000-8000-000000000011"
        data={calendarRange()}
        filters={{
          anchor: "2026-04-15",
          includeDrafts: false,
          recordTypeCategory: "all",
          scopeType: "my_self",
          surface: "calendar",
          view: "week",
        }}
        locations={[]}
        orgQueryValue="org_1"
        teams={[]}
      />
    );

    const addButtons = screen.getAllByRole("button", {
      name: "Add leave or availability",
    });
    expect(addButtons).toHaveLength(2);
    expect(addButtons[0]?.className).toContain("hidden md:inline-flex");
    expect(addButtons[1]?.className).toContain("safe-area-inset-bottom");
    expect(addButtons[1]?.className).toContain("md:hidden");

    if (!addButtons[1]) {
      throw new Error("Expected the mobile Add action.");
    }
    fireEvent.click(addButtons[1]);
    expect(mocks.push).toHaveBeenCalledWith(
      expect.stringContaining("/plans/new?")
    );
  });
});

function calendarRange() {
  return {
    days: [
      {
        date: new Date("2026-04-15T00:00:00.000Z"),
        dayOfWeek: 3,
        events: [],
        isToday: true,
        publicHolidays: [],
      },
    ],
    hasActiveXeroConnection: true,
    people: [],
    range: {
      end: new Date("2026-04-16T00:00:00.000Z"),
      start: new Date("2026-04-15T00:00:00.000Z"),
      timezone: "Australia/Brisbane",
    },
    totalPeopleInScope: 0,
    truncated: false,
    view: "week",
    xeroSyncFailedCount: 0,
  } as const;
}
