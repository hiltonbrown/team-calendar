import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarDayView } from "./calendar-day-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("CalendarDayView", () => {
  afterEach(() => cleanup());

  it("renders all-day events and public holidays", () => {
    render(
      <CalendarDayView
        actingPersonId="00000000-0000-4000-8000-000000000011"
        data={rangeWithEvents()}
        orgQueryValue={null}
        selectedPersonId={null}
      />
    );

    expect(screen.getByText("All day")).toBeDefined();
    expect(screen.getByText("Queensland Day")).toBeDefined();
    expect(screen.getByText("Ari Report")).toBeDefined();
  });

  it("renders the empty state for a blank day", () => {
    render(
      <CalendarDayView
        actingPersonId={null}
        data={{
          ...rangeWithEvents(),
          days: [{ ...rangeWithEvents().days[0], events: [] }],
        }}
        orgQueryValue={null}
        selectedPersonId={null}
      />
    );

    expect(
      screen.getByText("No leave or availability for this day")
    ).toBeDefined();
  });
});

function rangeWithEvents() {
  return {
    days: [
      {
        date: new Date("2026-04-15T00:00:00.000Z"),
        dayOfWeek: 3,
        events: [event()],
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
    people: [],
    range: {
      end: new Date("2026-04-16T00:00:00.000Z"),
      start: new Date("2026-04-15T00:00:00.000Z"),
      timezone: "Australia/Brisbane",
    },
    totalPeopleInScope: 0,
    truncated: false,
    view: "day",
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
    sourceType: "leavesync_leave",
    startsAt: new Date("2026-04-15T00:00:00.000Z"),
    xeroWriteError: null,
  } as const;
}
