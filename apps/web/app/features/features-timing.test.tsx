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

  it("keeps the hero to one promise, proof sentence and primary action", () => {
    const html = renderToStaticMarkup(
      React.createElement(InteractiveHeroSection)
    );

    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain("Every absence");
    expect(html).toContain("off-payroll availability");
    expect(html).not.toContain("Availability Sandbox");
    expect(html).not.toContain("See who&#x27;s covered");
    expect(html).not.toContain("<button");
  });
});
