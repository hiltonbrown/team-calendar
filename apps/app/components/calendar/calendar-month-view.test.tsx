import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarMonthView } from "./calendar-month-view";

const TRUNCATION_COPY = /Showing 1 of 250 people/;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("CalendarMonthView", () => {
  afterEach(() => cleanup());

  it("renders public holiday badges, today, overflow link, and accessible scroll region", () => {
    const { container } = render(
      <CalendarMonthView
        actingPersonId="00000000-0000-4000-8000-000000000011"
        data={calendarRange({ eventCount: 5 })}
        orgQueryValue={null}
        selectedPersonId={null}
      />
    );

    expect(screen.getByText("Holiday")).toBeDefined();
    expect(screen.getByText("+2 more")).toBeDefined();

    const scrollRegion = screen.getByLabelText("Month calendar");
    expect(scrollRegion).toBeDefined();
    expect(scrollRegion.className).toContain("overflow-x-auto");

    const grid = container.querySelector(".min-w-\\[56rem\\]");
    expect(grid).not.toBeNull();
  });

  it("ensures calendar create control has no focusable interactive descendants", () => {
    render(
      <CalendarMonthView
        actingPersonId="00000000-0000-4000-8000-000000000011"
        data={calendarRange({ eventCount: 2 })}
        orgQueryValue={null}
        selectedPersonId={null}
      />
    );

    const createButtons = screen.getAllByRole("button", {
      name: "Add availability for 15 April 2026",
    });
    for (const createButton of createButtons) {
      const interactiveDescendants = createButton.querySelectorAll(
        'button, a[href], [tabindex]:not([tabindex="-1"])'
      );
      expect(interactiveDescendants).toHaveLength(0);
    }
  });

  it("renders the truncation banner", () => {
    render(
      <CalendarMonthView
        actingPersonId={null}
        data={{
          ...calendarRange({ eventCount: 0 }),
          totalPeopleInScope: 250,
          truncated: true,
        }}
        orgQueryValue={null}
        selectedPersonId={null}
      />
    );

    expect(screen.getByText(TRUNCATION_COPY)).toBeDefined();
  });

  it("renders a chronological mobile agenda with a day-detail path", () => {
    render(
      <CalendarMonthView
        actingPersonId={null}
        data={calendarRange({ eventCount: 1 })}
        orgQueryValue="org_1"
        selectedPersonId={null}
      />
    );

    const agenda = screen.getByRole("region", { name: "Month agenda" });
    expect(agenda.className).not.toContain("overflow-x-auto");
    expect(
      screen.getByRole("heading", { name: "Wednesday 15 April 2026" })
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "View day" }).getAttribute("href")
    ).toBe("/calendar?view=day&anchor=2026-04-15&org=org_1");
  });
});

function calendarRange({ eventCount }: { eventCount: number }) {
  const events = Array.from({ length: eventCount }, (_, index) => ({
    ...event(),
    id: `event-${index}`,
  }));
  return {
    days: [
      {
        date: new Date("2026-04-15T00:00:00.000Z"),
        dayOfWeek: 3,
        events,
        isToday: true,
        publicHolidays: [
          {
            appliesToAllLocationsInView: true,
            isSuppressed: false,
            locationNames: ["Brisbane"],
            name: "Queensland Day",
          },
        ],
      },
    ],
    hasActiveXeroConnection: false,
    people: [
      {
        avatarUrl: null,
        displayName: "Ari Report",
        firstName: "Ari",
        id: "00000000-0000-4000-8000-000000000011",
        lastName: "Report",
        locationName: "Brisbane",
        locationTimezone: "Australia/Brisbane",
        personType: "employee",
        teamName: "Operations",
        xeroSyncFailedCountInRange: 0,
      },
    ],
    range: {
      end: new Date("2026-04-16T00:00:00.000Z"),
      start: new Date("2026-04-15T00:00:00.000Z"),
      timezone: "Australia/Brisbane",
    },
    totalPeopleInScope: 1,
    truncated: false,
    view: "month",
    xeroSyncFailedCount: 0,
  } as const;
}

function event() {
  return {
    allDay: true,
    approvalStatus: "approved",
    avatarUrl: null,
    contactabilityStatus: "contactable",
    displayName: "Ari Report",
    endsAt: new Date("2026-04-16T00:00:00.000Z"),
    id: "event",
    isEditableByActor: true,
    notesInternal: null,
    personId: "00000000-0000-4000-8000-000000000011",
    privacyMode: "named",
    recordType: "annual_leave",
    recordTypeCategory: "xero_leave",
    renderTreatment: "solid",
    sourceType: "team_calendar_leave",
    startsAt: new Date("2026-04-15T00:00:00.000Z"),
    xeroWriteError: null,
  } as const;
}
