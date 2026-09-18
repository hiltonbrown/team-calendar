import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CareersPage from "./page";

const oldRegionalClaim =
  "across Australia, New Zealand, and the United Kingdom";
const careersMailtoPattern =
  /href="(mailto:careers@teamcalendar\.online(?:\?subject=[^"]+)?)"/;

describe("Careers applicant surface", () => {
  it("exposes one focusable main, one heading and the candid vacancy state", () => {
    const html = renderToStaticMarkup(React.createElement(CareersPage));

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('id="careers-main"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("We do not have open roles or a hiring timeline");
    expect(html).toContain("confirmed roles will be listed here");
  });

  it("renders exactly three factual working practices with decorative icons", () => {
    const html = renderToStaticMarkup(React.createElement(CareersPage));

    expect(html).toContain("How we work");
    expect(html.match(/data-careers-practice="true"/g)).toHaveLength(3);
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("Reduce the problem before adding features");
    expect(html).toContain("Stay close to payroll operations");
    expect(html).toContain("Protect trust in the details");
    expect(html).not.toContain(oldRegionalClaim);
  });

  it("offers one explicit, low-data email introduction path", () => {
    const html = renderToStaticMarkup(React.createElement(CareersPage));
    const mailtoMatch = html.match(careersMailtoPattern);

    expect(mailtoMatch?.[1]).toBeDefined();
    expect(html).toContain("careers@teamcalendar.online");
    expect(html).toContain("Introduce yourself by email");
    expect(html).toContain("marketing-btn marketing-btn--primary");
    expect(html).toContain("which discipline is closest to your work");
    expect(html).toContain(
      "include a link to work you are comfortable sharing"
    );
    expect(html).toContain("Please do not send identity documents");
  });

  it("uses the page-owned one-or-three-column practice layout", () => {
    const html = renderToStaticMarkup(React.createElement(CareersPage));

    expect(html).toContain("practiceGrid");
    expect(html).not.toContain("marketing-simple__grid--two");
  });
});
