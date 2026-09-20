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

  it("introduces the whole team with one primary action", () => {
    const html = renderToStaticMarkup(
      React.createElement(InteractiveHeroSection)
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain("See everyone’s");
    expect(html).toContain("whether they’re on payroll or not");
    expect(html).toContain("directors, contractors and offshore staff");
  });

  it("retains the teammate comparison and all six Short answers", () => {
    const html = renderToStaticMarkup(React.createElement(FeaturesPage));
    expect(html).toContain("What each kind of teammate can do.");
    expect(html).toContain("Short answers.");
    expect(html.match(/class="ft-faq__q"/g)).toHaveLength(6);
    const matrix = html.slice(
      html.indexOf('class="ft-matrix__table"'),
      html.indexOf("</table>")
    );
    expect(matrix.match(/<tr>/g)).toHaveLength(7);
    expect(html).toContain("On Xero Payroll");
    expect(html).toContain(
      "Read-only feeds for Outlook, Google Calendar and Apple Calendar"
    );
  });
});
