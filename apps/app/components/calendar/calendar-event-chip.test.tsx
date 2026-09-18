import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarEventChip } from "./calendar-event-chip";

const LEAVE_EVENT_NAME =
  /Ari Report, Annual leave.*Source: Team Calendar leave.*Status: Approved/i;
const MANUAL_EVENT_NAME =
  /Kai Manual, Training.*Source: Manual availability.*Status: Approved/i;
const FAILED_EVENT_NAME = /Ari Report, Annual leave.*Status: Sync failed/i;

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

  it("pairs provenance icons with accessible source labels", () => {
    render(
      <>
        <CalendarEventChip event={event()} orgQueryValue={null} />
        <CalendarEventChip
          event={event({
            displayName: "Kai Manual",
            id: "manual",
            recordType: "training",
            recordTypeCategory: "local_only",
            sourceType: "manual",
          })}
          orgQueryValue={null}
        />
      </>
    );

    const leave = screen.getByRole("button", {
      name: LEAVE_EVENT_NAME,
    });
    const manual = screen.getByRole("button", {
      name: MANUAL_EVENT_NAME,
    });

    expect(leave.querySelector(".lucide-leaf")).not.toBeNull();
    expect(manual.querySelector(".lucide-pencil")).not.toBeNull();
  });

  it("includes failed exception state in the complete accessible name", () => {
    render(
      <CalendarEventChip
        event={event({ renderTreatment: "failed" })}
        orgQueryValue={null}
      />
    );

    expect(
      screen.getByRole("button", {
        name: FAILED_EVENT_NAME,
      })
    ).toBeDefined();
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
