import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@repo/design-system/components/mode-toggle", () => ({
  ModeToggle: () => React.createElement("button", { type: "button" }, "Theme"),
}));

import { Header } from "./index";

describe("Marketing header", () => {
  beforeEach(() => {
    navigation.pathname = "/";
  });

  it.each([
    "/",
    "/features",
    "/integrations",
    "/pricing",
    "/security",
    "/status",
    "/privacy-policy",
    "/blog/ics-feeds-explained",
    "/help-centre/onboarding",
  ])(
    "places the shared skip link before repeated navigation on %s",
    (pathname) => {
      navigation.pathname = pathname;

      const html = renderToStaticMarkup(React.createElement(Header));
      const skipIndex = html.indexOf('href="#main-content"');
      const headerIndex = html.indexOf('<header class="marketing-site-header"');

      expect(skipIndex).toBeGreaterThan(-1);
      expect(html.match(/Skip to main content/g)).toHaveLength(1);
      expect(skipIndex).toBeLessThan(headerIndex);
    }
  );

  it("renders only the focused menu in every navigation variant", () => {
    navigation.pathname = "/features";

    const html = renderToStaticMarkup(React.createElement(Header));

    expect(html.match(/href="\/"/g)).toHaveLength(4);
    expect(html.match(/href="\/features"/g)).toHaveLength(3);
    expect(html).not.toContain('href="/integrations"');
    expect(html.match(/href="\/pricing"/g)).toHaveLength(3);
    expect(html).not.toContain('href="/about"');
    expect(html).not.toContain('href="/blog"');
    expect(html).not.toContain('href="/help-centre"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(3);
  });
});
