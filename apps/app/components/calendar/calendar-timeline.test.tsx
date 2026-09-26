import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarTimeline } from "./calendar-timeline";

const HIDDEN_PEOPLE_COPY = /Showing 10 of 12 people in this scope/;

describe("CalendarTimeline", () => {
  afterEach(() => cleanup());

  it("combines coverage pressure, provenance and person lanes", () => {
    render(<CalendarTimeline data={calendarRange()} orgQueryValue={null} />);

    expect(screen.getByRole("heading", { name: "Calendar" })).toBeDefined();
    expect(screen.getByText("Xero leave")).toBeDefined();
    expect(screen.getByText("Manual availability")).toBeDefined();
    expect(screen.getAllByText("Ari Report").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mika Planner").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Annual Leave").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Training").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", {
        name: "Wednesday 15 April: 2 people affected",
      })
    ).toBeDefined();
  });

  it("caps the initial lane set and lets the viewer reveal everyone", () => {
    render(
      <CalendarTimeline
        data={calendarRange({
          people: Array.from({ length: 12 }, (_, index) =>
            person({
              displayName: `Person ${index + 1}`,
              id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            })
          ),
        })}
        orgQueryValue={null}
      />
    );

    expect(screen.getByText(HIDDEN_PEOPLE_COPY)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Show all people" }));
    expect(screen.getAllByText("Person 12").length).toBeGreaterThan(0);
    expect(screen.queryByText(HIDDEN_PEOPLE_COPY)).toBeNull();
  });

  it("renders an honest empty scope state", () => {
    render(
      <CalendarTimeline
        data={{
          ...calendarRange(),
          days: calendarRange().days.map((day) => ({ ...day, events: [] })),
          people: [],
          totalPeopleInScope: 0,
        }}
        orgQueryValue={null}
      />
    );

    expect(
      screen.getByText("No people match this calendar scope.")
    ).toBeDefined();
    expect(
      screen.getAllByText("No recorded unavailability").length
    ).toBeGreaterThan(0);
  });

  it("keeps people without records visible in the runway", () => {
    const data = calendarRange();
    render(
      <CalendarTimeline
        data={{
          ...data,
          people: [
            ...data.people,
            person({
              displayName: "Casey Clear",
              id: "00000000-0000-4000-8000-000000000099",
            }),
          ],
          totalPeopleInScope: 3,
        }}
        orgQueryValue={null}
      />
    );

    expect(screen.getByText("Casey Clear")).toBeDefined();
    expect(
      screen.getAllByText("No recorded unavailability").length
    ).toBeGreaterThan(0);
  });

  it("does not bridge gaps between non-contiguous event days", () => {
    const data = calendarRange();
    const sharedEvent = event({
      displayName: data.people[0]?.displayName ?? "Ari Report",
      id: "shared-event",
      personId: data.people[0]?.id ?? "00000000-0000-4000-8000-000000000001",
      recordType: "annual_leave",
      recordTypeCategory: "xero_leave",
    });
    render(
      <CalendarTimeline
        data={{
          ...data,
          days: data.days.map((day, index) => ({
            ...day,
            events: index === 0 || index === 2 ? [sharedEvent] : [],
          })),
        }}
        orgQueryValue={null}
      />
    );

    expect(
      screen.getAllByRole("button", {
        name: "Ari Report: Annual Leave, Team Calendar leave",
      })
    ).toHaveLength(2);
  });
});

function calendarRange(
  overrides: { people?: ReturnType<typeof person>[] } = {}
) {
  const people = overrides.people ?? [
    person({
      displayName: "Ari Report",
      id: "00000000-0000-4000-8000-000000000001",
    }),
    person({
      displayName: "Mika Planner",
      id: "00000000-0000-4000-8000-000000000002",
    }),
  ];
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 3, 13 + index)),
    dayOfWeek: ((index + 1) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    events: people
      .slice(0, index === 2 ? people.length : 1)
      .map((item, eventIndex) =>
        event({
          displayName: item.displayName,
          id: `event-${item.id}-${index}`,
          personId: item.id,
          recordType: eventIndex % 2 === 0 ? "annual_leave" : "training",
          recordTypeCategory:
            eventIndex % 2 === 0 ? "xero_leave" : "local_only",
        })
      ),
    isToday: index === 2,
    publicHolidays:
      index === 4
        ? [
            {
              appliesToAllLocationsInView: true,
              isSuppressed: false,
              locationNames: ["Brisbane"],
              name: "Queensland Day",
            },
          ]
        : [],
  }));

  return {
    days,
    people,
    range: {
      end: new Date("2026-04-20T00:00:00.000Z"),
      start: new Date("2026-04-13T00:00:00.000Z"),
      timezone: "Australia/Brisbane",
    },
    totalPeopleInScope: people.length,
    truncated: false,
    view: "week",
    xeroConnectionState: "connected",
    xeroSyncFailedCount: 0,
  } as const;
}

function person(overrides: { displayName: string; id: string }) {
  return {
    avatarUrl: null,
    displayName: overrides.displayName,
    firstName: overrides.displayName.split(" ")[0] ?? overrides.displayName,
    id: overrides.id,
    lastName: overrides.displayName.split(" ")[1] ?? "",
    locationName: "Brisbane",
    locationTimezone: "Australia/Brisbane",
    personType: "employee",
    teamName: "Operations",
    xeroSyncFailedCountInRange: 0,
  } as const;
}

function event(overrides: {
  displayName: string;
  id: string;
  personId: string;
  recordType: "annual_leave" | "training";
  recordTypeCategory: "local_only" | "xero_leave";
}) {
  return {
    allDay: true,
    approvalStatus: "approved",
    avatarUrl: null,
    contactabilityStatus: "contactable",
    displayName: overrides.displayName,
    endsAt: new Date("2026-04-16T00:00:00.000Z"),
    id: overrides.id,
    isEditableByActor: true,
    notesInternal: null,
    personId: overrides.personId,
    privacyMode: "named",
    recordType: overrides.recordType,
    recordTypeCategory: overrides.recordTypeCategory,
    renderTreatment: "solid",
    sourceType:
      overrides.recordTypeCategory === "xero_leave"
        ? "team_calendar_leave"
        : "manual",
    startsAt: new Date("2026-04-15T00:00:00.000Z"),
    xeroWriteError: null,
  } as const;
}
