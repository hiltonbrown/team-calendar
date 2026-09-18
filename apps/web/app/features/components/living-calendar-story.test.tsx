import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LivingCalendarStory } from "./living-calendar-story";

describe("LivingCalendarStory", () => {
  it("keeps the complete source-to-calendar narrative available without animation", () => {
    const html = renderToStaticMarkup(React.createElement(LivingCalendarStory));

    expect(html.match(/data-story-beat=/g)).toHaveLength(4);
    expect(html).toContain("Xero Payroll");
    expect(html).toContain("Team Calendar");
    expect(html).toContain("Approval happens with the week in sight");
    expect(html).toContain("Outlook");
    expect(html).toContain("Google");
    expect(html).toContain("Apple");
    expect(html).toContain("Calendar apps refresh on their own schedules");
  });
});
