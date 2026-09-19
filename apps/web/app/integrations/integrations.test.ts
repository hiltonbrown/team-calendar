import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IntegrationsPage from "./page";

describe("Integrations page", () => {
  it("describes calendar refresh timing without promising client delivery", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).not.toContain("60 seconds");
    expect(html).not.toContain("60-second");
    expect(html).toContain("calendar clients refresh subscribed feeds");
    expect(html).toContain("on their own schedules");
  });

  it("links to the canonical contact and security routes", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).toContain('href="/contact">Talk to us</a>');
    expect(html).toContain('href="/security">Review security</a>');
  });

  it("assigns the hero outcome, problem, and mechanism distinct copy", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));
    const [, heroAndRest = ""] = html.split('data-integrations-section="hero"');
    const [heroHtml = ""] = heroAndRest.split("<section");

    expect(heroHtml).toContain("See who is away");
    expect(heroHtml).toContain("Stop piecing together leave and availability");
    expect(heroHtml).toContain("Xero Payroll Australia");
    expect(heroHtml).toContain("manual availability");
    expect(heroHtml).toContain("secure ICS feeds");
    expect(heroHtml).toContain("Outlook");
    expect(heroHtml).toContain("Google Calendar");
    expect(heroHtml).toContain("Apple Calendar");
    expect(heroHtml).not.toContain("canonical view");
  });

  it("separates data collection scope from credential safeguards", () => {
    const html = renderToStaticMarkup(React.createElement(IntegrationsPage));

    expect(html).not.toContain("Plaintext feed or OAuth tokens");
    expect(html).toContain("OAuth tokens are encrypted at rest");
    expect(html).toContain("feed tokens are signed and revocable");
    expect(html).toContain("stay out of client-side code");
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
