import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LivingCalendarStory } from "./living-calendar-story";

describe("LivingCalendarStory", () => {
  it("keeps the demo and clear instructions for exploring entries", () => {
    const html = renderToStaticMarkup(React.createElement(LivingCalendarStory));
    expect(html).toContain("Explore a team’s week.");
    expect(html).toContain("Xero Payroll");
    expect(html).toContain("Team Calendar");
    expect(html).toContain("Select an entry");
    expect(html).toContain("Sarah Mitchell");
    expect(html).toContain("Engineering");
  });
});
