import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { supportHoursLong } from "@/src/data/support";
import { ContactPageContent } from "./components/contact-page-content";

describe("Contact page content", () => {
  it("renders the Australian early access application and response expectations", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));
    expect(html).toContain("Apply for Australian early access");
    expect(html).toContain("Apply for early access");
    expect(html).toContain(supportHoursLong);
    expect(html).toContain("Australian Xero Payroll organisations only");
    expect(html).toContain("removed after 90 days");
  });

  it("explains the product pathway with semantic headings", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="contact-panel-title"');
    expect(html).toContain("Connect Xero Payroll securely");
    expect(html).toContain("Bring availability together");
    expect(html).toContain("Publish to your team’s calendars");
  });

  it("collects bounded application fields without an attachment control", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));
    expect(html).toContain("<form");
    expect(html).toContain('maxLength="1000"');
    expect(html).not.toContain('type="file"');
  });
});
