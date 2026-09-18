import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HelpCentrePage from "./page";

describe("Help centre task gateway", () => {
  it("renders one task-led main landmark and one heading", () => {
    const html = renderToStaticMarkup(React.createElement(HelpCentrePage));

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('id="help-centre-main"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("AU Early Access");
  });

  it("links four tasks to stable onboarding phases", () => {
    const html = renderToStaticMarkup(React.createElement(HelpCentrePage));

    for (const phase of ["prepare", "connect", "verify", "publish"]) {
      expect(html).toContain(`href="/help-centre/onboarding#${phase}"`);
    }
  });
});
