import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IntegrationsPage from "./page";

describe("Integrations page", () => {
  it("distinguishes current and planned payroll connections", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html.split('data-status="shipped"')).toHaveLength(2);
    expect(html.split('data-status="planned"')).toHaveLength(6);
    expect(html).toContain("Xero Payroll");
    expect(html).toContain("Australian early access");
    for (const name of [
      "MYOB",
      "Deputy",
      "Tanda",
      "Employment Hero",
      "Acumatica payroll",
    ]) {
      expect(html).toContain(`<h3>${name}</h3>`);
    }
    expect(html).toContain("not available yet");
    expect(html).toContain("New Zealand and United Kingdom");
    expect(html).toContain("Release dates will be shared when confirmed");
  });

  it("keeps functional demonstrations on the features page", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).toContain('href="/features">Explore features</a>');
    expect(html).not.toContain("Illustrative example");
    expect(html).toContain("See planned and unplanned leave in Outlook.");
    expect(html).toContain("Explore the integration connections");
    expect(html).toContain('href="/security">Review security</a>');
    expect(html).not.toContain("availability-example");
    expect(html).toContain("What moves between systems.");
    expect(html).toContain("Never reads");
    expect(html).toContain("Salary, banking, tax, or superannuation data");
    expect(html).toContain("Personal calendar contents");
    expect(html).toContain("Reads from Xero");
    expect(html).toContain("Writes to Xero");
    expect(html).toContain("source of truth for payroll balances");
  });

  it("offers setup guidance and a way to request another system", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).toContain('href="/contact">Request an integration</a>');
    expect(html).toContain(
      'href="/help-centre/onboarding">Read the connection guide</a>'
    );
    expect(html).toContain("payroll or accounting system");
  });
});
