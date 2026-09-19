import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage, { metadata } from "./page";

const placeholderPattern = new RegExp(
  ["PEND", "ING|on the ", "way|#linkedin-", "pend", "ing"].join(""),
  "i"
);

describe("About page", () => {
  it("publishes Australian About metadata and one focusable main landmark", () => {
    const html = renderToStaticMarkup(React.createElement(AboutPage));
    const metadataJson = JSON.stringify(metadata);

    expect(html.match(/<main/g) ?? []).toHaveLength(1);
    expect(html).toContain('id="main-content" tabindex="-1"');
    expect(html.match(/<h1/g) ?? []).toHaveLength(1);
    expect(metadataJson).toContain('"canonical":"/about"');
    expect(metadataJson).toContain('"url":"/about"');
    expect(metadataJson).toContain('"locale":"en_AU"');
  });

  it("uses peer sections and subordinate product and person headings", () => {
    const html = renderToStaticMarkup(React.createElement(AboutPage));

    expect(html).toContain("A narrow product, by design.");
    expect(html).toContain("The people behind the product.");
    expect(html).toContain("Choose the next useful step.");
    expect(html).toContain("Xero leave");
    expect(html).toContain("Manual availability");
    expect(html).toContain("Hilton Brown");
    expect(html.match(/<h2/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html.match(/<h3/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("renders the approved LinkedIn destination and honest identity material", () => {
    const html = renderToStaticMarkup(React.createElement(AboutPage));

    expect(html).toContain('href="https://www.linkedin.com/in/hiltonbrown/"');
    expect(html).not.toContain("Preview biography");
    expect(html).not.toContain("Preview profile");
    expect(html).toContain("built and run on the Gold Coast");
    expect(html).not.toContain("illustrative founder portrait");
    expect(html).not.toContain("Chief Availability Tester");
    expect(html).not.toContain("%2Fmarketing%2Fhilton-brown.webp");
    expect(html).not.toContain("%2Fmarketing%2Fconnie.webp");
    expect(html).not.toMatch(placeholderPattern);
  });

  it("shows the product boundary and approved final actions", () => {
    const html = renderToStaticMarkup(React.createElement(AboutPage));

    expect(html).toContain("Xero Payroll");
    expect(html).toContain("privacy-controlled calendar view");
    expect(html).toContain("Outlook");
    expect(html).toContain("Google Calendar");
    expect(html).toContain("Apple Calendar");
    expect(html).toContain('href="/contact">Talk to us</a>');
    expect(html).toContain('href="/integrations">View integrations</a>');
  });
});
