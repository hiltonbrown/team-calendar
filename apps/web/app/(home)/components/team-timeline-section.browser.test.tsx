// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LivingCalendarStory } from "../../features/components/living-calendar-story";
import { TeamTimelineSection } from "./team-timeline-section";

const annualLeaveLabel =
  /Sarah Mitchell: Annual leave, Wednesday \d+ \w+ \d{4} to Friday \d+ \w+ \d{4}, Synced from Xero/;
const manualEntryLabel = /\d{4}, Manual entry$/;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe.each([
  ["Homepage", TeamTimelineSection],
  ["Features", LivingCalendarStory],
])("%s calendar interactions", (_surface, Calendar) => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 0, 1, 12));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("exposes named staff groups and standalone date and source labels", () => {
    act(() => root.render(<Calendar />));

    expect(
      container.querySelectorAll(
        '[role="table"], [role="row"], [role="columnheader"], [role="rowheader"]'
      )
    ).toHaveLength(0);
    const sarahEntries = container.querySelector(
      '[role="group"][aria-label="Sarah Mitchell, HR lead: availability"]'
    );
    expect(sarahEntries).not.toBeNull();
    const annualLeave = sarahEntries?.querySelector(
      'button[aria-label*="Annual leave"]'
    );
    expect(annualLeave?.getAttribute("aria-label")).toMatch(annualLeaveLabel);
  });

  it("keeps staff, departments and dates consistent across a year boundary", () => {
    act(() => root.render(<Calendar />));
    expect(container.querySelector(".tl-week-label")?.textContent).toBe(
      "Mon 28 Dec to Sun 3 Jan"
    );
    expect(container.querySelector(".tl-week-sub")?.textContent).toBe(
      "This week · 2026–2027"
    );
    expect(
      Array.from(
        container.querySelectorAll(".tl-staff-name"),
        (node) => node.textContent
      )
    ).toEqual([
      "Sarah Mitchell",
      "Daniel Chen",
      "Patrick Nolan",
      "James O'Connor",
      "Mia Tanaka",
      "Ruben Park",
    ]);
    expect(
      Array.from(
        container.querySelectorAll(".tl-staff-role"),
        (node) => node.textContent
      )
    ).toEqual([
      "HR lead",
      "Engineering",
      "Sales",
      "Operations",
      "Design",
      "Support",
    ]);
    const leave = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Sarah Mitchell: Annual leave"]'
    );
    expect(leave?.getAttribute("aria-label")).toBe(
      "Sarah Mitchell: Annual leave, Wednesday 30 December 2026 to Friday 1 January 2027, Synced from Xero"
    );
    expect(container.querySelectorAll(".tl-day-head")).toHaveLength(7);
  });

  it("hydrates, changes weeks and exposes selected entry details", () => {
    act(() => {
      root.render(<Calendar />);
    });

    expect(container.querySelector(".tl-card--skeleton")).toBeNull();
    expect(container.querySelector(".tl-week-sub")?.textContent).toContain(
      "This week"
    );

    const nextButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Next week"]'
    );
    if (!nextButton) {
      throw new Error("Expected the next-week control to render");
    }
    act(() => nextButton.click());
    expect(container.querySelector(".tl-week-sub")?.textContent).toContain(
      "Next week"
    );

    const entryButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Sarah Mitchell: Working from home"]'
    );
    if (!entryButton) {
      throw new Error("Expected Sarah Mitchell's leave entry to render");
    }
    act(() => entryButton.click());

    expect(entryButton.getAttribute("aria-expanded")).toBe("true");
    expect(entryButton.getAttribute("aria-label")).toMatch(manualEntryLabel);
    const details = document.getElementById(
      entryButton.getAttribute("aria-controls") ?? ""
    );
    expect(details?.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector(".tl-detail")?.textContent).toContain(
      "Sarah Mitchell"
    );
    expect(container.querySelector(".tl-detail")?.textContent).toContain(
      "Manual entry"
    );

    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close details"]'
    );
    if (!closeButton) {
      throw new Error("Expected the details close control to render");
    }
    closeButton.focus();
    act(() => closeButton.click());
    expect(document.activeElement).toBe(entryButton);
    expect(entryButton.getAttribute("aria-expanded")).toBe("false");
    expect(details?.textContent).toContain("Select any entry above");
  });
});
