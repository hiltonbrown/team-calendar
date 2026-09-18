import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  supportEmail,
  supportHoursLong,
  supportMailtoHref,
} from "@/src/data/support";
import { ContactPageContent } from "./components/contact-page-content";

describe("Contact page content", () => {
  it("renders one prominent direct-email path with a copyable fallback", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));

    expect(html).toContain("Email our support team");
    expect(html).toContain(
      `href="${supportMailtoHref.replaceAll("&", "&amp;")}"`
    );
    expect(html).toContain(supportEmail);
    expect(html).toContain(supportHoursLong);
    expect(html).toContain("Australian Xero Payroll organisations only");
    expect(html).toContain("before any future paid billing");
  });

  it("explains the product pathway with semantic headings and decorative icons", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('aria-labelledby="contact-panel-title"');
    expect(html).toContain("Connect Xero Payroll securely");
    expect(html).toContain("Bring availability together");
    expect(html).toContain("Publish to your team’s calendars");
    expect(html).toContain("Outlook, Google Calendar, or Apple Calendar");
    expect(html).toContain('aria-hidden="true"');
  });

  it("does not render the retired form or scheduling path", () => {
    const html = renderToStaticMarkup(React.createElement(ContactPageContent));

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Preferred date");
  });
});
