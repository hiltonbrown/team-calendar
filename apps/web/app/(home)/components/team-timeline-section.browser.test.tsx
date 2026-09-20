// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamTimelineSection } from "./team-timeline-section";

const annualLeaveLabel =
  /Sarah Mitchell: Annual leave, Wednesday \d+ \w+ \d{4} to Friday \d+ \w+ \d{4}, Synced from Xero/;
const manualEntryLabel = /\d{4}, Manual entry$/;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TeamTimelineSection interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("exposes named staff groups and standalone date and source labels", () => {
    act(() => root.render(<TeamTimelineSection />));

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

  it("hydrates, changes weeks and exposes selected entry details", () => {
    act(() => {
      root.render(<TeamTimelineSection />);
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
