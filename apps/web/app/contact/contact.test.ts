import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { supportHoursLong } from "@/src/data/support";
import { ContactPageContent } from "./components/contact-page-content";

const headingPattern = /<h1/g;
const radioPattern = /type="radio"/g;
describe("Contact page content", () => {
  it("offers all four contact reasons with clear response expectations", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));
    for (const reason of [
      "Make an enquiry",
      "Apply for early access",
      "Get support",
      "Report a bug",
    ]) {
      expect(html).toContain(reason);
    }
    expect(html.match(radioPattern)).toHaveLength(4);
    expect(html).toContain(supportHoursLong);
    expect(html.match(headingPattern)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="contact-panel-title"');
  });

  it("preserves eligibility and retention disclosures on the admission entry point", () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactPageContent, { initialType: "early-access" })
    );
    expect(html).toContain("Xero Payroll Australia");
    expect(html).toContain("Applying does not grant immediate access");
    expect(html).toContain("removed after 90 days");
  });

  it("collects bounded contact details with optional confirmation and no attachment control", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));
    expect(html).toContain("<form");
    expect(html).toContain('maxLength="5000"');
    expect(html).toContain("Email me a confirmation");
    expect(html).not.toContain('type="file"');
    expect(html).toContain("private calendar feed links");
  });
});
