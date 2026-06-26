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

  it("renders public holiday badges, today and overflow", () => {
    render(
      <CalendarMonthView
        actingPersonId="00000000-0000-4000-8000-000000000011"
        data={calendarRange({ eventCount: 5 })}
        orgQueryValue={null}
        selectedPersonId={null}
      />
    );

    expect(screen.getByText("Holiday")).toBeDefined();
    expect(screen.getByText("+2 more")).toBeDefined();
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
