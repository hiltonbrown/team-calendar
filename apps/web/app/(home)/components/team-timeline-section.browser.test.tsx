// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamTimelineSection } from "./team-timeline-section";

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

    expect(entryButton.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".tl-detail")?.textContent).toContain(
      "Sarah Mitchell"
    );
    expect(container.querySelector(".tl-detail")?.textContent).toContain(
      "Manual entry"
    );
  });
});
