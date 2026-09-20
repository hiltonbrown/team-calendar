import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IntegrationsPage from "./page";

describe("Integrations page", () => {
  it("describes calendar refresh timing without promising client delivery", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).not.toContain("60 seconds");
    expect(html).not.toContain("60-second");
    expect(html).toContain("Calendar apps refresh subscriptions");
    expect(html).toContain("on their own schedules");
  });

  it("links to contact, security and contextual onboarding guidance", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).toContain('href="/contact">Talk to us</a>');
    expect(html).toContain('href="/security">Review security</a>');
    expect(html).toContain(
      'href="/help-centre/onboarding">Read the setup guide</a>'
    );
    expect(html).toContain(
      'href="/help-centre/onboarding#publish">Learn how to subscribe</a>'
    );
  });

  it("explains two-way Xero leave sync alongside other availability in the hero", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));
    const [, heroAndRest = ""] = html.split('data-integrations-section="hero"');
    const [heroHtml = ""] = heroAndRest.split("<section");

    expect(heroHtml).toContain("See who is away");
    expect(heroHtml).toContain("Staff request leave in Team Calendar");
    expect(heroHtml).toContain("Approved leave syncs back to");
    expect(heroHtml).toContain("Xero Payroll Australia");
    expect(heroHtml).toContain("travel, WFH and other availability updates");
    expect(heroHtml).toContain(
      "Employees, approved leave and balances sync from Xero"
    );
    expect(heroHtml).toContain("Leave requests and decisions sync back");
    expect(heroHtml).toContain("Outlook");
    expect(heroHtml).toContain("Google Calendar");
    expect(heroHtml).toContain("Apple Calendar");
    expect(heroHtml).not.toContain("canonical view");
  });

  it("separates data collection scope from credential safeguards", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).not.toContain("Plaintext feed or OAuth tokens");
    expect(html).toContain("Never reads");
    expect(html).toContain("Salary, banking, tax, or superannuation data");
    expect(html).toContain("Personal calendar contents");
    expect(html).toContain("revoke access when needed");
    expect(html).toContain("Xero connection credentials are stored encrypted");
  });

  it("describes only the Xero data that Team Calendar reads", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));
    const lowerHtml = html.toLowerCase();

    expect(lowerHtml).not.toContain("payroll calendar");
    expect(lowerHtml).not.toContain("pay period information");
    expect(html).toContain("Employee records");
    expect(html).toContain("leave applications");
    expect(html).toContain("balances");
  });

  it("renders region status and destinations from the capability model", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).toContain(
      "early access is available for Xero Payroll Australia"
    );
    expect(html).toContain("New Zealand and United Kingdom support is planned");
    expect(html.split('data-status="shipped"')).toHaveLength(2);
    expect(html.split('data-status="planned"')).toHaveLength(3);
    expect(html).toContain("Australian early access");
    expect(html).not.toContain("Supported at launch");
    expect(html.split(">Planned<")).toHaveLength(3);
    expect(html).toContain("Outlook");
    expect(html).toContain("Google Calendar");
    expect(html).toContain("Apple Calendar");
  });
});
