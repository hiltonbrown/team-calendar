import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarEventPopover } from "./calendar-event-popover";

const CORRELATION_COPY = /correlation/i;
const HTTP_STATUS_COPY = /HTTP 500/i;

describe("CalendarEventPopover", () => {
  afterEach(() => cleanup());

  it("renders authorised fields and the edit link", async () => {
    render(
      <CalendarEventPopover event={event()} orgQueryValue={null}>
        <button type="button">Open</button>
      </CalendarEventPopover>
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByText("Ari Report")).toBeDefined();
    expect(screen.getByText("Annual Leave")).toBeDefined();
    expect(screen.getByText("Note")).toBeDefined();
    expect(screen.getByRole("link", { name: "View plan" })).toBeDefined();
  });

  it("shows plain Xero errors without raw details", async () => {
    render(
      <CalendarEventPopover
        event={{
          ...event(),
          renderTreatment: "failed",
          xeroWriteError: "Xero could not save this leave.",
        }}
        orgQueryValue={null}
      >
        <button type="button">Open</button>
      </CalendarEventPopover>
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(
      await screen.findByText("Xero could not save this leave.")
    ).toBeDefined();
    expect(screen.queryByText(CORRELATION_COPY)).toBeNull();
    expect(screen.queryByText(HTTP_STATUS_COPY)).toBeNull();
  });
});

function event() {
  return {
    allDay: true,
    approvalStatus: "approved",
    avatarUrl: null,
    contactabilityStatus: "contactable",
    displayName: "Ari Report",
    endsAt: new Date("2026-04-16T00:00:00.000Z"),
    id: "00000000-0000-4000-8000-000000000099",
    isEditableByActor: true,
    notesInternal: "Note",
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
