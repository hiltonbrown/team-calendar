import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveHeroSection } from "./components/interactive-hero";
import FeaturesPage from "./page";

const unsupportedTiming = /60 seconds|60-second|within a minute/i;

describe("Features calendar timing", () => {
  it("distinguishes Team Calendar publication from calendar app refreshes", () => {
    const html = renderToStaticMarkup(React.createElement(FeaturesPage));

    expect(html).not.toMatch(unsupportedTiming);
    expect(html).toContain("Calendar apps refresh on");
    expect(html).toContain("their own schedules");
    expect(html).toContain('id="leave-workflow"');
  });

  it("includes the whole team with illustrative statuses and one primary action", () => {
    const html = renderToStaticMarkup(
      React.createElement(InteractiveHeroSection)
    );

    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain("See everyone’s");
    expect(html).toContain("whether they’re on payroll or not");
    for (const group of [
      "Employees",
      "Directors",
      "Subcontractors",
      "Offshore staff",
    ]) {
      expect(html).toContain(`<dt>${group}</dt>`);
    }
    expect(html).toContain("From Xero Payroll");
    expect(html.match(/Shared in Team Calendar/g)).toHaveLength(3);
    expect(html).toContain("Examples of what your team can share");
    expect(html).not.toContain("Availability Sandbox");
    expect(html).not.toContain("See who&#x27;s covered");
    expect(html).not.toContain("<button");
  });
});
