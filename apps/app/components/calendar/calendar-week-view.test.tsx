import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarWeekView } from "./calendar-week-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("CalendarWeekView", () => {
  afterEach(() => cleanup());

  it("renders events in the week grid with public holidays", () => {
    render(
      <CalendarWeekView
        actingPersonId="00000000-0000-4000-8000-000000000011"
        data={weekRange()}
        orgQueryValue={null}
        selectedPersonId={null}
      />
    );

    expect(screen.getByText("Ari Report")).toBeDefined();
    expect(screen.getByText("Queensland Day")).toBeDefined();
  });
});

function weekRange() {
  return {
    days: Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 3, 13 + index)),
      dayOfWeek: ((index + 1) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      events: index === 2 ? [event()] : [],
      isToday: index === 2,
      publicHolidays:
        index === 2
          ? [
              {
                appliesToAllLocationsInView: true,
                isSuppressed: false,
                locationNames: ["Brisbane"],
                name: "Queensland Day",
              },
            ]
          : [],
    })),
    hasActiveXeroConnection: false,
    people: [],
    range: {
      end: new Date("2026-04-20T00:00:00.000Z"),
      start: new Date("2026-04-13T00:00:00.000Z"),
      timezone: "Australia/Brisbane",
    },
    totalPeopleInScope: 0,
    truncated: false,
    view: "week",
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
