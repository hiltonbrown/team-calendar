import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GuidedOnboardingPage from "./page";

const staleTerms = [
  "organisation switcher",
  "Owner, Admin, Manager, Member",
  "top navigation CTA",
  "location filters",
  "Revoke Token",
  "Clerk Organisation boundary",
];

describe("AU onboarding guide", () => {
  it("uses semantic navigation and ordered procedures", () => {
    const html = renderToStaticMarkup(
      React.createElement(GuidedOnboardingPage)
    );

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("<ol");

    for (const phase of ["prepare", "connect", "verify", "publish"]) {
      expect(html).toContain(`id="${phase}"`);
      expect(html).toContain(`href="#${phase}"`);
    }
  });

  it("states the shipped roles, controls, privacy summaries and recovery action", () => {
    const html = renderToStaticMarkup(
      React.createElement(GuidedOnboardingPage)
    );

    for (const truth of [
      "Owner",
      "Admin",
      "Manager",
      "Viewer",
      "Sync Health",
      "Xero Person Matches",
      "Add leave or availability",
      "New leave request",
      "3 and 1000 characters",
      "Just me",
      "My team",
      "Specific teams",
      "Specific people",
      "All of organisation",
      "Rotate token",
      "Out of office",
      "Busy",
    ]) {
      expect(html).toContain(truth);
    }

    for (const staleTerm of staleTerms) {
      expect(html).not.toContain(staleTerm);
    }
  });
});
