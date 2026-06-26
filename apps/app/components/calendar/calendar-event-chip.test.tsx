import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarEventChip } from "./calendar-event-chip";

describe("CalendarEventChip", () => {
  afterEach(() => cleanup());

  it("renders treatment micro-labels", () => {
    render(
      <>
        <CalendarEventChip
          event={event({ renderTreatment: "dashed" })}
          orgQueryValue={null}
        />
        <CalendarEventChip
          event={event({ id: "2", renderTreatment: "draft" })}
          orgQueryValue={null}
        />
        <CalendarEventChip
          event={event({ id: "3", renderTreatment: "failed" })}
          orgQueryValue={null}
        />
      </>
    );

    expect(screen.getByText("Pending")).toBeDefined();
    expect(screen.getByText("Draft")).toBeDefined();
    expect(screen.getByText("Sync failed")).toBeDefined();
  });

  it("renders masked and private labels from the service", () => {
    render(
      <>
        <CalendarEventChip
          event={event({ displayName: "Team member", id: "masked" })}
          orgQueryValue={null}
        />
        <CalendarEventChip
          event={event({
            displayName: "Unavailable",
            id: "private",
            recordType: "private",
          })}
          orgQueryValue={null}
        />
      </>
    );

    expect(screen.getByText("Team member")).toBeDefined();
    expect(screen.getByText("Unavailable")).toBeDefined();
  });
});

function event(overrides = {}) {
  return {
    allDay: true,
    approvalStatus: "approved",
    avatarUrl: null,
    contactabilityStatus: "contactable",
    displayName: "Ari Report",
    endsAt: new Date("2026-04-16T00:00:00.000Z"),
    id: "1",
    isEditableByActor: true,
    notesInternal: "Note",
    personId: "00000000-0000-4000-8000-000000000011",
    privacyMode: "named",
    recordType: "annual_leave",
    recordTypeCategory: "xero_leave",
    renderTreatment: "solid",
    sourceType: "team_calendar_leave",
    startsAt: new Date("2026-04-15T00:00:00.000Z"),
    xeroWriteError: null,
    ...overrides,
  } as const;
}
