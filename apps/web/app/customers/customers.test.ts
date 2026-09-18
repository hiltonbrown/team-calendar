import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CustomersPage, { metadata } from "./page";

const fabricatedProofPattern = /case study|testimonial|customer quote/i;
const applicationActionPattern = />Apply(?:<|\s)/i;
const malformedProposition = [
  "The Xero Payroll small businesses",
  "Team Calendar is built for",
].join(" ");

describe("Who it’s for page", () => {
  it("publishes the truthful Australian early-access identity", () => {
    const html = renderToStaticMarkup(React.createElement(CustomersPage));
    const metadataJson = JSON.stringify(metadata);

    expect(metadataJson).toContain("Who it’s for | Team Calendar");
    expect(metadataJson).toContain("Australian Xero Payroll businesses");
    expect(metadataJson).toContain('"canonical":"/customers"');
    expect(metadataJson).toContain('"url":"/customers"');
    expect(metadataJson).toContain('"locale":"en_AU"');
    expect(html).toContain("Australian closed early access");
    expect(html).toContain("initial guided cohort");
    expect(html).toContain("8–30 people");
    expect(html).toContain("Larger teams and multi-entity businesses");
  });

  it("renders one focusable main landmark and a logical heading structure", () => {
    const html = renderToStaticMarkup(React.createElement(CustomersPage));

    expect(html.match(/<main/g) ?? []).toHaveLength(1);
    expect(html).toContain('<main class="fmkt-page');
    expect(html).toContain('id="customers-main" tabindex="-1"');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Who it’s for");
    expect(html).not.toContain(">Customers<");
  });

  it("shows the three fit dimensions with decorative icons", () => {
    const html = renderToStaticMarkup(React.createElement(CustomersPage));

    expect(html).toContain("Team size and admin burden");
    expect(html).toContain("Calendar-led planning");
    expect(html).toContain("Mixed payroll and non-payroll availability");
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("explains the product workflow in source-to-destination order", () => {
    const html = renderToStaticMarkup(React.createElement(CustomersPage));
    const workflowHtml = html.slice(html.indexOf("<ol"));
    const xeroIndex = workflowHtml.indexOf("Xero Payroll");
    const teamCalendarIndex = workflowHtml.indexOf("Team Calendar");
    const destinationsIndex = workflowHtml.indexOf(
      "Outlook, Google Calendar and Apple Calendar"
    );

    expect(xeroIndex).toBeGreaterThan(-1);
    expect(teamCalendarIndex).toBeGreaterThan(xeroIndex);
    expect(destinationsIndex).toBeGreaterThan(teamCalendarIndex);
  });

  it("offers the approved actions without fabricated proof or application copy", () => {
    const html = renderToStaticMarkup(React.createElement(CustomersPage));

    expect(html).toContain('href="/contact">Talk to us</a>');
    expect(html).toContain('href="/integrations">See how it works</a>');
    expect(html).not.toContain(malformedProposition);
    expect(html).not.toMatch(fabricatedProofPattern);
    expect(html).not.toMatch(applicationActionPattern);
  });
});
