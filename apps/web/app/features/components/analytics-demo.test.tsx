// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsDemo } from "./analytics-demo";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("Connected analytics demo", () => {
  let container: HTMLDivElement;
  let root: Root;
  const click = (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (node) =>
        node.getAttribute("aria-label") === label || node.textContent === label
    );
    if (!button) {
      throw new Error(`Missing button: ${label}`);
    }
    act(() => button.click());
  };
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<AnalyticsDemo />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("connects the initial overlap, chart and selected heatmap cell", () => {
    expect(
      container
        .querySelector('button[aria-label="June 2026: 18% leave utilisation"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");
    const finding = container.querySelector('[aria-live="polite"]');
    expect(finding?.textContent).toContain("2 of 4 available");
    expect(finding?.textContent).toContain("Daniel Chen");
    expect(finding?.textContent).toContain("Amelia Patel");
    expect(
      container
        .querySelector(
          'button[aria-label="Engineering, Wednesday 17 June: 2 of 4 available, overlapping absences"]'
        )
        ?.getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("updates department trends and people together when moving to the next overlap", () => {
    click("Next overlap ");
    expect(container.querySelector("select")?.value).toBe("sales");
    expect(
      container.querySelector('[aria-live="polite"]')?.textContent
    ).toContain("Patrick Nolan");
    expect(
      container.querySelector('[aria-live="polite"]')?.textContent
    ).toContain("Olivia Cooper");
    expect(
      container
        .querySelector('button[aria-label="June 2026: 14% leave utilisation"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("changes month dates and clears an overlap when the selected team is available", () => {
    click("April 2026: 9% leave utilisation");
    expect(
      container.querySelector('[aria-live="polite"]')?.textContent
    ).toContain("4 of 4 available");
    expect(
      container.querySelector('[aria-live="polite"]')?.textContent
    ).toContain("No overlapping absences");
    expect(container.querySelector("thead")?.textContent).toContain("20 Apr");
    expect(
      container.querySelector('svg[role="img"]')?.getAttribute("aria-label")
    ).toContain("April 2026 64 days");
  });
});
