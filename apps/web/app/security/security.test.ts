import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SecurityPage from "./page";

const renderPage = () =>
  renderToStaticMarkup(React.createElement(SecurityPage));

describe("Security evidence surface", () => {
  it("renders one focusable main and a reviewed evidence summary", () => {
    const html = renderPage();

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('id="security-main"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Trust and safeguards");
    expect(html).toContain('dateTime="2026-08-30"');
  });

  it("offers four assessor topics and a semantic ordered data flow", () => {
    const html = renderPage();

    for (const topic of [
      "Who can access data?",
      "How is data protected?",
      "Where does data move and live?",
      "What happens when something goes wrong?",
    ]) {
      expect(html).toContain(topic);
    }
    expect(html.match(/data-security-topic="true"/g)).toHaveLength(4);
    expect(html).toContain("<ol");
    expect(html).toContain("Xero Payroll");
    expect(html).toContain("Team Calendar tenant boundary");
    expect(html).toContain("Privacy projection");
    expect(html).toContain("Subscribed calendars");
  });

  it("states only implemented storage, feed and provider controls", () => {
    const html = renderPage();

    expect(html).toContain("Neon PostgreSQL");
    expect(html).toContain("AES-256-GCM");
    expect(html).toContain("Redis/KV");
    expect(html).toContain("stricter of the feed and record privacy modes");
    expect(html).toContain("include_in_feed");
    expect(html).toContain("depend on deployed account configuration");
    expect(html).not.toContain("not possible");
    expect(html).not.toContain("All data is encrypted at rest");
    expect(html).not.toContain("leave categories");
    expect(html).not.toContain("not intentionally replicated");
  });

  it("separates assessment, privacy and private reporting paths", () => {
    const html = renderPage();

    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/privacy-policy"');
    expect(html).toContain(
      'href="https://github.com/hiltonbrown/team-calendar/security/advisories/new"'
    );
    expect(html).toContain("within two business days");
    expect(html).toContain("within five business days");
    expect(html).not.toContain("security@teamcalendar.online");
  });
});
